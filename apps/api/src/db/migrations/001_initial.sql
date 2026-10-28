CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE saved_items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, canonical_url),
  UNIQUE(owner_id, id)
);
CREATE INDEX saved_items_owner_created_idx ON saved_items(owner_id, created_at DESC);

CREATE TABLE processing_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 3),
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX processing_jobs_claim_idx ON processing_jobs(status, available_at, lease_expires_at);
CREATE INDEX processing_jobs_owner_idx ON processing_jobs(owner_id, created_at DESC);

CREATE TABLE extracted_artifacts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  text_content TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX extracted_artifacts_owner_item_idx ON extracted_artifacts(owner_id, item_id);
