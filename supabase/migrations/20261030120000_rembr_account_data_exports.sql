CREATE TABLE account_data_exports (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'cancelled', 'expired')),
  include_files BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_token TEXT,
  lease_expires_at TEXT,
  artifact_key TEXT,
  expires_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(owner_id, id),
  CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (status <> 'ready' OR (artifact_key IS NOT NULL AND expires_at IS NOT NULL))
);

CREATE INDEX account_data_exports_owner_created_idx
  ON account_data_exports(owner_id, created_at DESC, id DESC);
CREATE INDEX account_data_exports_claim_idx
  ON account_data_exports(status, lease_expires_at, created_at, id);

ALTER TABLE account_data_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_data_exports FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON account_data_exports FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON account_data_exports FROM authenticated';
  END IF;
END;
$$;
