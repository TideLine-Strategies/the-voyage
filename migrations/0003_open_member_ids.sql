-- Membership now lives in src/members.js and is checked by the Worker on every request,
-- so the invites and sessions tables no longer pin member_id to QS and CK.
-- SQLite cannot drop a CHECK constraint, so both tables are rebuilt with their rows kept.

CREATE TABLE invites_new (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
INSERT INTO invites_new (token_hash, member_id, email, expires_at, used_at)
  SELECT token_hash, member_id, email, expires_at, used_at FROM invites;
DROP TABLE invites;
ALTER TABLE invites_new RENAME TO invites;

CREATE TABLE sessions_new (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO sessions_new (token_hash, member_id, expires_at, created_at)
  SELECT token_hash, member_id, expires_at, created_at FROM sessions;
DROP INDEX IF EXISTS sessions_expires_at;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
