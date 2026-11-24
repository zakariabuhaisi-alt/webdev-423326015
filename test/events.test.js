// Events and registrations: the capacity rule, and who may do what.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { world, httpWorld } = require('./helpers');
const { eventsService, cleanTags } = require('../src/services/events');

const regCount = async (db, eventId) =>
  (await db.query('SELECT count(*)::int AS n FROM registrations WHERE event_id = $1', [eventId])).rows[0].n;

describe('events service', () => {
  let w;
  before(async () => { w = await world(); });
  after(() => w.db.close());

  test('AC-4 every events function refuses a signed-out caller', async () => {
    const e = await w.event();
    for (const call of [
      () => w.services.events.listUpcoming(null),
      () => w.services.events.getEvent(null, e.id),
      () => w.services.events.myOrganisedClubs(null),
      () => w.services.events.createEvent(null, {}),
      () => w.services.events.register(null, e.id),
      () => w.services.events.cancel(null, e.id, 1),
      () => w.services.events.myRegistrations(null),
    ]) await assert.rejects(call(), { kind: 'unauthenticated' });
  });

  test('AC-5 a signed-in member sees upcoming events, soonest first, with places left; past events are hidden', async () => {
    const later = await w.event({ title: 'Later event', startsAt: new Date(Date.now() + 5 * 86400000).toISOString() });
    const sooner = await w.event({ title: 'Sooner event', startsAt: new Date(Date.now() + 3600000).toISOString() });
    await w.db.query("INSERT INTO events (club_id, title, starts_at, capacity) VALUES ($1, 'Old event', now() - interval '1 day', 5)", [w.club.id]);
    const list = await w.services.events.listUpcoming(w.member);
    const titles = list.map((e) => e.title);
    assert.ok(titles.indexOf('Sooner event') < titles.indexOf('Later event'));
    assert.ok(!titles.includes('Old event'));
    const shown = list.find((e) => e.id === later.id);
    assert.equal(shown.placesLeft, 2);
    assert.equal(shown.registered, false);
    assert.equal(shown.club, 'Robotics Club');
    assert.equal((await w.services.events.getEvent(w.member, sooner.id)).title, 'Sooner event');
    await assert.rejects(w.services.events.getEvent(w.member, 99999), { kind: 'not_found' });
    await assert.rejects(w.services.events.getEvent(w.member, 'abc'), { kind: 'invalid' });
  });

  test('AC-6 registering for an event with a free place saves it and lowers places left', async () => {
    const e = await w.event();
    const after = await w.services.events.register(w.member, e.id);
    assert.equal(after.placesLeft, 1);
    assert.equal(after.registered, true);
    assert.equal(await regCount(w.db, e.id), 1);
    const mine = await w.services.events.myRegistrations(w.member);
    assert.ok(mine.some((r) => r.eventId === e.id && r.club === 'Robotics Club'));
  });

  test('AC-7 a full event refuses another registration with "This event is full" and adds no row', async () => {
    const e = await w.event({ capacity: 1 });
    await w.services.events.register(w.organiser, e.id);
    await assert.rejects(w.services.events.register(w.member, e.id), { kind: 'conflict', message: 'This event is full.' });
    assert.equal(await regCount(w.db, e.id), 1);
  });

  test('AC-7 two people asking for the last place at the same time: exactly one gets it', async () => {
    const e = await w.event({ capacity: 1 });
    const results = await Promise.allSettled([
      w.services.events.register(w.member, e.id),
      w.services.events.register(w.outsider, e.id),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await regCount(w.db, e.id), 1);
  });

  test('AC-8 registering twice for the same event is refused', async () => {
    const e = await w.event({ capacity: 5 });
    await w.services.events.register(w.member, e.id);
    await assert.rejects(w.services.events.register(w.member, e.id), { kind: 'conflict', message: 'You are already registered for this event.' });
    await assert.rejects(w.services.events.register(w.member, 424242), { kind: 'not_found' });
  });

  test("AC-9 a member cannot cancel someone else's registration, and the row stays", async () => {
    const e = await w.event({ capacity: 5 });
    await w.services.events.register(w.outsider, e.id);
    await assert.rejects(w.services.events.cancel(w.member, e.id, w.outsider.id), { kind: 'forbidden' });
    assert.equal(await regCount(w.db, e.id), 1);
  });

  test("AC-9 you can cancel your own place, and the club's organiser can cancel anyone's", async () => {
    const e = await w.event({ capacity: 5 });
    await w.services.events.register(w.member, e.id);
    await w.services.events.register(w.outsider, e.id);
    const mine = await w.services.events.cancel(w.member, e.id); // defaults to my own
    assert.equal(mine.registered, false);
    await w.services.events.cancel(w.organiser, e.id, w.outsider.id);
    assert.equal(await regCount(w.db, e.id), 0);
    await assert.rejects(w.services.events.cancel(w.member, e.id, w.member.id), { kind: 'not_found' });
    await assert.rejects(w.services.events.cancel(w.member, 777777, w.member.id), { kind: 'not_found' });
  });

  test('AC-10 only an organiser of the club can create its events', async () => {
    const input = { clubId: w.club.id, title: 'Mine', startsAt: new Date(Date.now() + 1e7).toISOString(), capacity: 3 };
    await assert.rejects(w.services.events.createEvent(w.member, input), { kind: 'forbidden' });
    await assert.rejects(w.services.events.createEvent(w.outsider, { clubId: w.club.id }), { kind: 'forbidden' });
    const ok = await w.event({ tags: ['Robots', 'robots', 'x'.repeat(40), 'AI'], summary: 'Fun.' });
    assert.deepEqual(ok.tags, ['robots', 'ai']);
    assert.deepEqual(await w.services.events.myOrganisedClubs(w.organiser).then((c) => c.map((x) => x.name)), ['Robotics Club']);
    assert.deepEqual(await w.services.events.myOrganisedClubs(w.member), []);
  });

  test('AC-10 event input is validated before anything is saved', async () => {
    const bad = [
      [{ clubId: 'x' }, 'club id'],
      [{ title: 'ab' }, 'title'],
      [{ title: undefined }, 'title'],
      [{ startsAt: 'not a date' }, 'valid start'],
      [{ startsAt: new Date(Date.now() - 1000).toISOString() }, 'future'],
      [{ capacity: 0 }, 'Capacity'],
      [{ capacity: 2.5 }, 'Capacity'],
      [{ capacity: 5000 }, 'Capacity'],
    ];
    for (const [override, words] of bad) {
      await assert.rejects(w.event(override), (error) => error.kind === 'invalid' && error.message.includes(words));
    }
    await assert.rejects(w.services.events.createEvent(w.organiser), { kind: 'invalid' });
  });

  test('cleanTags keeps short lower-case words only, at most five, no duplicates', () => {
    assert.deepEqual(cleanTags('robots'), []);
    assert.deepEqual(cleanTags(['A', 'b', 'c', 'd', 'e', 'f', '<script>']), ['a', 'b', 'c', 'd', 'e']);
  });

  test('an event row whose places are over-taken never shows negative places', async () => {
    const svc = eventsService({ data: w.data });
    const e = await w.event({ capacity: 1 });
    await w.db.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $3), ($2, $3)', [w.member.id, w.outsider.id, e.id]);
    assert.equal((await svc.getEvent(w.member, e.id)).placesLeft, 0);
  });
});

describe('events over HTTP', () => {
  let h;
  before(async () => { h = await httpWorld(); });
  after(() => h.close());

  test('AC-4 GET /api/events without a session answers 401', async () => {
    const res = await h.call('GET', '/api/events');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Please sign in first.');
  });

  test('AC-5 GET /api/events with a session lists events from the database', async () => {
    const e = await h.event({ title: 'Listed over HTTP' });
    const res = await h.call('GET', '/api/events', { cookie: await h.cookieFor('mihail@test.dev') });
    assert.equal(res.status, 200);
    assert.ok(res.body.events.some((x) => x.id === e.id && x.placesLeft === 2));
    const one = await h.call('GET', `/api/events/${e.id}`, { cookie: await h.cookieFor('mihail@test.dev') });
    assert.equal(one.body.event.title, 'Listed over HTTP');
  });

  test('AC-6 AC-7 register answers 201, then 409 when the event is full', async () => {
    const e = await h.event({ capacity: 1 });
    const first = await h.call('POST', `/api/events/${e.id}/registrations`, { cookie: await h.cookieFor('mihail@test.dev'), body: {} });
    assert.equal(first.status, 201);
    assert.equal(first.body.event.placesLeft, 0);
    const second = await h.call('POST', `/api/events/${e.id}/registrations`, { cookie: await h.cookieFor('petya@test.dev'), body: {} });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'This event is full.');
  });

  test("AC-9 DELETE someone else's registration answers 403; your own answers 200", async () => {
    const e = await h.event({ capacity: 5 });
    const petya = await h.cookieFor('petya@test.dev');
    const mihail = await h.cookieFor('mihail@test.dev');
    await h.call('POST', `/api/events/${e.id}/registrations`, { cookie: petya, body: {} });
    const res = await h.call('DELETE', `/api/events/${e.id}/registrations/${h.outsider.id}`, { cookie: mihail });
    assert.equal(res.status, 403);
    const own = await h.call('DELETE', `/api/events/${e.id}/registrations/${h.outsider.id}`, { cookie: petya });
    assert.equal(own.status, 200);
    const none = await h.call('DELETE', `/api/events/${e.id}/registrations/${h.outsider.id}`);
    assert.equal(none.status, 401);
  });

  test('AC-10 POST /api/events: 201 for an organiser, 403 for a member, 400 for bad input', async () => {
    const body = { clubId: h.club.id, title: 'Made over HTTP', startsAt: new Date(Date.now() + 1e8).toISOString(), capacity: 10 };
    assert.equal((await h.call('POST', '/api/events', { cookie: await h.cookieFor('olga@test.dev'), body })).status, 201);
    assert.equal((await h.call('POST', '/api/events', { cookie: await h.cookieFor('mihail@test.dev'), body })).status, 403);
    const bad = await h.call('POST', '/api/events', { cookie: await h.cookieFor('olga@test.dev'), body: { ...body, capacity: -1 } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /Capacity/);
  });

  test('my registrations and my clubs are available to the signed-in user', async () => {
    const cookie = await h.cookieFor('olga@test.dev');
    assert.equal((await h.call('GET', '/api/me/registrations', { cookie })).status, 200);
    assert.equal((await h.call('GET', '/api/me/clubs', { cookie })).body.clubs[0].name, 'Robotics Club');
  });
});
