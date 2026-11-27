// Events, with how many places are taken. The list is one query with a JOIN and a
// GROUP BY instead of one query per event (that would be the "N+1" problem).
const COLUMNS = `e.id, e.club_id, c.name AS club_name, e.title, e.description, e.location,
  e.starts_at, e.capacity, e.tags, e.summary, e.created_by,
  count(r.user_id)::int AS taken,
  coalesce(bool_or(r.user_id = $1), false) AS registered`;

function eventsData(db) {
  return {
    /** upcoming events; `viewerId` fills in `registered` for that person */
    async listUpcoming(viewerId) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS}
         FROM events e JOIN clubs c ON c.id = e.club_id
         LEFT JOIN registrations r ON r.event_id = e.id
         WHERE e.starts_at > now()
         GROUP BY e.id, c.name
         ORDER BY e.starts_at`,
        [viewerId],
      );
      return rows;
    },
    async findById(id, viewerId = null) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS}
         FROM events e JOIN clubs c ON c.id = e.club_id
         LEFT JOIN registrations r ON r.event_id = e.id
         WHERE e.id = $2
         GROUP BY e.id, c.name`,
        [viewerId, id],
      );
      return rows[0] ?? null;
    },
    /**
     * Locks the event row until the transaction ends. Two people asking for the last
     * place at the same moment are served one after the other, never both at once.
     */
    async lockForUpdate(id) {
      const { rows } = await db.query('SELECT id, capacity, club_id FROM events WHERE id = $1 FOR UPDATE', [id]);
      return rows[0] ?? null;
    },
    async create({ clubId, title, description, location, startsAt, capacity, tags, summary, createdBy }) {
      const { rows } = await db.query(
        `INSERT INTO events (club_id, title, description, location, starts_at, capacity, tags, summary, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [clubId, title, description, location, startsAt, capacity, tags, summary, createdBy],
      );
      return rows[0].id;
    },
  };
}

module.exports = { eventsData };
