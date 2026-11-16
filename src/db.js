// The database connection. Everything else asks this file for `query` and `transaction`
// and never cares which Postgres it is talking to:
//   - DATABASE_URL set   -> a real Postgres server (Neon in production) through `pg`
//   - DATABASE_URL empty -> PGlite, a real Postgres compiled to WebAssembly that runs inside
//                           Node. No install on Windows, and every test gets a fresh one.
const { Pool } = require('pg');

async function createDb({ url = process.env.DATABASE_URL, dataDir = process.env.PGLITE_DIR } = {}) {
  if (url) return createPgDb(url);
  return createPgliteDb(dataDir); // dataDir undefined = in memory, gone when the process ends
}

function createPgDb(url) {
  // Neon requires TLS; a local Postgres usually does not have it.
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, ssl, max: 5 });
  return {
    kind: 'postgres',
    query: (sql, params = []) => pool.query(sql, params),
    // A transaction must run on ONE connection, so we borrow a client from the pool.
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (sql, params = []) => client.query(sql, params) });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPgliteDb(dataDir) {
  // PGlite is an ES module, so it is loaded with import() from this CommonJS file.
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  return {
    kind: 'pglite',
    query: (sql, params = []) => pg.query(sql, params),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (sql, params = []) => tx.query(sql, params) })),
    close: () => pg.close(),
  };
}

module.exports = { createDb };
