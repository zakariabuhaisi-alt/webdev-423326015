function clubsData(db) {
  return {
    async create({ name, description = '' }) {
      const { rows } = await db.query('INSERT INTO clubs (name, description) VALUES ($1, $2) RETURNING *', [name, description]);
      return rows[0];
    },
    /** 'organiser', 'member' or null */
    async roleOf(userId, clubId) {
      const { rows } = await db.query('SELECT role FROM memberships WHERE user_id = $1 AND club_id = $2', [userId, clubId]);
      return rows[0]?.role ?? null;
    },
    async addMember(userId, clubId, role = 'member') {
      await db.query(
        `INSERT INTO memberships (user_id, club_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, club_id) DO UPDATE SET role = EXCLUDED.role`,
        [userId, clubId, role],
      );
    },
    /** clubs where this user may create events */
    async organisedBy(userId) {
      const { rows } = await db.query(
        `SELECT c.* FROM clubs c JOIN memberships m ON m.club_id = c.id
         WHERE m.user_id = $1 AND m.role = 'organiser' ORDER BY c.name`,
        [userId],
      );
      return rows;
    },
  };
}

module.exports = { clubsData };
