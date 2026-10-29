CREATE TABLE ai_visual_search_preferences (
  owner_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  consent_version text,
  consented_at text,
  disabled_at text,
  updated_at text NOT NULL DEFAULT now()::text,
  CHECK (NOT enabled OR (consent_version = '2026-10-29-v1' AND consented_at IS NOT NULL))
);

ALTER TABLE ai_visual_search_preferences ENABLE ROW LEVEL SECURITY;
