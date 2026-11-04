ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TEXT;

-- The user explicitly chose the new account-wide AI behavior. Apply it to current accounts;
-- limits, provider availability checks, and per-feature user actions remain in force.
INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at)
SELECT id,TRUE,'2026-10-29-v2',now()::text,NULL,now()::text FROM users
ON CONFLICT (owner_id) DO UPDATE SET enabled=TRUE,consent_version='2026-10-29-v2',
  consented_at=now()::text,disabled_at=NULL,updated_at=now()::text;

INSERT INTO ai_search_preferences (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at)
SELECT id,TRUE,'2026-10-29-v5',now()::text,NULL,now()::text FROM users
ON CONFLICT (owner_id) DO UPDATE SET enabled=TRUE,consent_version='2026-10-29-v5',
  consented_at=now()::text,disabled_at=NULL,updated_at=now()::text;

INSERT INTO ai_visual_search_preferences (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at)
SELECT id,TRUE,'2026-10-29-v1',now()::text,NULL,now()::text FROM users
ON CONFLICT (owner_id) DO UPDATE SET enabled=TRUE,consent_version='2026-10-29-v1',
  consented_at=now()::text,disabled_at=NULL,updated_at=now()::text;

INSERT INTO semantic_search_preferences (owner_id,enabled,disclosure_version,consented_at,disabled_at,updated_at)
SELECT id,TRUE,'2026-10-30-v1',now()::text,NULL,now()::text FROM users
ON CONFLICT (owner_id) DO UPDATE SET enabled=TRUE,disclosure_version='2026-10-30-v1',
  consented_at=now()::text,disabled_at=NULL,updated_at=now()::text;

UPDATE ai_analysis_jobs SET status='queued',pause_reason=NULL,error_code=NULL,
  lease_token=NULL,lease_expires_at=NULL,updated_at=now()::text
WHERE status='paused' AND pause_reason='consent_disabled';
