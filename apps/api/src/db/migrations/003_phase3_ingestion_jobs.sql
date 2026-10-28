CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('instagram', 'pinterest', 'x', 'mixed', 'unknown')),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'staged', 'parsing', 'queued', 'processing', 'completed', 'partial', 'failed', 'expired')),
  total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes BETWEEN 0 AND 104857600),
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count BETWEEN 0 AND 20),
  parsed_count INTEGER NOT NULL DEFAULT 0 CHECK (parsed_count >= 0),
  new_count INTEGER NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  cleanup_status TEXT NOT NULL DEFAULT 'pending' CHECK (cleanup_status IN ('pending', 'complete', 'retry')),
  cleanup_attempts INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(owner_id, id)
);
CREATE INDEX imports_owner_created_idx ON imports(owner_id, created_at DESC);
CREATE INDEX imports_status_updated_idx ON imports(status, updated_at);

CREATE TABLE import_upload_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  declared_mime TEXT NOT NULL,
  expected_bytes INTEGER NOT NULL CHECK (expected_bytes BETWEEN 1 AND 26214400),
  received_bytes INTEGER NOT NULL DEFAULT 0 CHECK (received_bytes BETWEEN 0 AND 26214400),
  chunk_count INTEGER NOT NULL CHECK (chunk_count BETWEEN 1 AND 100),
  chunks_received INTEGER NOT NULL DEFAULT 0 CHECK (chunks_received BETWEEN 0 AND 100),
  storage_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('uploading', 'staged', 'parsing', 'accepted', 'deleting', 'deleted', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id),
  FOREIGN KEY(owner_id, import_id) REFERENCES imports(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX import_upload_files_cleanup_idx ON import_upload_files(state, updated_at);

CREATE TABLE processing_jobs_v1 (
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
INSERT INTO processing_jobs_v1 (id, owner_id, item_id, status, attempts, max_attempts,
  available_at, lease_token, lease_expires_at, error_code, created_at, updated_at)
SELECT id, owner_id, item_id, status, attempts, max_attempts, available_at, lease_token,
  lease_expires_at, error_code, created_at, updated_at FROM processing_jobs;
DROP INDEX processing_jobs_claim_idx;
DROP INDEX processing_jobs_owner_idx;
DROP TABLE processing_jobs;

CREATE TABLE processing_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE,
  import_id TEXT,
  correlation_id TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1 CHECK (generation >= 1),
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'retry_wait', 'completed', 'partial', 'failed', 'cancel_requested', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 5),
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id),
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, import_id) REFERENCES imports(owner_id, id) ON DELETE CASCADE
);
INSERT INTO processing_jobs (id, owner_id, item_id, correlation_id, generation, status, attempts,
  max_attempts, available_at, lease_token, lease_expires_at, error_code, created_at, updated_at)
SELECT old.id, old.owner_id, old.item_id, old.id, 1,
  CASE old.status WHEN 'completed' THEN 'completed' ELSE old.status END,
  old.attempts, old.max_attempts, old.available_at, old.lease_token, old.lease_expires_at,
  old.error_code, old.created_at, old.updated_at
FROM processing_jobs_v1 AS old;
DROP TABLE processing_jobs_v1;
CREATE INDEX processing_jobs_claim_idx ON processing_jobs(status, available_at, lease_expires_at);
CREATE INDEX processing_jobs_owner_idx ON processing_jobs(owner_id, created_at DESC);
CREATE INDEX processing_jobs_import_idx ON processing_jobs(owner_id, import_id, created_at);

CREATE TABLE job_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed', 'cancelled')),
  error_code TEXT,
  correlation_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE(job_id, generation, attempt_number),
  FOREIGN KEY(owner_id, job_id) REFERENCES processing_jobs(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX job_attempts_owner_job_idx ON job_attempts(owner_id, job_id, generation, attempt_number);

CREATE TABLE import_entries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  upload_file_id TEXT,
  item_id TEXT,
  job_id TEXT,
  source_platform TEXT NOT NULL CHECK (source_platform IN ('instagram', 'pinterest', 'x', 'unknown')),
  source_url TEXT,
  source_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  source_metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('queued', 'duplicate', 'skipped', 'failed')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(owner_id, import_id) REFERENCES imports(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, upload_file_id) REFERENCES import_upload_files(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, job_id) REFERENCES processing_jobs(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX import_entries_owner_import_idx ON import_entries(owner_id, import_id, created_at);
