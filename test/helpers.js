// Test helpers. Every test file gets its OWN fresh in-memory Postgres (PGlite), so tests
// never depend on each other or on a database being installed.
const { createDb } = require('../src/db');
const { migrate } = require('../src/migrate');
const { createData } = require('../src/data');
const { createServices } = require('../src/services');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');

async function freshDb() {
  const db = await createDb({ url: '' });
  await migrate(db);
  return db;
}

/** a database with one club, an organiser, a member and an outsider */
async function world({ model = null } = {}) {
  const db = await freshDb();
  const data = createData(db);
  const services = createServices({ data, model, log: () => {} });
  const signUp = async (name) =>
    (await services.auth.signUp({ email: `${name}@test.dev`, password: 'password123', name })).user;
  const organiser = await signUp('olga');
  const member = await signUp('mihail');
  const outsider = await signUp('petya');
  const club = await data.clubs.create({ name: 'Robotics Club' });
  await data.clubs.addMember(organiser.id, club.id, 'organiser');
  await data.clubs.addMember(member.id, club.id, 'member');
  const event = (overrides = {}) =>
    services.events.createEvent(organiser, {
      clubId: club.id,
      title: 'Arduino night',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      capacity: 2,
      ...overrides,
    });
  return { db, data, services, organiser, member, outsider, club, event };
}

/** a real HTTP server on a random port, over a fresh database */
async function httpWorld(options = {}) {
  const w = await world(options);
  const config = loadConfig({ SESSION_SECRET: 'test-secret-at-least-16', PUBLIC_BASE_URL: 'http://localhost', ...options.env });
  const { app } = createApp({ db: w.db, config, model: options.model ?? null, googleFetch: options.googleFetch, log: () => {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://localhost:${server.address().port}`;

  /** fetch with an optional session cookie, JSON in and out */
  async function call(method, path, { cookie, body, headers = {}, redirect = 'manual' } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') ?? '';
    const json = type.includes('json') ? await res.json() : null;
    return { status: res.status, body: json, headers: res.headers };
  }

  /** sign in over HTTP and return the "sid=..." cookie */
  async function cookieFor(email, password = 'password123') {
    const res = await call('POST', '/api/auth/signin', { body: { email, password } });
    return res.headers.get('set-cookie').split(';')[0];
  }

  const stopServer = () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  const close = async () => {
    await stopServer();
    await w.db.close();
  };
  return { ...w, base, call, cookieFor, close, stopServer };
}

module.exports = { freshDb, world, httpWorld };
