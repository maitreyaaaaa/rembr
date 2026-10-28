CREATE TABLE media_artifacts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  source_url TEXT NOT NULL,
  storage_key TEXT,
  detected_mime TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size BETWEEN 0 AND 5242880),
  sha256 TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready','failed')),
  error_code TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,item_id) REFERENCES saved_items(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX media_artifacts_owner_item_idx ON media_artifacts(owner_id,item_id,active,created_at);

CREATE TABLE media_cleanup_queue (
  storage_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
