CREATE TABLE account_security_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sign_in', 'sign_out', 'deletion_requested', 'deletion_cancelled')),
  created_at TEXT NOT NULL
);
CREATE INDEX account_security_events_owner_created_idx
  ON account_security_events(owner_id, created_at DESC, id DESC);

ALTER TABLE account_security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security_events FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON account_security_events FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON account_security_events FROM authenticated';
  END IF;
END;
$$;
