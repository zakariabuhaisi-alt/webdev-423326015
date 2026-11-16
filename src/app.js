// Builds the Express app from its parts. Nothing is global: the database, the model client
// and the config are passed in, which is what lets every test build its own app on a
// fresh in-memory database with a fake model.
const express = require('express');
const { join } = require('node:path');
const { createData } = require('./data');
const { createServices } = require('./services');
const { authRoutes, SESSION_COOKIE } = require('./routes/auth');
const { eventsRoutes } = require('./routes/events');
const { errorHandler, parseCookies, handle } = require('./routes/http');

function createApp({ db, config, model = null, googleFetch, log = console.error }) {
  const data = createData(db);
  const services = createServices({ data, model, log });
  const app = express();

  app.disable('x-powered-by'); // do not advertise the framework
  app.use(express.json({ limit: '20kb' }));

  // A cross-site HTML form cannot send application/json, so insisting on it for writes
  // is a second line of defence against CSRF, behind the SameSite cookie.
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) {
      return res.status(415).json({ error: 'Send JSON (Content-Type: application/json).' });
    }
    return next();
  });

  // Who is calling? Sets req.user (or null) for every route after this one.
  app.use(handle(async (req, res, next) => {
    req.user = await services.auth.userFromToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    next();
  }));

  app.get('/health', handle(async (req, res) => {
    const health = await services.health();
    res.status(health.db === 'ok' ? 200 : 503).json(health);
  }));

  app.use(authRoutes({ services, config, googleFetch }));
  app.use(eventsRoutes({ services }));
  app.use(express.static(join(__dirname, '..', 'public'), { extensions: ['html'] }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'There is no such API endpoint.' }));
  app.use((req, res) => res.status(404).sendFile(join(__dirname, '..', 'public', '404.html')));
  app.use(errorHandler(log));

  return { app, services };
}

module.exports = { createApp };
