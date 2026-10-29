-- Keep typed entity labels with their owner-scoped analysis generation and require fresh consent.
ALTER TABLE ai_analysis_results
  ADD COLUMN brands_json TEXT NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(brands_json::jsonb) = 'array'),
  ADD COLUMN tools_json TEXT NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(tools_json::jsonb) = 'array'),
  ADD COLUMN people_json TEXT NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(people_json::jsonb) = 'array'),
  ADD COLUMN repositories_json TEXT NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(repositories_json::jsonb) = 'array');

ALTER TABLE smart_collections DROP CONSTRAINT smart_collections_source_type_check;
ALTER TABLE smart_collections ADD CONSTRAINT smart_collections_source_type_check
  CHECK (source_type IN ('auto','rule','capture','topic','entity','collection','platform'));

UPDATE ai_analysis_jobs AS jobs
SET status='cancelled', pause_reason='consent_disabled', error_code='consent_disabled',
    updated_at=now()::text, completed_at=now()::text
FROM ai_analysis_preferences AS preferences
WHERE preferences.owner_id=jobs.owner_id AND preferences.enabled=TRUE
  AND preferences.consent_version IS DISTINCT FROM '2026-10-29-v2'
  AND jobs.status IN ('queued','paused')
  AND jobs.pause_reason IS DISTINCT FROM 'uncertain_usage';

UPDATE ai_analysis_preferences
SET enabled=FALSE, disabled_at=now()::text, updated_at=now()::text
WHERE enabled=TRUE AND consent_version IS DISTINCT FROM '2026-10-29-v2';
