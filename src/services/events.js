// Events and registrations: the rules of the club-events domain.
// HTTP routes AND MCP tools both call these functions, so both front doors obey the same rules.
const { invalid, forbidden, notFound, conflict, requireUser } = require('./errors');

const MAX_CAPACITY = 1000;

/** what a client sees of an event: the database row reshaped, with places left worked out */
function toEventDto(row) {
  return {
    id: row.id,
    clubId: row.club_id,
    club: row.club_name,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: new Date(row.starts_at).toISOString(),
    capacity: row.capacity,
    placesLeft: Math.max(row.capacity - row.taken, 0),
    registered: row.registered,
    tags: row.tags,
    summary: row.summary,
  };
}

function parseId(value, what) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw invalid(`${what} must be a positive whole number.`);
  return id;
}

function eventsService({ data, now = () => new Date() }) {
  return {
    async listUpcoming(user) {
      requireUser(user);
      return (await data.events.listUpcoming(user.id)).map(toEventDto);
    },

    async getEvent(user, eventId) {
      requireUser(user);
      const row = await data.events.findById(parseId(eventId, 'The event id'), user.id);
      if (!row) throw notFound('That event does not exist.');
      return toEventDto(row);
    },

    /** clubs where this person may create events (they are an organiser there) */
    async myOrganisedClubs(user) {
      requireUser(user);
      return data.clubs.organisedBy(user.id);
    },

    /** Only an organiser of the club may create its events. */
    async createEvent(user, input = {}) {
      requireUser(user);
      const clubId = parseId(input.clubId, 'The club id');
      if ((await data.clubs.roleOf(user.id, clubId)) !== 'organiser') {
        throw forbidden('Only an organiser of this club can create its events.');
      }
      const title = String(input.title ?? '').trim();
      if (title.length < 3 || title.length > 120) throw invalid('The title needs 3 to 120 characters.');
      const startsAt = new Date(input.startsAt);
      if (Number.isNaN(startsAt.getTime())) throw invalid('Enter a valid start date and time.');
      if (startsAt <= now()) throw invalid('The event must start in the future.');
      const capacity = Number(input.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
        throw invalid(`Capacity must be a whole number from 1 to ${MAX_CAPACITY}.`);
      }
      const tags = cleanTags(input.tags);
      const id = await data.events.create({
        clubId,
        title,
        description: String(input.description ?? '').trim().slice(0, 2000),
        location: String(input.location ?? '').trim().slice(0, 200),
        startsAt,
        capacity,
        tags,
        summary: String(input.summary ?? '').trim().slice(0, 160),
        createdBy: user.id,
      });
      return toEventDto(await data.events.findById(id, user.id));
    },

    /**
     * THE rule of the project: you cannot take a place that does not exist.
     * It runs inside a transaction that locks the event row, so two people asking for the
     * last place at the same time are handled one after the other, and only one gets it.
     */
    async register(user, eventId) {
      requireUser(user);
      const id = parseId(eventId, 'The event id');
      await data.transaction(async (tx) => {
        const event = await tx.events.lockForUpdate(id);
        if (!event) throw notFound('That event does not exist.');
        if (await tx.registrations.exists(user.id, id)) throw conflict('You are already registered for this event.');
        if ((await tx.registrations.countForEvent(id)) >= event.capacity) throw conflict('This event is full.');
        await tx.registrations.create(user.id, id);
      });
      return toEventDto(await data.events.findById(id, user.id));
    },

    /**
     * Cancelling a registration. You may cancel your own; an organiser of the event's club
     * may cancel anybody's. Anyone else gets "forbidden", and nothing is deleted.
     */
    async cancel(user, eventId, targetUserId = user?.id) {
      requireUser(user);
      const id = parseId(eventId, 'The event id');
      const target = parseId(targetUserId, 'The user id');
      const event = await data.events.findById(id);
      if (!event) throw notFound('That event does not exist.');
      if (target !== user.id && (await data.clubs.roleOf(user.id, event.club_id)) !== 'organiser') {
        throw forbidden("You can only cancel your own registration.");
      }
      if (!(await data.registrations.remove(target, id))) throw notFound('There is no such registration.');
      return toEventDto(await data.events.findById(id, user.id));
    },

    async myRegistrations(user) {
      requireUser(user);
      const rows = await data.registrations.listForUser(user.id);
      return rows.map((r) => ({
        eventId: r.id,
        title: r.title,
        club: r.club_name,
        location: r.location,
        startsAt: new Date(r.starts_at).toISOString(),
      }));
    },
  };
}

/** tags are short lower-case words; anything else is dropped rather than stored */
function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  const clean = tags
    .map((t) => String(t).trim().toLowerCase())
    .filter((t) => /^[a-z0-9][a-z0-9 -]{0,23}$/.test(t));
  return [...new Set(clean)].slice(0, 5);
}

module.exports = { eventsService, cleanTags, toEventDto };
