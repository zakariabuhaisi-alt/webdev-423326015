// The entry point: `npm start`. Reads config, opens the database, applies migrations,
// and listens. Kept tiny so that everything worth testing lives in app.js and below.
const { loadConfig } = require('./config');
const { createDb } = require('./db');
const { migrate } = require('./migrate');
const { createApp } = require('./app');
const { createGeminiClient } = require('./model/gemini');
const { seed } = require('./seed');

async function main() {
  const config = loadConfig(); // throws, and the process exits, if a required variable is missing
  const db = await createDb({ url: config.databaseUrl });
  await migrate(db, { log: console.log });
  if (db.kind === 'pglite' && !process.env.PGLITE_DIR) await seed(db); // a fresh in-memory DB gets demo data
  const { app } = createApp({ db, config, model: createGeminiClient() });
  const server = app.listen(config.port, () => {
    console.log(`ClubHub listening on ${config.publicBaseUrl} (database: ${db.kind})`);
  });
  const stop = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
