const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({ input: process.stdin });
const lectures = JSON.parse(fs.readFileSync(__dirname + '/lectures.json', 'utf8'));

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function sendError(id, code, message) {
  send({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}

rl.on('line', (line) => {
  console.error('got: ' + line);
  const msg = JSON.parse(line);

  // Notification has no id, it expects no answer, so we send nothing
  if (msg.id === undefined) return;

  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion ?? '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'zak-mcp', version: '1.0.0' },
      },
    });
    return;
  }

  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          {
            name: 'find_lecture',
            description: 'Find a course lecture by its number and return its title.',
            inputSchema: {
              type: 'object',
              properties: { number: { type: 'number' } },
              required: ['number'],
            },
          },
          {
            name: 'search_lectures',
            description: 'Search lecture titles for a keyword and list the matches.',
            inputSchema: {
              type: 'object',
              properties: { keyword: { type: 'string' } },
              required: ['keyword'],
            },
          },
        ],
      },
    });
    return;
  }

  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};

    if (name === 'find_lecture') {
      const lecture = lectures.find((l) => l.number === args.number);
      if (!lecture) {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [
              {
                type: 'text',
                text: 'There is no lecture ' + args.number + '. Lectures are 1 to 10.',
              },
            ],
            isError: true,
          },
        });
        return;
      }
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [
            {
              type: 'text',
              text:
                'Lecture ' +
                lecture.number +
                ': ' +
                lecture.title +
                '. Topics: ' +
                lecture.topics,
            },
          ],
        },
      });
      return;
    }

    if (name === 'search_lectures') {
      const keyword = String(args.keyword || '').toLowerCase();
      const matches = lectures.filter(
        (l) =>
          String(l.title || '').toLowerCase().includes(keyword) ||
          String(l.topics || '').toLowerCase().includes(keyword)
      );
      const text =
        matches.length === 0
          ? `No lectures found matching "${args.keyword}".`
          : matches
              .map((l) => `Lecture ${l.number}: ${l.title} (Topics: ${l.topics})`)
              .join('\n');

      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text }],
        },
      });
      return;
    }

    // Unknown tool -> JSON-RPC Invalid params (-32602)
    sendError(msg.id, -32602, `Unknown tool: ${name}`);
    return;
  }

  // Unknown method -> JSON-RPC Method not found (-32601)
  sendError(msg.id, -32601, `Method not found: ${msg.method}`);
});