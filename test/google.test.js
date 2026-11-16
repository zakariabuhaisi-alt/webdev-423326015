// Sign in with Google: the linking rule in the service, and the OAuth flow with a fake Google.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { world, httpWorld } = require('./helpers');
const { startGoogleSignIn, finishGoogleSignIn, packFlow, unpackFlow, decodeJwtPayload } = require('../src/auth/google-oauth');

const CLIENT = 'client-123.apps.googleusercontent.com';
const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const claims = (over = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, sub: 'g-1', email: 'x@test.dev', email_verified: true, name: 'X', ...over });
/** a stand-in for Google's token endpoint */
const fakeGoogle = (body, status = 200) => async () => ({ ok: status === 200, status, json: async () => body });

describe('Google linking rule', () => {
  let w;
  before(async () => { w = await world(); });
  after(() => w.db.close());

  test('AC-13 a verified Google email that matches a local account signs into THAT account and links it', async () => {
    const { user } = await w.services.auth.signInWithGoogle({ sub: 'g-mihail', email: 'Mihail@test.dev', emailVerified: true, name: 'M' });
    assert.equal(user.id, w.member.id);
    assert.equal(user.hasGoogle, true);
    assert.equal(user.hasPassword, true, 'both ways in still work');
    const again = await w.services.auth.signInWithGoogle({ sub: 'g-mihail', email: 'changed@test.dev', emailVerified: false });
    assert.equal(again.user.id, w.member.id, 'next time the Google id alone is enough');
  });

  test('AC-13 a verified Google email with no account creates one', async () => {
    const { user } = await w.services.auth.signInWithGoogle({ sub: 'g-new', email: 'fresh@test.dev', emailVerified: true, name: '' });
    assert.equal(user.email, 'fresh@test.dev');
    assert.equal(user.name, 'fresh@test.dev');
    assert.equal(user.hasPassword, false);
  });

  test('AC-14 an unverified Google email is refused and does not take over the local account', async () => {
    await assert.rejects(
      w.services.auth.signInWithGoogle({ sub: 'g-attacker', email: 'olga@test.dev', emailVerified: false }),
      { kind: 'forbidden' },
    );
    const olga = await w.data.users.findByEmail('olga@test.dev');
    assert.equal(olga.google_sub, null);
    await assert.rejects(w.services.auth.signInWithGoogle({}), { kind: 'invalid' });
    await assert.rejects(w.services.auth.signInWithGoogle(), { kind: 'invalid' });
  });
});

describe('Google OAuth flow', () => {
  test('the start URL carries state and a PKCE S256 challenge', () => {
    const flow = startGoogleSignIn({ clientId: CLIENT, redirectUri: 'http://localhost/cb' });
    const url = new URL(flow.url);
    assert.equal(url.searchParams.get('state'), flow.state);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.notEqual(url.searchParams.get('code_challenge'), flow.verifier, 'the verifier itself never leaves the server');
  });

  test('the signed flow cookie cannot be forged', () => {
    const packed = packFlow({ state: 's', verifier: 'v' }, 'secret-secret-secret');
    assert.deepEqual(unpackFlow(packed, 'secret-secret-secret'), { state: 's', verifier: 'v' });
    assert.equal(unpackFlow(packed, 'another-secret-xxxx'), null);
    assert.equal(unpackFlow(`${packed}x`, 'secret-secret-secret'), null);
    assert.equal(unpackFlow('', 'secret-secret-secret'), null);
    assert.equal(unpackFlow(undefined, 's'), null);
    const notJson = `${Buffer.from('nope').toString('base64url')}`;
    const { createHmac } = require('node:crypto');
    assert.equal(unpackFlow(`${notJson}.${createHmac('sha256', 'k').update(notJson).digest('base64url')}`, 'k'), null);
  });

  test('id_token claims are checked: issuer, audience, expiry', async () => {
    const finish = (c, status) => finishGoogleSignIn({ code: 'c', verifier: 'v', clientId: CLIENT, clientSecret: 's', redirectUri: 'r', fetchImpl: fakeGoogle({ id_token: jwt(c) }, status) });
    assert.deepEqual(await finish(claims()), { sub: 'g-1', email: 'x@test.dev', emailVerified: true, name: 'X' });
    assert.equal((await finish(claims({ email_verified: 'true', email: undefined, name: undefined }))).emailVerified, true);
    await assert.rejects(finish(claims({ iss: 'https://evil.example' })), /issuer/);
    await assert.rejects(finish(claims({ aud: 'someone-else' })), /another app/);
    await assert.rejects(finish(claims({ exp: 1 })), /expired/);
    await assert.rejects(finish(claims(), 400), /answered 400/);
    assert.throws(() => decodeJwtPayload('not-a-jwt'), /no usable id_token/);
  });
});

describe('Google over HTTP', () => {
  let h;
  const env = { GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'x' };
  before(async () => { h = await httpWorld({ env, googleFetch: fakeGoogle({ id_token: jwt(claims({ sub: 'g-olga', email: 'olga@test.dev' })) }) }); });
  after(() => h.close());

  async function begin() {
    const start = await h.call('GET', '/api/auth/google/start');
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    return { state, flowCookie: start.headers.get('set-cookie').split(';')[0] };
  }

  test('AC-13 the full redirect flow signs the person in and links the account', async () => {
    const { state, flowCookie } = await begin();
    const back = await h.call('GET', `/api/auth/google/callback?code=abc&state=${state}`, { cookie: flowCookie });
    assert.equal(back.status, 302);
    assert.equal(back.headers.get('location'), '/events.html');
    const sid = back.headers.getSetCookie().find((c) => c.startsWith('sid=')).split(';')[0];
    const me = await h.call('GET', '/api/me', { cookie: sid });
    assert.equal(me.body.user.id, h.organiser.id);
    assert.equal(me.body.googleEnabled, true);
  });

  test('a callback whose state does not match is refused', async () => {
    const { flowCookie } = await begin();
    const back = await h.call('GET', '/api/auth/google/callback?code=abc&state=wrong', { cookie: flowCookie });
    assert.equal(back.headers.get('location'), '/?error=google-state');
  });
});

describe('Google over HTTP, failure paths', () => {
  test('not configured, token exchange failing, unverified email', async () => {
    const plain = await httpWorld();
    assert.equal((await plain.call('GET', '/api/auth/google/start')).headers.get('location'), '/?error=google-not-configured');
    await plain.close();

    const env = { GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'x' };
    for (const [googleFetch, expected] of [
      [fakeGoogle({}, 500), '/?error=google-failed'],
      [fakeGoogle({ id_token: jwt(claims({ sub: 'g-evil', email: 'olga@test.dev', email_verified: false })) }), '/?error=google-unverified'],
    ]) {
      const h = await httpWorld({ env, googleFetch });
      const start = await h.call('GET', '/api/auth/google/start');
      const state = new URL(start.headers.get('location')).searchParams.get('state');
      const back = await h.call('GET', `/api/auth/google/callback?code=abc&state=${state}`, { cookie: start.headers.get('set-cookie').split(';')[0] });
      assert.equal(back.headers.get('location'), expected);
      await h.close();
    }
  });
});
