// The model feature, tested WITHOUT the model: every test passes in a fake client.
// That is how we can test the slow, failing and nonsense cases on purpose, every time, for free.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { suggestionsService, parseModelOutput, heuristicSuggestion, buildPrompt } = require('../src/services/suggestions');
const { httpWorld } = require('./helpers');

const user = { id: 1 };
const input = { title: 'Arduino night for beginners', description: 'We wire up sensors. Bring a laptop and curiosity!' };

/** a fake model client that answers with fixed text */
const fakeModel = (answer) => ({ calls: [], async generate(prompt, opts) { this.calls.push({ prompt, opts }); return answer; } });

describe('suggestions service', () => {
  test('AC-11 a good model answer becomes 3-5 tags and a summary, labelled as coming from the model', async () => {
    const model = fakeModel('```json\n{"tags":["Arduino","electronics","beginners","Arduino"],"summary":"A first evening with sensors."}\n```');
    const result = await suggestionsService({ model }).suggest(user, input);
    assert.deepEqual(result, { tags: ['arduino', 'electronics', 'beginners'], summary: 'A first evening with sensors.', source: 'model' });
    assert.ok(model.calls[0].opts.signal instanceof AbortSignal, 'every call carries a timeout signal');
  });

  test('AC-11 the prompt sends only the event text, never anything about the user', () => {
    const prompt = buildPrompt(input);
    assert.match(prompt, /Arduino night/);
    assert.doesNotMatch(prompt, /@|email|password/i);
  });

  test('AC-11 when no model is configured the user still gets a fallback suggestion', async () => {
    const result = await suggestionsService({ model: null }).suggest(user, input);
    assert.equal(result.source, 'fallback');
    assert.equal(result.note, 'No model is configured.');
    assert.ok(result.tags.length >= 3 && result.tags.length <= 5);
    assert.equal(result.summary, 'We wire up sensors.');
  });

  test('AC-11 a model that is too slow is cut off by the timeout and the fallback answers', async () => {
    const slow = {
      generate: (prompt, { signal }) => new Promise((resolve, reject) => {
        // AbortSignal.timeout does not keep Node alive on its own; in the real server the
        // open socket does. This timer plays that part in the test.
        const keepAlive = setTimeout(() => {}, 5000);
        signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); });
      }),
    };
    const logs = [];
    const started = Date.now();
    const result = await suggestionsService({ model: slow, timeoutMs: 50, log: (m) => logs.push(m) }).suggest(user, input);
    assert.ok(Date.now() - started < 2000);
    assert.equal(result.source, 'fallback');
    assert.equal(result.note, 'The model took too long.');
    assert.deepEqual(logs, ['model call failed: TimeoutError'], 'the log names the failure, not the prompt');
  });

  test('AC-11 a provider that is down or rate-limited gives the fallback', async () => {
    const down = { generate: async () => { const e = new Error('429'); e.name = 'RateLimited'; throw e; } };
    const result = await suggestionsService({ model: down }).suggest(user, input);
    assert.equal(result.source, 'fallback');
    assert.equal(result.note, 'The model is unavailable right now.');
    // default logger is a no-op
    assert.equal((await suggestionsService({ model: down, log: undefined }).suggest(user, input)).source, 'fallback');
  });

  test('AC-12 an unusable model answer is rejected and replaced by the fallback', async () => {
    for (const answer of [
      'not json at all',
      'null',
      '{"tags":["a","b","c"],"summary":42}',
      '{"tags":["one","two"],"summary":"too few tags"}',
      '{"tags":["a","b","c"],"summary":""}',
      `{"tags":["a","b","c"],"summary":"${'x'.repeat(141)}"}`,
      '{"tags":["a","b","c"],"summary":"<img src=x onerror=alert(1)>"}',
      '{"tags":"a,b,c","summary":"tags is not a list"}',
    ]) {
      const result = await suggestionsService({ model: fakeModel(answer) }).suggest(user, input);
      assert.equal(result.source, 'fallback', answer);
      assert.equal(result.note, 'The model gave an unusable answer.');
    }
  });

  test('AC-11 suggesting needs a signed-in user and a title', async () => {
    const svc = suggestionsService({ model: null });
    await assert.rejects(svc.suggest(null, input), { kind: 'unauthenticated' });
    await assert.rejects(svc.suggest(user, { title: 'ab' }), { kind: 'invalid' });
    await assert.rejects(svc.suggest(user), { kind: 'invalid' });
  });

  test('the fallback works from a title alone and keeps the summary short', () => {
    assert.deepEqual(heuristicSuggestion({ title: 'Chess', description: '' }).tags, ['chess', 'club', 'event']);
    const long = heuristicSuggestion({ title: 'Long one', description: 'word '.repeat(60) });
    assert.ok(long.summary.length <= 140);
    assert.equal(parseModelOutput(undefined), null);
    assert.deepEqual(heuristicSuggestion({ title: '!!!', description: '' }).tags, ['club', 'event', 'students']);
  });
});

describe('suggestions over HTTP', () => {
  let h;
  before(async () => { h = await httpWorld({ model: fakeModel('{"tags":["robots","race","teams"],"summary":"Race your robot."}') }); });
  after(() => h.close());

  test('AC-11 POST /api/suggestions answers with the suggestion and its source', async () => {
    const res = await h.call('POST', '/api/suggestions', { cookie: await h.cookieFor('olga@test.dev'), body: { title: 'Robot race', description: '' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.suggestion.source, 'model');
    assert.equal((await h.call('POST', '/api/suggestions', { body: { title: 'Robot race' } })).status, 401);
  });
});
