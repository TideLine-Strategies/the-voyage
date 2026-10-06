-- Product usage: which pages each member opens and which actions they take, so editors can see
-- what people actually use. Stores page names and action labels only, never record contents,
-- IP addresses, or message text. Location is the coarse city/region/country Cloudflare reports.
-- Rows older than 180 days are deleted when an editor opens the Usage page.

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('open', 'view', 'action')),
  view TEXT NOT NULL,
  action TEXT,
  device TEXT,
  city TEXT,
  region TEXT,
  country TEXT
);

CREATE INDEX IF NOT EXISTS usage_events_ts ON usage_events (ts);
CREATE INDEX IF NOT EXISTS usage_events_member_ts ON usage_events (member_id, ts);
