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

ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'disabled'));

ALTER TABLE saved_items ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'page'
  CHECK (item_kind IN ('page', 'note'));
ALTER TABLE saved_items ADD COLUMN title_override TEXT;
ALTER TABLE saved_items ADD COLUMN description_override TEXT;

CREATE TABLE asset_objects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note_image', 'avatar')),
  storage_key TEXT NOT NULL UNIQUE,
  detected_mime TEXT NOT NULL CHECK (detected_mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('staging', 'ready', 'deleting')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id)
);
CREATE INDEX asset_objects_owner_state_idx ON asset_objects(owner_id, state, created_at);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 24),
  avatar_url TEXT,
  avatar_asset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id, avatar_asset_id) REFERENCES asset_objects(owner_id, id)
);

CREATE TABLE onboarding_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referral_source TEXT CHECK (referral_source IS NULL OR referral_source IN (
    'whatsapp_friend', 'instagram', 'youtube', 'tiktok', 'x_twitter', 'reddit',
    'linkedin', 'google_search', 'product_hunt', 'school_college', 'other'
  )),
  completed_at TEXT,
  skipped_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (completed_at IS NULL OR skipped_at IS NULL)
);
CREATE TABLE onboarding_content_types (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN (
    'instagram', 'pinterest', 'web_pages_links', 'screenshots', 'documents_pdfs',
    'voice_notes', 'notes', 'inspiration_ideas', 'videos_social_posts'
  )),
  PRIMARY KEY(user_id, content_type)
);

CREATE TABLE notes (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, item_id),
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE TABLE note_links (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 19),
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, item_id, url),
  UNIQUE(owner_id, item_id, position),
  FOREIGN KEY(owner_id, item_id) REFERENCES notes(owner_id, item_id) ON DELETE CASCADE
);

CREATE TABLE note_assets (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  PRIMARY KEY(owner_id, item_id, asset_id),
  UNIQUE(owner_id, item_id, position),
  FOREIGN KEY(owner_id, item_id) REFERENCES notes(owner_id, item_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, asset_id) REFERENCES asset_objects(owner_id, id)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 40),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 40),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id),
  UNIQUE(owner_id, normalized_name)
);
CREATE TABLE item_tags (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, item_id, tag_id),
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, tag_id) REFERENCES tags(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  normalized_name TEXT NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id),
  UNIQUE(owner_id, normalized_name)
);
CREATE TABLE collection_items (
  owner_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, collection_id, item_id),
  FOREIGN KEY(owner_id, collection_id) REFERENCES collections(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX saved_items_owner_status_idx ON saved_items(owner_id, status, created_at DESC, id DESC);
CREATE INDEX saved_items_owner_kind_idx ON saved_items(owner_id, item_kind, created_at DESC, id DESC);
CREATE INDEX notes_owner_updated_idx ON notes(owner_id, updated_at DESC);
CREATE INDEX note_links_owner_item_idx ON note_links(owner_id, item_id, position);
CREATE INDEX item_tags_owner_tag_idx ON item_tags(owner_id, tag_id, item_id);
CREATE INDEX collection_items_owner_item_idx ON collection_items(owner_id, item_id, collection_id);

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
  FOREIGN KEY(owner_id, import_id) REFERENCES imports(owner_id, id) ON DELETE CASCADE,
  CHECK (received_bytes <= expected_bytes),
  CHECK (chunks_received <= chunk_count)
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

ALTER TABLE saved_items ADD COLUMN source_platform TEXT
  CHECK (source_platform IS NULL OR source_platform IN ('instagram', 'pinterest', 'x'));
ALTER TABLE saved_items ADD COLUMN source_id TEXT;
ALTER TABLE saved_items ADD COLUMN source_metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE import_upload_chunks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  upload_file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index BETWEEN 0 AND 99),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, upload_file_id, chunk_index),
  FOREIGN KEY(owner_id, upload_file_id) REFERENCES import_upload_files(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX import_upload_chunks_file_idx ON import_upload_chunks(owner_id, upload_file_id, chunk_index);

-- Phase 1's configured retry budget was two attempts. Restore it on rows that
-- 003 migrated using the job ID as the correlation ID before that migration was corrected.
UPDATE processing_jobs SET max_attempts=2 WHERE generation=1 AND correlation_id=id AND max_attempts=5;

CREATE TABLE job_pause_states (
  owner_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  pause_cause TEXT NOT NULL CHECK (pause_cause IN ('operator', 'maintenance', 'storage_unavailable', 'rate_limit')),
  paused_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, job_id),
  FOREIGN KEY(owner_id, job_id) REFERENCES processing_jobs(owner_id, id) ON DELETE CASCADE
);


ALTER TABLE imports ADD COLUMN lease_token TEXT;
ALTER TABLE imports ADD COLUMN lease_expires_at TEXT;
CREATE INDEX imports_lease_idx ON imports(status, lease_expires_at);

ALTER TABLE imports ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX imports_owner_idempotency_idx ON imports(owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

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

CREATE OR REPLACE FUNCTION rembr_guard_import_chunk_index() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM import_upload_files f WHERE f.owner_id=NEW.owner_id AND f.id=NEW.upload_file_id AND NEW.chunk_index < f.chunk_count) THEN
    RAISE EXCEPTION 'import_chunk_index_limit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_chunk_index_guard_insert BEFORE INSERT ON import_upload_chunks FOR EACH ROW EXECUTE FUNCTION rembr_guard_import_chunk_index();

CREATE OR REPLACE FUNCTION rembr_guard_import_entry_job_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM processing_jobs j WHERE j.owner_id=NEW.owner_id AND j.id=NEW.job_id AND j.item_id=NEW.item_id AND j.import_id=NEW.import_id) THEN
    RAISE EXCEPTION 'import_entry_job_item_mismatch' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_entry_job_item_guard_insert BEFORE INSERT ON import_entries FOR EACH ROW EXECUTE FUNCTION rembr_guard_import_entry_job_item();
CREATE TRIGGER import_entry_job_item_guard_update BEFORE UPDATE OF owner_id,import_id,item_id,job_id ON import_entries FOR EACH ROW EXECUTE FUNCTION rembr_guard_import_entry_job_item();

CREATE OR REPLACE FUNCTION rembr_guard_import_cleanup_before_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM import_upload_files f WHERE f.owner_id=OLD.owner_id AND f.import_id=OLD.id AND f.state <> 'deleted')
     OR EXISTS (SELECT 1 FROM processing_jobs j WHERE j.owner_id=OLD.owner_id AND j.import_id=OLD.id) THEN
    RAISE EXCEPTION 'import_requires_cleanup' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER import_delete_requires_cleanup BEFORE DELETE ON imports FOR EACH ROW EXECUTE FUNCTION rembr_guard_import_cleanup_before_delete();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_content_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_upload_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_upload_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_pause_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_cleanup_queue ENABLE ROW LEVEL SECURITY;
