CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  owner_hash TEXT NOT NULL CHECK (owner_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN (
    'pending_approval', 'approved', 'processing', 'partial_failed', 'failed', 'completed', 'cancelled'
  )),
  export_confirmed BOOLEAN NOT NULL CHECK (export_confirmed = TRUE),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  operator_retry_count INTEGER NOT NULL DEFAULT 0 CHECK (operator_retry_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 8),
  requested_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  approved_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'processing') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX account_deletion_one_active_per_owner_idx
  ON account_deletion_requests(owner_id)
  WHERE owner_id IS NOT NULL AND status IN ('pending_approval', 'approved', 'processing', 'partial_failed', 'failed');
CREATE INDEX account_deletion_claim_idx
  ON account_deletion_requests(status, lease_expires_at, requested_at, id);
CREATE INDEX account_deletion_owner_idx
  ON account_deletion_requests(owner_id, requested_at DESC);

CREATE TABLE account_deletion_steps (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL CHECK (step_key IN (
    'quiesce_workers', 'revoke_access', 'remove_storage', 'delete_owner_records', 'delete_identity'
  )),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_code TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  progress_cursor TEXT,
  UNIQUE(request_id, step_key)
);
CREATE INDEX account_deletion_steps_request_idx ON account_deletion_steps(request_id, step_key);

CREATE TABLE account_deletion_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES account_deletion_requests(id) ON DELETE RESTRICT,
  owner_hash TEXT NOT NULL CHECK (owner_hash ~ '^[0-9a-f]{64}$'),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner', 'admin', 'worker')),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_hash TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'requested', 'cancelled', 'approved', 'retry_requested', 'claim_acquired', 'step_started', 'step_completed', 'step_failed', 'completed'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TEXT NOT NULL
);
CREATE INDEX account_deletion_audit_request_idx ON account_deletion_audit(request_id, created_at DESC);
CREATE INDEX account_deletion_audit_owner_hash_idx ON account_deletion_audit(owner_hash, created_at DESC);

CREATE TABLE account_owner_work_leases (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_type TEXT NOT NULL CHECK (work_type IN (
    'ai_analysis', 'visual_search', 'grounded_answer', 'semantic_embedding', 'asset_upload', 'import_upload', 'media_upload', 'export_write'
  )),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX account_owner_work_leases_owner_expiry_idx ON account_owner_work_leases(owner_id, expires_at);

CREATE TABLE admin_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('support', 'admin')),
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_owner_work_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE account_deletion_requests, account_deletion_steps, account_deletion_audit, account_owner_work_leases, admin_roles FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON account_deletion_requests, account_deletion_steps, account_deletion_audit, account_owner_work_leases, admin_roles FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON account_deletion_requests, account_deletion_steps, account_deletion_audit, account_owner_work_leases, admin_roles FROM authenticated';
  END IF;
END;
$$;
