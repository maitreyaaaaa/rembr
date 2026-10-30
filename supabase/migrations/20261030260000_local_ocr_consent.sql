-- Local OCR has an independent opt-in and runtime availability signal. It does not imply Meta consent.
ALTER TABLE ai_analysis_preferences
  ADD COLUMN local_ocr_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN local_ocr_consent_version TEXT,
  ADD COLUMN local_ocr_consented_at TEXT,
  ADD COLUMN local_ocr_disabled_at TEXT,
  ADD CONSTRAINT ai_analysis_preferences_local_ocr_consent_check
    CHECK (NOT local_ocr_enabled OR (local_ocr_consent_version IS NOT NULL AND local_ocr_consented_at IS NOT NULL));

ALTER TABLE ai_worker_status
  ADD COLUMN local_ocr_configured BOOLEAN NOT NULL DEFAULT FALSE;
