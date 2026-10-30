-- Local image vectors have independent consent, owner lifecycle, and runtime readiness.
ALTER TABLE ai_analysis_preferences
  ADD COLUMN local_visual_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN local_visual_consent_version TEXT,
  ADD COLUMN local_visual_consented_at TEXT,
  ADD COLUMN local_visual_disabled_at TEXT,
  ADD CONSTRAINT ai_analysis_preferences_local_visual_consent_check
    CHECK (NOT local_visual_enabled OR (local_visual_consent_version IS NOT NULL AND local_visual_consented_at IS NOT NULL));

ALTER TABLE ai_worker_status
  ADD COLUMN local_visual_configured BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE account_owner_work_leases DROP CONSTRAINT account_owner_work_leases_work_type_check;
ALTER TABLE account_owner_work_leases ADD CONSTRAINT account_owner_work_leases_work_type_check
  CHECK (work_type IN (
    'ai_analysis', 'visual_search', 'grounded_answer', 'semantic_embedding', 'visual_embedding',
    'asset_upload', 'import_upload', 'media_upload', 'export_write'
  ));

CREATE TABLE visual_item_embeddings (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 120),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  embedding DOUBLE PRECISION[] NOT NULL CHECK (cardinality(embedding) BETWEEN 1 AND 2048),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, item_id, model),
  FOREIGN KEY (owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX visual_item_embeddings_owner_model_idx ON visual_item_embeddings(owner_id, model);
ALTER TABLE visual_item_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON visual_item_embeddings FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON visual_item_embeddings FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON visual_item_embeddings FROM authenticated';
  END IF;
END;
$$;

CREATE TABLE visual_embedding_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (owner_id, item_id),
  FOREIGN KEY (owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX visual_embedding_jobs_claim_idx ON visual_embedding_jobs(status, available_at, created_at);
ALTER TABLE visual_embedding_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON visual_embedding_jobs FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON visual_embedding_jobs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON visual_embedding_jobs FROM authenticated';
  END IF;
END;
$$;
