CREATE TABLE account_activity_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'data_export_requested', 'data_export_ready', 'data_export_failed',
    'data_export_cancelled', 'data_export_retried', 'data_export_downloaded',
    'import_started', 'import_completed', 'import_failed', 'import_status_changed',
    'background_job_failed', 'background_job_blocked', 'background_job_retrying',
    'search_failed', 'analysis_used'
  )),
  created_at TEXT NOT NULL
);
CREATE INDEX account_activity_events_owner_created_idx
  ON account_activity_events(owner_id, created_at DESC, id DESC);
CREATE INDEX account_activity_events_retention_idx ON account_activity_events(created_at,id);

ALTER TABLE account_activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_activity_events FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON account_activity_events FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON account_activity_events FROM authenticated';
  END IF;
END;
$$;
