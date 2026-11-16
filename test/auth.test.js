// Sign-up, sign-in and sessions: the service rules, and the HTTP behaviour on top of them.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { world, httpWorld } = require('./helpers');
const { authService } = require('../src/services/auth');
const { verifyPassword, hashPassword } = require('../src/services/passwords');

describe('auth service', () => {
  let w;
  before(async () => { w = await world(); });
  after(() => w.db.close());

  test('AC-1 a new user signs up, the password is stored only as a hash, and a session starts', async () => {
    const { user, token } = await w.services.auth.signUp({ email: ' New@Test.dev ', password: 'secret-pass', name: 'Nia' });
    assert.equal(user.email, 'new@test.dev');
    assert.ok(token.length > 30);
    const row = await w.data.users.findByEmail('new@test.dev');
    assert.notEqual(row.password_hash, 'secret-pass');
    assert.match(row.password_hash, /^scrypt:/);
    assert.equal(await verifyPassword('secret-pass', row.password_hash), true);
    assert.equal(user.password_hash, undefined, 'the hash never leaves the service');
    assert.deepEqual(await w.services.auth.userFromToken(token), user);
  });

  test('AC-1 sign-up input is validated', async () => {
    await assert.rejects(w.services.auth.signUp({ email: 'nope', password: 'password123', name: 'A' }), { kind: 'invalid' });
    await assert.rejects(w.services.auth.signUp({ email: 'a@b.cd', password: 'short', name: 'A' }), { kind: 'invalid' });
    await assert.rejects(w.services.auth.signUp({ email: 'a@b.cd', password: 'password123', name: '  ' }), { kind: 'invalid' });
    await assert.rejects(w.services.auth.signUp(), { kind: 'invalid' });
    await assert.rejects(w.services.auth.signUp({ email: 'a@b.cd', name: 'A' }), { kind: 'invalid' });
  });

  test('AC-2 signing up again with the same email is refused and no second user appears', async () => {
    const before = await w.data.users.count();
    await assert.rejects(
      w.services.auth.signUp({ email: 'OLGA@test.dev', password: 'password123', name: 'Olga again' }),
      { kind: 'conflict', message: 'An account with this email already exists.' },
    );
    assert.equal(await w.data.users.count(), before);
  });

  test('AC-3 a wrong password or unknown email is refused with the same message and no session', async () => {
    const sessions = await w.data.sessions.countForUser(w.member.id);
    const wrong = { kind: 'unauthenticated', message: 'Email or password is wrong.' };
    await assert.rejects(w.services.auth.signIn({ email: 'mihail@test.dev', password: 'not-it-at-all' }), wrong);
    await assert.rejects(w.services.auth.signIn({ email: 'ghost@test.dev', password: 'password123' }), wrong);
    await assert.rejects(w.services.auth.signIn(), wrong);
    await assert.rejects(w.services.auth.signIn({ email: 'mihail@test.dev' }), wrong);
    assert.equal(await w.data.sessions.countForUser(w.member.id), sessions);
    const ok = await w.services.auth.signIn({ email: 'Mihail@test.dev', password: 'password123' });
    assert.equal(ok.user.id, w.member.id);
  });

  test('AC-3 an account created through Google has no password and accepts none', async () => {
    await w.data.users.create({ email: 'gonly@test.dev', name: 'G', googleSub: 'g-only' });
    await assert.rejects(w.services.auth.signIn({ email: 'gonly@test.dev', password: '' }), { kind: 'unauthenticated' });
  });

  test('sessions end on sign-out and after they expire', async () => {
    const { token } = await w.services.auth.signIn({ email: 'mihail@test.dev', password: 'password123' });
    await w.services.auth.signOut(token);
    assert.equal(await w.services.auth.userFromToken(token), null);
    await w.services.auth.signOut(undefined); // signing out with no cookie is harmless
    assert.equal(await w.services.auth.userFromToken(undefined), null);

    const past = authService({ data: w.data, now: () => new Date(Date.now() - 8 * 86400000) });
    const old = await past.signIn({ email: 'mihail@test.dev', password: 'password123' });
    assert.equal(await w.services.auth.userFromToken(old.token), null, 'a 7-day session from 8 days ago is expired');
  });

  test('an MCP token acts as its owner and needs a signed-in owner to create', async () => {
    const { token, expiresAt } = await w.services.auth.createMcpToken(w.member);
    assert.equal((await w.services.auth.userFromToken(token)).id, w.member.id);
    assert.ok(expiresAt.getTime() - Date.now() > 29 * 86400000);
    await assert.rejects(w.services.auth.createMcpToken(null), { kind: 'unauthenticated' });
  });

  test('a stored hash in an unknown format never verifies', async () => {
    assert.equal(await verifyPassword('x', 'md5:abc:def'), false);
    assert.equal(await verifyPassword('x', null), false);
    assert.notEqual(await hashPassword('same'), await hashPassword('same'), 'salted');
  });
});

describe('auth over HTTP', () => {
  let h;
  before(async () => { h = await httpWorld(); });
  after(() => h.close());

  test('AC-1 POST /api/auth/signup answers 201 and sets an HttpOnly, SameSite session cookie', async () => {
    const res = await h.call('POST', '/api/auth/signup', { body: { email: 'web@test.dev', password: 'password123', name: 'Web' } });
    assert.equal(res.status, 201);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /^sid=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const me = await h.call('GET', '/api/me', { cookie: cookie.split(';')[0] });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'web@test.dev');
  });

  test('AC-2 a duplicate sign-up answers 409 with a readable message', async () => {
    const res = await h.call('POST', '/api/auth/signup', { body: { email: 'olga@test.dev', password: 'password123', name: 'X' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'An account with this email already exists.');
  });

  test('AC-3 a wrong password answers 401 and sets no cookie', async () => {
    const res = await h.call('POST', '/api/auth/signin', { body: { email: 'olga@test.dev', password: 'wrong-password' } });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  test('sign-out clears the cookie and the session', async () => {
    const cookie = await h.cookieFor('mihail@test.dev');
    const out = await h.call('POST', '/api/auth/signout', { cookie, body: {} });
    assert.equal(out.status, 204);
    assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await h.call('GET', '/api/me', { cookie })).status, 401);
  });

  test('a write that is not JSON is refused with 415 (CSRF defence in depth)', async () => {
    const res = await h.call('POST', '/api/auth/signin', { body: 'email=a&password=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(res.status, 415);
  });

  test('POST /api/me/mcp-token needs a session', async () => {
    assert.equal((await h.call('POST', '/api/me/mcp-token', { body: {} })).status, 401);
    const cookie = await h.cookieFor('mihail@test.dev');
    const res = await h.call('POST', '/api/me/mcp-token', { cookie, body: {} });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
  });
});
