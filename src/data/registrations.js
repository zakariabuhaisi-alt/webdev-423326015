function registrationsData(db) {
  return {
    async countForEvent(eventId) {
      const { rows } = await db.query('SELECT count(*)::int AS n FROM registrations WHERE event_id = $1', [eventId]);
      return rows[0].n;
    },
    async exists(userId, eventId) {
      const { rows } = await db.query('SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = $2', [userId, eventId]);
      return rows.length > 0;
    },
    async create(userId, eventId) {
      await db.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [userId, eventId]);
    },
    async remove(userId, eventId) {
      const { rowCount } = await db.query('DELETE FROM registrations WHERE user_id = $1 AND event_id = $2', [userId, eventId]);
      return rowCount > 0;
    },
    /** the events this person is registered for, soonest first */
    async listForUser(userId) {
      const { rows } = await db.query(
        `SELECT e.id, e.title, e.starts_at, e.location, c.name AS club_name
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN clubs c ON c.id = e.club_id
         WHERE r.user_id = $1 ORDER BY e.starts_at`,
        [userId],
      );
      return rows;
    },
  };
}

module.exports = { registrationsData };
