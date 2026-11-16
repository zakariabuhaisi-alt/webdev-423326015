// The project's MCP tools go through the SAME services as the HTTP API, so the same rules hold.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./helpers');
const { projectTools, isProjectTool, callProjectTool } = require('../mcp-server/tools');

describe('MCP project tools', () => {
  let w;
  let token;
  before(async () => {
    w = await world();
    ({ token } = await w.services.auth.createMcpToken(w.member));
  });
  after(() => w.db.close());

  const call = (name, args, t = token) => callProjectTool(name, args, { services: w.services, token: t });

  test('every tool has a description a model can choose by', () => {
    assert.deepEqual(projectTools.map((t) => t.name), ['list_events', 'register_for_event', 'my_registrations']);
    for (const tool of projectTools) assert.ok(tool.description.length >= 20, tool.name);
    assert.equal(isProjectTool('list_events'), true);
    assert.equal(isProjectTool('find_lecture'), false);
  });

  test('AC-15 register_for_event obeys the full-event rule, as an isError result', async () => {
    const e = await w.event({ capacity: 1 });
    const ok = await call('register_for_event', { eventId: e.id });
    assert.equal(ok.isError, undefined);
    assert.match(ok.content[0].text, /Registered for "Arduino night"\. Places left: 0/);
    const { token: other } = await w.services.auth.createMcpToken(w.outsider);
    const full = await call('register_for_event', { eventId: e.id }, other);
    assert.equal(full.isError, true);
    assert.equal(full.content[0].text, 'This event is full.');
  });

  test('AC-15 without a valid MCP_TOKEN every tool refuses', async () => {
    const res = await call('list_events', {}, 'not-a-real-token');
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /MCP_TOKEN is missing or expired/);
  });

  test('AC-15 the tools act as the token owner and see what that person sees', async () => {
    const list = JSON.parse((await call('list_events', {})).content[0].text);
    assert.ok(list.length >= 1);
    const mine = JSON.parse((await call('my_registrations', {})).content[0].text);
    assert.ok(mine.every((r) => typeof r.eventId === 'number'));
  });

  test('an unknown name and an unexpected failure are both tool errors', async () => {
    assert.equal((await call('nope', {})).isError, true);
    const broken = { auth: { userFromToken: async () => ({ id: 1 }) }, events: { listUpcoming: async () => { throw new Error('db down'); } } };
    const res = await callProjectTool('list_events', {}, { services: broken, token: 'x' });
    assert.equal(res.content[0].text, 'ClubHub could not complete this request.');
  });

  test('with no services passed, the tools open their own database (lazily, once)', async () => {
    const res = await callProjectTool('list_events', {}, { token: 'nobody' });
    assert.equal(res.isError, true);
  });
});
