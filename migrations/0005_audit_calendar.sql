-- Server-side audit log: every change to CRM records, plus sign-ins and sign-outs, written by the
-- Worker (not the browser). Stores who, when, what kind of record, and a short label such as an
-- account name. Never stores chat text. Rows older than 365 days are deleted when an editor views it.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  action TEXT NOT NULL,
  collection TEXT,
  doc_id TEXT,
  label TEXT
);
CREATE INDEX IF NOT EXISTS audit_log_ts ON audit_log (ts);

-- Private calendar subscription links. Only a hash of each link's secret is stored.
CREATE TABLE IF NOT EXISTS calendar_feeds (
  member_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
