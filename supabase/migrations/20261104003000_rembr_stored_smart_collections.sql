CREATE TABLE smart_collection_memberships (
  owner_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY(owner_id, collection_id, item_id),
  FOREIGN KEY(owner_id, collection_id) REFERENCES smart_collections(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX smart_collection_memberships_item_idx ON smart_collection_memberships(owner_id, item_id);

CREATE TABLE smart_collection_refresh_state (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 1,
  built_revision BIGINT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token TEXT,
  lease_expires_at TIMESTAMPTZ,
  generated_at TEXT,
  truncated BOOLEAN NOT NULL DEFAULT FALSE,
  failed BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX smart_collection_refresh_pending_idx ON smart_collection_refresh_state(available_at)
  WHERE revision > built_revision;
ALTER TABLE smart_collection_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_collection_refresh_state ENABLE ROW LEVEL SECURITY;

-- Event invalidation is in the same transaction as the source change. There is
-- one durable job per account, regardless of how many rows a bulk import adds.
CREATE FUNCTION rembr_dirty_smart_collections() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE account_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN account_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN account_id := OLD.owner_id;
  ELSE account_id := NEW.owner_id;
  END IF;
  -- Cascading account deletion must not recreate state for a deleted owner.
  INSERT INTO smart_collection_refresh_state(owner_id, available_at)
    SELECT id, CURRENT_TIMESTAMP + INTERVAL '2 seconds' FROM users WHERE id = account_id
  ON CONFLICT(owner_id) DO UPDATE SET revision = smart_collection_refresh_state.revision + 1,
    available_at = CURRENT_TIMESTAMP + INTERVAL '2 seconds', failed = FALSE;
  RETURN NULL;
END;
$$;

CREATE TRIGGER users_smart_collection_dirty AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER saved_items_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON saved_items
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER notes_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON notes
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER artifacts_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON extracted_artifacts
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER tags_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON tags
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER item_tags_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON item_tags
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER imports_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON import_entries
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER analysis_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON ai_analysis_results
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER jobs_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON processing_jobs
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();
CREATE TRIGGER pause_smart_collection_dirty AFTER INSERT OR UPDATE OR DELETE ON job_pause_states
  FOR EACH ROW EXECUTE FUNCTION rembr_dirty_smart_collections();

INSERT INTO smart_collection_refresh_state(owner_id) SELECT id FROM users;
