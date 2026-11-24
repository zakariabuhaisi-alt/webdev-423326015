// npm run seed: put demo data into an empty database (does nothing if users exist).
const { createDb } = require('../src/db');
const { migrate } = require('../src/migrate');
const { seed } = require('../src/seed');

(async () => {
  const db = await createDb();
  await migrate(db);
  console.log((await seed(db)) ? 'demo data added' : 'database already has users; nothing added');
  await db.close();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
