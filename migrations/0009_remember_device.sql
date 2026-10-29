-- Bind the remember-device choice to the single-use Google OAuth request.
ALTER TABLE oauth_logins ADD COLUMN remember_device INTEGER NOT NULL DEFAULT 0;
