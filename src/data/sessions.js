function sessionsData(db) {
  return {
    async create({ tokenHash, userId, kind, expiresAt }) {
      await db.query(
        'INSERT INTO sessions (token_hash, user_id, kind, expires_at) VALUES ($1, $2, $3, $4)',
        [tokenHash, userId, kind, expiresAt],
      );
    },
    /** the user behind a live session, or null when it is unknown or expired */
    async findUser(tokenHash) {
      const { rows } = await db.query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },
    async remove(tokenHash) {
      await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },
    async countForUser(userId) {
      const { rows } = await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [userId]);
      return rows[0].n;
    },
  };
}

module.exports = { sessionsData };
