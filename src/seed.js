// Demo data, so the app has something to show the moment it starts.
// Safe to run twice: it does nothing if any user exists already.
const { hashPassword } = require('./services/passwords');

const DAY = 24 * 60 * 60 * 1000;

async function seed(db, { now = Date.now() } = {}) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return false;

  const password = await hashPassword('password123');
  const insertUser = async (email, name) =>
    (await db.query('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id', [email, name, password])).rows[0].id;
  const organiser = await insertUser('organiser@clubhub.test', 'Olga Organiser');
  const member = await insertUser('member@clubhub.test', 'Mihail Member');

  const insertClub = async (name, description) =>
    (await db.query('INSERT INTO clubs (name, description) VALUES ($1, $2) RETURNING id', [name, description])).rows[0].id;
  const robotics = await insertClub('Robotics Club', 'We build small robots and enter competitions.');
  const chess = await insertClub('Chess Club', 'Casual and rated games every week.');

  await db.query("INSERT INTO memberships (user_id, club_id, role) VALUES ($1, $2, 'organiser'), ($1, $3, 'organiser'), ($4, $2, 'member')",
    [organiser, robotics, chess, member]);

  const insertEvent = (clubId, title, description, location, inDays, capacity, tags, summary) =>
    db.query(
      `INSERT INTO events (club_id, title, description, location, starts_at, capacity, tags, summary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [clubId, title, description, location, new Date(now + inDays * DAY), capacity, tags, summary, organiser],
    );
  await insertEvent(robotics, 'Arduino for beginners', 'Bring a laptop. We wire up sensors and write our first sketch.',
    'Block 1, room 1410', 3, 20, ['arduino', 'electronics', 'beginners'], 'A hands-on first evening with Arduino and sensors.');
  await insertEvent(robotics, 'Line-follower race', 'Teams race their line-following robots on the new track.',
    'Block 12, hall', 10, 2, ['robots', 'competition', 'teams'], 'Bring your line follower and race it on our track.');
  await insertEvent(chess, 'Blitz tournament', 'Five-minute games, Swiss system, seven rounds.',
    'Student centre', 5, 16, ['chess', 'blitz', 'tournament'], 'Seven rounds of five-minute chess, Swiss system.');
  return true;
}

module.exports = { seed };
