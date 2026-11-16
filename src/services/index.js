// Every service, wired to one data object. Both front doors use this one function:
//   src/app.js (HTTP)  and  mcp-server/tools.js (MCP).
const { authService } = require('./auth');
const { eventsService } = require('./events');
const { suggestionsService } = require('./suggestions');

function createServices({ data, model = null, now, log }) {
  return {
    auth: authService({ data, now }),
    events: eventsService({ data, now }),
    suggestions: suggestionsService({ model, log }),
    /** for GET /health: can we still reach the database? */
    async health() {
      try {
        await data.users.count();
        return { status: 'ok', db: 'ok' };
      } catch {
        return { status: 'degraded', db: 'down' };
      }
    },
  };
}

module.exports = { createServices };
