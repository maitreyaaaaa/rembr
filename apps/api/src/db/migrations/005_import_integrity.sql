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

CREATE TRIGGER import_upload_file_byte_guard_insert
BEFORE INSERT ON import_upload_files
WHEN NEW.received_bytes > NEW.expected_bytes OR NEW.chunks_received > NEW.chunk_count
BEGIN SELECT RAISE(ABORT, 'import_upload_counter_limit'); END;
CREATE TRIGGER import_upload_file_byte_guard_update
BEFORE UPDATE OF received_bytes,chunks_received,expected_bytes,chunk_count ON import_upload_files
WHEN NEW.received_bytes > NEW.expected_bytes OR NEW.chunks_received > NEW.chunk_count
BEGIN SELECT RAISE(ABORT, 'import_upload_counter_limit'); END;

CREATE TRIGGER import_chunk_index_guard_insert
BEFORE INSERT ON import_upload_chunks
WHEN NOT EXISTS (SELECT 1 FROM import_upload_files f
  WHERE f.owner_id=NEW.owner_id AND f.id=NEW.upload_file_id AND NEW.chunk_index < f.chunk_count)
BEGIN SELECT RAISE(ABORT, 'import_chunk_index_limit'); END;

CREATE TRIGGER import_entry_job_item_guard_insert
BEFORE INSERT ON import_entries
WHEN NEW.job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM processing_jobs j
  WHERE j.owner_id=NEW.owner_id AND j.id=NEW.job_id AND j.item_id=NEW.item_id AND j.import_id=NEW.import_id)
BEGIN SELECT RAISE(ABORT, 'import_entry_job_item_mismatch'); END;
CREATE TRIGGER import_entry_job_item_guard_update
BEFORE UPDATE OF owner_id,import_id,item_id,job_id ON import_entries
WHEN NEW.job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM processing_jobs j
  WHERE j.owner_id=NEW.owner_id AND j.id=NEW.job_id AND j.item_id=NEW.item_id AND j.import_id=NEW.import_id)
BEGIN SELECT RAISE(ABORT, 'import_entry_job_item_mismatch'); END;

CREATE TRIGGER import_delete_requires_cleanup
BEFORE DELETE ON imports
WHEN EXISTS (SELECT 1 FROM import_upload_files f WHERE f.owner_id=OLD.owner_id AND f.import_id=OLD.id AND f.state!='deleted')
  OR EXISTS (SELECT 1 FROM processing_jobs j WHERE j.owner_id=OLD.owner_id AND j.import_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'import_requires_cleanup'); END;
