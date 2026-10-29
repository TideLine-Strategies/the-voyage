-- Voyage-only credentials. No WonPlace identities, passwords or tokens are imported.
CREATE TABLE voyage_credentials(member_id TEXT PRIMARY KEY REFERENCES members(id),salt TEXT NOT NULL,password_hash TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE voyage_password_links(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,delivery TEXT NOT NULL DEFAULT 'pending',message_id TEXT);
CREATE INDEX voyage_password_links_member ON voyage_password_links(member_id);
