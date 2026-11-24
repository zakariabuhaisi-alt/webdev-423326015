// ClubHub's MCP server (Exercise 1, grown into the project's server in Exercise 3).
//
// Who wrote this: ZAK wrote the first version (step 1: answer initialize, stay silent on
// notifications; then the tools/list answer). The agent (Claude) wrote the rest of this file,
// tools/call and the error answers, with Prof. Kotov's permission as reported by ZAK on
// 24 Nov 2026. See AGENT_LOG.md.
//
// How MCP over stdio works, in four sentences:
//   1. The client (an agent, or check.mjs) starts this program and talks to it through stdin/stdout.
//   2. Every message is ONE line of JSON (JSON-RPC 2.0). We read a line, we may write a line back.
//   3. A message WITH an "id" is a request and must get exactly one reply carrying the same id.
//      A message WITHOUT an "id" is a notification and must get no reply at all.
//   4. stdout is only for protocol replies. Anything else (logs) goes to stderr.

// readline is built into Node. It splits the stream coming in on stdin into separate lines.
const readline = require('readline');
// fs is built into Node. We use it to read lectures.json from the disk.
const fs = require('fs');
// path is built into Node. It joins folder and file names correctly on Windows and Linux.
const path = require('path');

// The ClubHub tools (list_events, register_for_event, my_registrations) live in tools.js.
// They call the same service functions as the website, so the same rules apply to both.
const { projectTools, isProjectTool, callProjectTool } = require('./tools');

// __dirname is the folder this file is in (mcp-server/). We read lectures.json from there,
// so the server works no matter which folder it was started from.
const lectures = JSON.parse(fs.readFileSync(path.join(__dirname, 'lectures.json'), 'utf8'));

// The two Exercise 1 tools. This list is what tools/list sends back.
// A model only ever sees the name, the description and the inputSchema, so the
// description is how it decides which tool to call.
const lectureTools = [
  {
    // The name the client uses in tools/call.
    name: 'find_lecture',
    // Plain words a model can choose by. check.mjs wants at least 20 characters.
    description: 'Find a course lecture by its number (1 to 10) and return its title and topics.',
    // JSON Schema of the arguments: one number, and it is required.
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'number', description: 'The lecture number, 1 to 10' } },
      required: ['number'],
    },
  },
  {
    // Our own second tool: search instead of exact lookup.
    name: 'search_lectures',
    description: 'Search lecture titles and topics for a keyword and list every lecture that matches.',
    inputSchema: {
      type: 'object',
      properties: { keyword: { type: 'string', description: 'A word to look for, for example "MCP"' } },
      required: ['keyword'],
    },
  },
];

// Turn a JavaScript object into one line of JSON and write it to stdout.
// The "\n" at the end is important: the client reads line by line.
function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

// A successful reply to request number `id`. `result` is whatever the method returns.
function reply(id, result) {
  send({ jsonrpc: '2.0', id: id, result: result });
}

// A protocol error reply. This means "the request itself was wrong"
// (unknown method, unknown tool, bad JSON), NOT "the tool ran and said no".
// The codes are fixed by JSON-RPC: -32700 parse error, -32601 method not found,
// -32602 invalid params, -32603 internal error.
function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id: id, error: { code: code, message: message } });
}

// What a tool returns when it worked: MCP wants a list of content blocks, here one text block.
function toolText(text) {
  return { content: [{ type: 'text', text: text }] };
}

// What a tool returns when it ran but could not do the job (for example lecture 99).
// It is still a normal "result", with isError: true, so the MODEL reads the message
// and can try again. A JSON-RPC error would only reach the client program, not the model.
function toolError(text) {
  return { content: [{ type: 'text', text: text }], isError: true };
}

// find_lecture: look up one lecture by its number.
function findLecture(args) {
  // Arguments can be missing entirely, so fall back to an empty object.
  const number = (args || {}).number;
  // .find walks the array and returns the first lecture whose number matches, or undefined.
  const lecture = lectures.find((l) => l.number === number);
  // No such lecture: a tool error with a readable message, not a crash.
  if (!lecture) {
    return toolError(`There is no lecture ${number}. Lectures are numbered 1 to ${lectures.length}.`);
  }
  // Found: send back its number, title and topics as text.
  return toolText(`Lecture ${lecture.number}: ${lecture.title}. Topics: ${lecture.topics}`);
}

// search_lectures: every lecture whose title or topics contain the keyword.
function searchLectures(args) {
  // Take the keyword, make it a string, trim spaces, and lower-case it so "mcp" finds "MCP".
  const keyword = String((args || {}).keyword ?? '').trim().toLowerCase();
  // An empty keyword would match everything, so refuse it as a tool error.
  if (!keyword) {
    return toolError('Give a keyword to search for, for example "MCP".');
  }
  // .filter keeps only the lectures whose title or topics include the keyword.
  const matches = lectures.filter(
    (l) => l.title.toLowerCase().includes(keyword) || l.topics.toLowerCase().includes(keyword),
  );
  // Nothing matched: that is a normal answer, not an error.
  if (matches.length === 0) {
    return toolText(`No lecture mentions "${keyword}".`);
  }
  // One line per match, joined with newlines.
  return toolText(matches.map((l) => `Lecture ${l.number}: ${l.title}`).join('\n'));
}

// Handle one tools/call request. It is async because the ClubHub tools read the database.
async function callTool(msg) {
  // params holds { name, arguments }. Either may be missing in a broken request.
  const params = msg.params || {};
  const name = params.name;
  const args = params.arguments || {};

  // Pick the right tool by its name and send back its result.
  if (name === 'find_lecture') return reply(msg.id, findLecture(args));
  if (name === 'search_lectures') return reply(msg.id, searchLectures(args));
  // A ClubHub tool: wait for the database answer, then send it back.
  if (isProjectTool(name)) return reply(msg.id, await callProjectTool(name, args));

  // A tool we do not have is a protocol error: the request asked for something that
  // does not exist. MCP uses -32602 (invalid params) for this.
  return replyError(msg.id, -32602, `Unknown tool: ${name}`);
}

// Handle one request (a message that has an id). Each method gets its own branch.
async function handle(msg) {
  // initialize is the handshake: say which protocol version we speak, that we
  // have tools, and what our name is.
  if (msg.method === 'initialize') {
    return reply(msg.id, {
      // Echo the client's version back; use a known one if it did not send any.
      protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
      // { tools: {} } means "I offer tools". Nothing else (no resources, no prompts).
      capabilities: { tools: {} },
      // Our name and version, shown in the client.
      serverInfo: { name: 'zak-mcp', version: '1.0.0' },
    });
  }

  // tools/list: the lecture tools plus the ClubHub tools, in one array.
  if (msg.method === 'tools/list') {
    return reply(msg.id, { tools: [...lectureTools, ...projectTools] });
  }

  // tools/call: run one tool (see callTool above).
  if (msg.method === 'tools/call') {
    return callTool(msg);
  }

  // ping: the client checks we are alive. The answer is an empty result.
  if (msg.method === 'ping') {
    return reply(msg.id, {});
  }

  // Any other method: we do not know it. -32601 means "method not found".
  return replyError(msg.id, -32601, `Method not found: ${msg.method}`);
}

// Start reading stdin line by line.
const rl = readline.createInterface({ input: process.stdin });

// This function runs once for every line the client sends.
rl.on('line', async (line) => {
  // Log what arrived, to stderr, so it never mixes with the replies on stdout.
  console.error('got: ' + line);

  // Skip empty lines: they are not messages.
  if (!line.trim()) return;

  // Try to turn the text into an object. Bad JSON must not crash the server.
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    // -32700 is "parse error". We cannot know the id of a broken message, so it is null.
    return replyError(null, -32700, 'Parse error: that line was not valid JSON');
  }

  // Notification has no id, it expects no answer, so we send nothing
  if (msg.id === undefined) return;

  // A request: answer it. If something unexpected throws, answer with -32603
  // (internal error) instead of crashing, so the client still gets a reply.
  try {
    await handle(msg);
  } catch (error) {
    console.error(error);
    replyError(msg.id, -32603, 'Internal error: ' + error.message);
  }
}); // <- rl.on ends here
