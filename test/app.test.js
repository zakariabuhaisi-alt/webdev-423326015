// The app as a whole: health, error handling, 404s, configuration, migrations.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { httpWorld, freshDb } = require('./helpers');
const { loadConfig } = require('../src/config');
const { migrate } = require('../src/migrate');
const { seed } = require('../src/seed');
const { createData } = require('../src/data');
const { createServices } = require('../src/services');

describe('app over HTTP', () => {
  let h;
  before(async () => { h = await httpWorld(); });
  after(() => h.close());

  test('AC-16 GET /health answers 200 with the database reachable', async () => {
    const res = await h.call('GET', '/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', db: 'ok' });
  });

  test('AC-16 malformed JSON answers 400 with a sentence, not a stack trace', async () => {
    const res = await h.call('POST', '/api/auth/signin', { body: '{"email":' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'The request body is not valid JSON.');
  });

  test('an unknown API path answers 404 JSON; an unknown page answers the 404 page', async () => {
    assert.equal((await h.call('GET', '/api/nothing-here')).status, 404);
    const page = await fetch(`${h.base}/no-such-page`);
    assert.equal(page.status, 404);
    assert.match(await page.text(), /does not exist/);
  });

  test('the pages are served with a real title', async () => {
    const page = await (await fetch(`${h.base}/`)).text();
    assert.match(page, /<title>Sign in · ClubHub<\/title>/);
    assert.match(page, /<html lang="en">/);
  });
});

describe('when things break', () => {
  test('AC-16 /health answers 503 when the database is gone', async () => {
    const h = await httpWorld();
    await h.db.close();
    const res = await h.call('GET', '/health');
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { status: 'degraded', db: 'down' });
    await h.stopServer();
  });

  test('an unexpected error answers 500 with a generic sentence and logs the detail', async () => {
    const logs = [];
    const { createApp } = require('../src/app');
    const db = await freshDb();
    const config = loadConfig({ SESSION_SECRET: 'test-secret-at-least-16' });
    const broken = { ...db, query: async (sql, params) => { if (/FROM events/.test(sql)) throw new Error('boom'); return db.query(sql, params); } };
    const { app } = createApp({ db: broken, config, log: (m) => logs.push(m) });
    const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const signin = await fetch(`http://localhost:${server.address().port}/api/auth/signup`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'e@e.ee', password: 'password123', name: 'E' }),
    });
    const cookie = signin.headers.get('set-cookie').split(';')[0];
    const res = await fetch(`http://localhost:${server.address().port}/api/events`, { headers: { cookie } });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'Something went wrong on our side. Please try again.' });
    assert.match(logs[0], /boom/);
    await new Promise((r) => { server.close(r); server.closeAllConnections(); });
    await db.close();
  });
});

describe('configuration', () => {
  test('in production the app refuses to start without its secrets', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL, SESSION_SECRET/);
    assert.throws(() => loadConfig({ SESSION_SECRET: 'short' }), /at least 16/);
    const ok = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'long-enough-secret!', PORT: '8080', PUBLIC_BASE_URL: 'https://a.b/' });
    assert.equal(ok.port, 8080);
    assert.equal(ok.publicBaseUrl, 'https://a.b');
    const dev = loadConfig({});
    assert.equal(dev.publicBaseUrl, 'http://localhost:3000');
    assert.equal(dev.databaseUrl, '');
  });
});

describe('database', () => {
  test('migrations apply to an empty database, and running them again changes nothing', async () => {
    const db = await freshDb();
    await migrate(db);
    const { rows } = await db.query('SELECT name FROM schema_migrations');
    assert.deepEqual(rows.map((r) => r.name), ['001_init.sql']);
    await db.close();
  });

  test('the seed adds demo data once', async () => {
    const db = await freshDb();
    assert.equal(await seed(db), true);
    assert.equal(await seed(db), false);
    const services = createServices({ data: createData(db) });
    const { user } = await services.auth.signIn({ email: 'member@clubhub.test', password: 'password123' });
    assert.equal((await services.events.listUpcoming(user)).length, 3);
    await db.close();
  });
});
