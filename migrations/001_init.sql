-- 001: the whole first data model.
-- users <-> events is the many-to-many relation the course asks for, through registrations.
-- users <-> clubs is a second one, through memberships, and it carries the role.

CREATE TABLE users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,          -- always stored lower-case
  name          text NOT NULL,
  password_hash text,                          -- NULL for an account that only signs in with Google
  google_sub    text UNIQUE,                   -- Google's stable id for the person, set when linked
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,                 -- sha256 of the cookie value, never the value itself
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'web' CHECK (kind IN ('web', 'mcp')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clubs (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE memberships (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role    text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'organiser')),
  PRIMARY KEY (user_id, club_id)
);

CREATE TABLE events (
  id          serial PRIMARY KEY,
  club_id     integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  location    text NOT NULL DEFAULT '',
  starts_at   timestamptz NOT NULL,
  capacity    integer NOT NULL CHECK (capacity > 0),
  tags        text[] NOT NULL DEFAULT '{}',
  summary     text NOT NULL DEFAULT '',
  created_by  integer REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE registrations (
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)              -- the database itself refuses a double registration
);

CREATE INDEX events_starts_at ON events (starts_at);
CREATE INDEX registrations_event ON registrations (event_id);
