// "Sign in with Google" using the OAuth 2.0 authorization-code flow with PKCE.
//
//  1. /api/auth/google/start  -> we send the browser to Google with:
//       state          a random value we also keep in a signed cookie (stops CSRF on the callback)
//       code_challenge sha256 of a random verifier we keep (PKCE: a stolen code is useless without it)
//  2. Google sends the browser back to /api/auth/google/callback?code=...&state=...
//  3. We check state, then swap code + verifier for tokens, server-to-server.
//  4. The id_token says who the person is: sub (stable id), email, email_verified.
//     It came to us directly from Google over HTTPS, so we check its claims (iss, aud, exp)
//     without fetching Google's signing keys (OpenID Connect Core 1.0, section 3.1.3.7).
const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** a fresh state + PKCE pair, and the URL to send the browser to */
function startGoogleSignIn({ clientId, redirectUri }) {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { url: url.toString(), state, verifier };
}

/** Trade the one-time code for the person's profile. Throws if anything does not add up. */
async function finishGoogleSignIn({ code, verifier, clientId, clientSecret, redirectUri, fetchImpl = fetch, now = Date.now }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google token endpoint answered ${res.status}`);
  const { id_token: idToken } = await res.json();
  const claims = decodeJwtPayload(idToken);
  if (!ISSUERS.has(claims.iss)) throw new Error('id_token from an unexpected issuer');
  if (claims.aud !== clientId) throw new Error('id_token was issued for another app');
  if (!claims.exp || claims.exp * 1000 < now()) throw new Error('id_token has expired');
  return {
    sub: String(claims.sub),
    email: String(claims.email ?? ''),
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: String(claims.name ?? ''),
  };
}

function decodeJwtPayload(jwt) {
  const parts = String(jwt ?? '').split('.');
  if (parts.length !== 3) throw new Error('Google sent no usable id_token');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

// ---- the signed cookie that remembers state + verifier between step 1 and step 3 ----

function sign(value, secret) {
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

function unsign(signed, secret) {
  const i = String(signed ?? '').lastIndexOf('.');
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value, secret));
  const actual = Buffer.from(String(signed));
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : null;
}

const packFlow = ({ state, verifier }, secret) => sign(b64url(JSON.stringify({ state, verifier })), secret);

function unpackFlow(cookie, secret) {
  const value = unsign(cookie, secret);
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { startGoogleSignIn, finishGoogleSignIn, packFlow, unpackFlow, decodeJwtPayload };
