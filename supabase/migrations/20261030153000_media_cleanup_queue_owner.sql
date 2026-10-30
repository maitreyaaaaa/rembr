ALTER TABLE media_cleanup_queue
  ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT;

-- Recover ownership wherever the source artifact still exists. Older queue-only
-- rows remain unattributed and are still handled by the global worker sweep.
UPDATE media_cleanup_queue queued
SET owner_id=artifact.owner_id
FROM media_artifacts artifact
WHERE artifact.storage_key=queued.storage_key AND queued.owner_id IS NULL;

CREATE INDEX media_cleanup_queue_owner_key_idx ON media_cleanup_queue(owner_id,storage_key)
  WHERE owner_id IS NOT NULL;
