-- Existing members and signed-in sessions remain unchanged.
CREATE TABLE IF NOT EXISTS login_limits (bucket TEXT PRIMARY KEY,window_start INTEGER NOT NULL,attempts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_limits_window ON login_limits(window_start);
CREATE TABLE IF NOT EXISTS oauth_logins (state_hash TEXT PRIMARY KEY,nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS oauth_logins_expiry ON oauth_logins(expires_at);
