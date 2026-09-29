CREATE TABLE IF NOT EXISTS documents (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS documents_collection_updated
  ON documents (collection, updated_at DESC);

CREATE TABLE IF NOT EXISTS presence (
  member_id TEXT NOT NULL PRIMARY KEY,
  view_name TEXT,
  typing_channel TEXT,
  seen_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO documents (collection, id, data_json, updated_at)
VALUES ('settings', 'team', '{"members":[{"id":"CK","name":"Cody"},{"id":"QS","name":"Quan"}]}', unixepoch('now') * 1000);
