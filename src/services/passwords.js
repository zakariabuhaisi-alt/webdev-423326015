// Password hashing with scrypt, which is built into Node: no dependency to explain.
// scrypt is deliberately slow and memory-hungry, so guessing passwords from a stolen
// table is expensive. The random salt makes two equal passwords hash differently.
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/** stored as "scrypt:<salt>:<hash>" (hex), so the format can change later without guessing */
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return ['scrypt', salt, hash.toString('hex')].join(':');
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hex] = String(stored).split(':');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await scryptAsync(password, salt, KEY_LENGTH);
  // timingSafeEqual takes the same time wherever the bytes differ,
  // so the response time does not leak how close a guess was.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword };
