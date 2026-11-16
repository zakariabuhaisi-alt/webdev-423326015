// npm run migrate: apply pending migrations to DATABASE_URL (or to PGLITE_DIR).
const { createDb } = require('../src/db');
const { migrate } = require('../src/migrate');

(async () => {
  const db = await createDb();
  await migrate(db, { log: console.log });
  console.log('migrations are up to date');
  await db.close();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
