const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin });
const fs = require('fs');
const lectures = JSON.parse(fs.readFileSync(__dirname + '/lectures.json', 'utf8'));

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
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
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'zak-mcp', version: '1.0.0' },
      },
    });
  } // <- initialize ends here

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
  } // <- tools/list ends here
    if (msg.method === 'tools/call') {
    const name = msg.params.name;
    const args = msg.params.arguments || {};

    if (name === 'find_lecture') {
      const lecture = lectures.find((l) => l.number === args.number);
      if (!lecture) {
        send({ jsonrpc: '2.0', id: msg.id, result: {
          content: [{ type: 'text', text: 'There is no lecture ' + args.number + '. Lectures are 1 to 10.' }],
          isError: true,
        } });
        return;
      }
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: 'Lecture ' + lecture.number + ': ' + lecture.title + '. Topics: ' + lecture.topics }],
      } });
      return;
    }
  } // <- tools/call ends here
}); // <- rl.on ends here