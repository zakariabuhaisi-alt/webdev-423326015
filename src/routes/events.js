// HTTP routes for events, registrations and suggestions. Thin on purpose: read the request,
// call the service with req.user, send the result. The service decides 401/403/404/409.
const express = require('express');
const { handle } = require('./http');

function eventsRoutes({ services }) {
  const router = express.Router();

  router.get('/api/events', handle(async (req, res) => {
    res.json({ events: await services.events.listUpcoming(req.user) });
  }));

  router.get('/api/events/:id', handle(async (req, res) => {
    res.json({ event: await services.events.getEvent(req.user, req.params.id) });
  }));

  router.post('/api/events', handle(async (req, res) => {
    res.status(201).json({ event: await services.events.createEvent(req.user, req.body) });
  }));

  // Register myself for an event.
  router.post('/api/events/:id/registrations', handle(async (req, res) => {
    res.status(201).json({ event: await services.events.register(req.user, req.params.id) });
  }));

  // Cancel a registration: my own, or anyone's if I organise the club.
  router.delete('/api/events/:id/registrations/:userId', handle(async (req, res) => {
    res.json({ event: await services.events.cancel(req.user, req.params.id, req.params.userId) });
  }));

  router.get('/api/me/registrations', handle(async (req, res) => {
    res.json({ registrations: await services.events.myRegistrations(req.user) });
  }));

  router.get('/api/me/clubs', handle(async (req, res) => {
    res.json({ clubs: await services.events.myOrganisedClubs(req.user) });
  }));

  router.post('/api/suggestions', handle(async (req, res) => {
    res.json({ suggestion: await services.suggestions.suggest(req.user, req.body) });
  }));

  return router;
}

module.exports = { eventsRoutes };
