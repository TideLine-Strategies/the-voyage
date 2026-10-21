CREATE TABLE IF NOT EXISTS contact_inquiries (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  name TEXT NOT NULL,
  business TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  notification_status TEXT NOT NULL DEFAULT 'pending',
  notification_detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS contact_inquiries_submitted_at
  ON contact_inquiries (submitted_at DESC);

-- Anonymous, bounded product events; never form text, credentials, IPs or URLs with queries.
CREATE TABLE IF NOT EXISTS site_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('page_view','section_view','audit_open','app_open','contact_open')),
  page TEXT NOT NULL CHECK (page IN ('home','audit','services','about','contact','app')),
  session_id TEXT NOT NULL,
  referrer_host TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL CHECK (device IN ('phone','tablet','desktop'))
);
CREATE INDEX IF NOT EXISTS site_events_created ON site_events(created_at);
CREATE INDEX IF NOT EXISTS site_events_kind_session ON site_events(kind,session_id,created_at);

CREATE TABLE IF NOT EXISTS loki_waitlist (
  phone TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'loki-app',
  consent_version TEXT NOT NULL DEFAULT 'launch-notification-v1'
);

CREATE TABLE IF NOT EXISTS crm_intake_receipts (
  kind TEXT NOT NULL CHECK(kind IN ('contact','waitlist')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','linked','review')),
  crm_contact_id TEXT,
  crm_account_id TEXT,
  last_attempt_at TEXT NOT NULL,
  error_code TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(kind,source_id)
);
CREATE TABLE IF NOT EXISTS conversion_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('audit_started','audit_saved','contact_submitted','waitlist_joined')),
  session_id TEXT NOT NULL,
  device TEXT NOT NULL CHECK(device IN ('phone','tablet','desktop'))
);
CREATE INDEX IF NOT EXISTS conversion_events_created ON conversion_events(created_at,kind,session_id);

CREATE TABLE loki_audits(id TEXT PRIMARY KEY,created_at TEXT,result_json TEXT);
