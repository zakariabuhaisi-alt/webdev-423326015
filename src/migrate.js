// Applies migrations/NNN_name.sql in number order, each exactly once.
// The table schema_migrations remembers which ones already ran, so a migration that
// has run is never edited: a change to the schema is always a NEW numbered file.
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const DIR = join(__dirname, '..', 'migrations');

async function migrate(db, { log = () => {} } = {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = readdirSync(DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(DIR, file), 'utf8');
    // The migration and its bookkeeping row commit together, or not at all.
    await db.transaction(async (tx) => {
      for (const statement of splitStatements(sql)) await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    log(`applied ${file}`);
  }
}

/** One statement per query call: `pg` with parameters and PGlite's query() both need that. */
function splitStatements(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { migrate };
