// Sign-up, sign-in, sessions and Google linking. Every rule about WHO someone is lives here.
const { createHash, randomBytes } = require('node:crypto');
const { invalid, unauthenticated, forbidden, conflict, requireUser } = require('./errors');
const { hashPassword, verifyPassword } = require('./passwords');

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_DAYS = { web: 7, mcp: 30 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// One message for "no such email" and "wrong password", so nobody can probe which emails have accounts.
const WRONG = 'Email or password is wrong.';

/** the database stores only a hash of the token, so a leaked sessions table cannot be used to sign in */
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** what may leave the service: never the password hash */
function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    hasPassword: Boolean(row.password_hash),
    hasGoogle: Boolean(row.google_sub),
  };
}

function authService({ data, now = () => new Date() }) {
  async function startSession(user, kind = 'web') {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now().getTime() + SESSION_DAYS[kind] * DAY_MS);
    await data.sessions.create({ tokenHash: hashToken(token), userId: user.id, kind, expiresAt });
    return { user: publicUser(user), token, expiresAt };
  }

  return {
    async signUp({ email, password, name } = {}) {
      const cleanEmail = String(email ?? '').trim().toLowerCase();
      const cleanName = String(name ?? '').trim();
      if (!EMAIL.test(cleanEmail)) throw invalid('Enter a valid email address.');
      if (String(password ?? '').length < 8) throw invalid('The password needs at least 8 characters.');
      if (!cleanName) throw invalid('Enter your name.');
      if (await data.users.findByEmail(cleanEmail)) throw conflict('An account with this email already exists.');
      const user = await data.users.create({
        email: cleanEmail,
        name: cleanName,
        passwordHash: await hashPassword(String(password)),
      });
      return startSession(user);
    },

    async signIn({ email, password } = {}) {
      const user = await data.users.findByEmail(String(email ?? '').trim().toLowerCase());
      // An account created through Google has no password, and must not accept any.
      if (!user || !user.password_hash) throw unauthenticated(WRONG);
      if (!(await verifyPassword(String(password ?? ''), user.password_hash))) throw unauthenticated(WRONG);
      return startSession(user);
    },

    /**
     * Google sign-in. The profile comes from Google's id_token (src/auth/google-oauth.js).
     * Linking rule: an existing local account is joined to a Google identity ONLY when
     * Google says it verified the email. Otherwise anyone could make a Google account
     * with somebody else's address and walk into their ClubHub account.
     */
    async signInWithGoogle({ sub, email, emailVerified, name } = {}) {
      if (!sub) throw invalid('Google did not say who you are.');
      let user = await data.users.findByGoogleSub(sub);
      if (!user) {
        if (!emailVerified) {
          throw forbidden('Google has not verified this email address, so we cannot sign you in with it.');
        }
        const cleanEmail = String(email).trim().toLowerCase();
        const existing = await data.users.findByEmail(cleanEmail);
        user = existing
          ? await data.users.linkGoogle(existing.id, sub)
          : await data.users.create({ email: cleanEmail, name: String(name || cleanEmail), googleSub: sub });
      }
      return startSession(user);
    },

    /** the person behind a cookie or an MCP token, or null */
    async userFromToken(token) {
      if (!token) return null;
      const user = await data.sessions.findUser(hashToken(token));
      return user ? publicUser(user) : null;
    },

    async signOut(token) {
      if (token) await data.sessions.remove(hashToken(token));
    },

    /** a longer-lived token for the MCP server: it acts as this person and nobody else */
    async createMcpToken(user) {
      requireUser(user);
      const full = await data.users.findById(user.id);
      return startSession(full, 'mcp');
    },
  };
}

module.exports = { authService, hashToken, publicUser };
