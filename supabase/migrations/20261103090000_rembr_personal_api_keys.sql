CREATE TABLE personal_api_keys (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  secret_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX personal_api_keys_owner_created_idx
  ON personal_api_keys(owner_id, created_at DESC);

ALTER TABLE personal_api_keys ENABLE ROW LEVEL SECURITY;
