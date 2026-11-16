// ClubHub's project tools for the MCP server (Exercise 3 onward).
//
// server.js (your hand-written protocol loop from Exercise 1) imports this file:
//   - in tools/list it adds `projectTools` to the list it returns
//   - in tools/call, if the name is one of these, it awaits `callProjectTool(name, args)`
//     and sends back what that returns as the `result`.
//
// The design in one sentence: one set of rules, two front doors. Every tool here calls
// the SAME service function the HTTP route calls (src/services), never the data layer,
// and acts as the person whose token is in MCP_TOKEN, with exactly that person's rights.
const { createDb } = require('../src/db');
const { migrate } = require('../src/migrate');
const { createData } = require('../src/data');
const { createServices } = require('../src/services');

const projectTools = [
  {
    name: 'list_events',
    description: 'List upcoming ClubHub events with club, start time, places left and whether the signed-in user is registered.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'register_for_event',
    description: 'Save a place for the signed-in user at one ClubHub event, by event id. Refused when the event is full or already joined.',
    inputSchema: {
      type: 'object',
      properties: { eventId: { type: 'number', description: 'The id of the event, from list_events' } },
      required: ['eventId'],
    },
  },
  {
    name: 'my_registrations',
    description: 'List the ClubHub events the signed-in user has a place at, soonest first.',
    inputSchema: { type: 'object', properties: {} },
  },
];

let servicesPromise = null;

/** Open the database lazily, on the first project tool call, so initialize and tools/list stay instant. */
function getServices() {
  servicesPromise ??= (async () => {
    const db = await createDb();
    await migrate(db);
    return createServices({ data: createData(db) });
  })();
  return servicesPromise;
}

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const toolError = (message) => ({ ...text(message), isError: true });

const isProjectTool = (name) => projectTools.some((t) => t.name === name);

/**
 * Runs one project tool and returns an MCP tool result.
 * A rule the service refuses (full event, not signed in) is a tool result with isError,
 * NOT a JSON-RPC error: the tool ran, and its answer is "no".
 */
async function callProjectTool(name, args = {}, { services, token = process.env.MCP_TOKEN } = {}) {
  const svc = services ?? (await getServices());
  // Who is calling? Exactly like the cookie for the website, the token names one user.
  const user = await svc.auth.userFromToken(token);
  try {
    if (name === 'list_events') return text(await svc.events.listUpcoming(user));
    if (name === 'my_registrations') return text(await svc.events.myRegistrations(user));
    if (name === 'register_for_event') {
      const event = await svc.events.register(user, args.eventId);
      return text(`Registered for "${event.title}". Places left: ${event.placesLeft}.`);
    }
    return toolError(`Unknown project tool: ${name}`);
  } catch (error) {
    if (error.kind) return toolError(error.kind === 'unauthenticated'
      ? 'MCP_TOKEN is missing or expired. Create one on the ClubHub events page.'
      : error.message);
    return toolError('ClubHub could not complete this request.');
  }
}

module.exports = { projectTools, isProjectTool, callProjectTool };
