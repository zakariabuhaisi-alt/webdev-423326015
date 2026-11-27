// HTTP routes for signing in and out. Each handler reads the request, calls ONE service
// function, and turns the result into a response. No rule is decided here.
const express = require('express');
const { handle, cookie, parseCookies } = require('./http');
const { startGoogleSignIn, finishGoogleSignIn, packFlow, unpackFlow } = require('../auth/google-oauth');

const SESSION_COOKIE = 'sid';
const FLOW_COOKIE = 'g_flow';

function authRoutes({ services, config, googleFetch }) {
  const router = express.Router();
  const secure = config.production;

  const setSession = (res, { token, expiresAt }) =>
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, token, {
      maxAgeSeconds: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      secure,
    }));

  router.post('/api/auth/signup', handle(async (req, res) => {
    const session = await services.auth.signUp(req.body);
    setSession(res, session);
    res.status(201).json({ user: session.user });
  }));

  router.post('/api/auth/signin', handle(async (req, res) => {
    const session = await services.auth.signIn(req.body);
    setSession(res, session);
    res.json({ user: session.user });
  }));

  router.post('/api/auth/signout', handle(async (req, res) => {
    await services.auth.signOut(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAgeSeconds: 0, secure }));
    res.status(204).end();
  }));

  router.get('/api/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in first.' });
    return res.json({ user: req.user, googleEnabled: Boolean(config.google.clientId) });
  });

  /** The token is shown once. The MCP server puts it in MCP_TOKEN and acts as this person. */
  router.post('/api/me/mcp-token', handle(async (req, res) => {
    const { token, expiresAt } = await services.auth.createMcpToken(req.user);
    res.status(201).json({ token, expiresAt });
  }));

  // ---- Sign in with Google ----
  const redirectUri = `${config.publicBaseUrl}/api/auth/google/callback`;

  router.get('/api/auth/google/start', (req, res) => {
    if (!config.google.clientId) return res.redirect('/?error=google-not-configured');
    const flow = startGoogleSignIn({ clientId: config.google.clientId, redirectUri });
    res.setHeader('Set-Cookie', cookie(FLOW_COOKIE, packFlow(flow, config.sessionSecret), { maxAgeSeconds: 600, secure }));
    return res.redirect(flow.url);
  });

  router.get('/api/auth/google/callback', handle(async (req, res) => {
    const flow = unpackFlow(parseCookies(req.headers.cookie)[FLOW_COOKIE], config.sessionSecret);
    const clearFlow = cookie(FLOW_COOKIE, '', { maxAgeSeconds: 0, secure });
    if (!flow || !req.query.code || req.query.state !== flow.state) {
      res.setHeader('Set-Cookie', clearFlow);
      return res.redirect('/?error=google-state');
    }
    let profile;
    try {
      profile = await finishGoogleSignIn({
        code: String(req.query.code),
        verifier: flow.verifier,
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        redirectUri,
        fetchImpl: googleFetch,
      });
    } catch {
      res.setHeader('Set-Cookie', clearFlow);
      return res.redirect('/?error=google-failed');
    }
    try {
      const session = await services.auth.signInWithGoogle(profile);
      res.setHeader('Set-Cookie', [clearFlow, cookie(SESSION_COOKIE, session.token, {
        maxAgeSeconds: Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
        secure,
      })]);
      return res.redirect('/events.html');
    } catch (error) {
      res.setHeader('Set-Cookie', clearFlow);
      if (error.kind === 'forbidden') return res.redirect('/?error=google-unverified');
      throw error;
    }
  }));

  return router;
}

module.exports = { authRoutes, SESSION_COOKIE };
