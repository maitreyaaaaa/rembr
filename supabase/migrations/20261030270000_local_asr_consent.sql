-- Local ASR has its own explicit opt-in and requires a pre-provisioned model.
ALTER TABLE ai_analysis_preferences
  ADD COLUMN local_asr_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN local_asr_consent_version TEXT,
  ADD COLUMN local_asr_consented_at TEXT,
  ADD COLUMN local_asr_disabled_at TEXT,
  ADD CONSTRAINT ai_analysis_preferences_local_asr_consent_check
    CHECK (NOT local_asr_enabled OR (local_asr_consent_version IS NOT NULL AND local_asr_consented_at IS NOT NULL));

ALTER TABLE ai_worker_status
  ADD COLUMN local_asr_configured BOOLEAN NOT NULL DEFAULT FALSE;
