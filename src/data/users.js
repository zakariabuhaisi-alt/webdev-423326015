// Data layer for users. Only this folder writes SQL. Every function takes the
// `db` (or a transaction `tx`) it should run on, and returns plain rows.
function usersData(db) {
  return {
    async findByEmail(email) {
      const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      return rows[0] ?? null;
    },
    async findById(id) {
      const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
      return rows[0] ?? null;
    },
    async findByGoogleSub(sub) {
      const { rows } = await db.query('SELECT * FROM users WHERE google_sub = $1', [sub]);
      return rows[0] ?? null;
    },
    async create({ email, name, passwordHash = null, googleSub = null }) {
      const { rows } = await db.query(
        'INSERT INTO users (email, name, password_hash, google_sub) VALUES ($1, $2, $3, $4) RETURNING *',
        [email, name, passwordHash, googleSub],
      );
      return rows[0];
    },
    async linkGoogle(id, googleSub) {
      const { rows } = await db.query('UPDATE users SET google_sub = $2 WHERE id = $1 RETURNING *', [id, googleSub]);
      return rows[0];
    },
    async count() {
      const { rows } = await db.query('SELECT count(*)::int AS n FROM users');
      return rows[0].n;
    },
  };
}

module.exports = { usersData };
