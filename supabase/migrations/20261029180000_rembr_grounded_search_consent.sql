-- Grounded library answers send selected saved text to Meta only after separate consent.
CREATE TABLE ai_search_preferences (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_version TEXT,
  consented_at TEXT,
  disabled_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (NOT enabled OR (consent_version IS NOT NULL AND consented_at IS NOT NULL))
);

ALTER TABLE ai_search_preferences ENABLE ROW LEVEL SECURITY;
