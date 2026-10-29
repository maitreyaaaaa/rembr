-- Persist explicit, owner-scoped Checkup link probes with a one-week refresh interval.

CREATE TABLE link_health_checks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','broken','unknown')),
  source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 1 AND 2048),
  final_url TEXT CHECK (final_url IS NULL OR length(final_url) <= 2048),
  http_status INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  error_code TEXT NOT NULL DEFAULT '' CHECK (length(error_code) <= 80),
  error_message TEXT NOT NULL DEFAULT '' CHECK (length(error_message) <= 200),
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id,item_id),
  FOREIGN KEY(owner_id,item_id) REFERENCES saved_items(owner_id,id) ON DELETE CASCADE
);

CREATE INDEX link_health_checks_owner_status_idx ON link_health_checks(owner_id,status,checked_at DESC);

ALTER TABLE link_health_checks ENABLE ROW LEVEL SECURITY;
