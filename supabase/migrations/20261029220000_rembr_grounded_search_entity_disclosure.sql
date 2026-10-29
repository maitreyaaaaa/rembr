-- New derived entity labels may now be sent with retrieved items for grounded answers.
UPDATE ai_search_preferences
SET enabled=FALSE, disabled_at=now()::text, updated_at=now()::text
WHERE enabled=TRUE AND consent_version IS DISTINCT FROM '2026-10-29-v5';
