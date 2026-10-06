-- Signed agreements and other documents attached to deals. Files are split into chunks of at most
-- 512 KB so each row stays well under D1's value size limit. Editors only; a deal can't be closed
-- won without at least one signed agreement attached.
CREATE TABLE IF NOT EXISTS deal_files (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('signed', 'other')),
  chunks INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deal_files_deal ON deal_files (deal_id);

CREATE TABLE IF NOT EXISTS deal_file_chunks (
  file_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (file_id, idx)
);
