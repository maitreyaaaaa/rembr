CREATE TABLE admin_access_audit (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('admin_user_list_viewed', 'admin_user_detail_viewed')),
  target_hash TEXT CHECK (target_hash IS NULL OR target_hash ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TEXT NOT NULL
);
CREATE INDEX admin_access_audit_created_idx ON admin_access_audit(created_at, id);
CREATE INDEX admin_access_audit_target_idx ON admin_access_audit(target_hash, created_at DESC);

ALTER TABLE admin_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_access_audit FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON admin_access_audit FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON admin_access_audit FROM authenticated';
  END IF;
END;
$$;

CREATE INDEX users_email_prefix_idx ON users (lower(email) text_pattern_ops);
