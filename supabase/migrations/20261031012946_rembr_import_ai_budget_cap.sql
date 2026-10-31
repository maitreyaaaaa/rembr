ALTER TABLE ai_import_usage
  DROP CONSTRAINT ai_import_usage_cap_microusd_check;

UPDATE ai_import_usage SET cap_microusd=30000000;

ALTER TABLE ai_import_usage
  ALTER COLUMN cap_microusd SET DEFAULT 30000000,
  ADD CONSTRAINT ai_import_usage_cap_microusd_check CHECK (cap_microusd=30000000);
