-- Import ordering and per-account AI media analysis.
-- Historical import rows remain readable; new Instagram rows require a bounded source_order.

ALTER TABLE import_entries ADD COLUMN source_order INTEGER
  CHECK (source_order IS NULL OR source_order BETWEEN 0 AND 299);
ALTER TABLE processing_jobs ADD COLUMN source_order INTEGER
  CHECK (source_order IS NULL OR source_order BETWEEN 0 AND 299);

CREATE UNIQUE INDEX import_entries_instagram_source_order_unique
  ON import_entries(owner_id, import_id, source_order)
  WHERE source_platform = 'instagram' AND source_order IS NOT NULL;
CREATE UNIQUE INDEX processing_jobs_import_source_order_unique
  ON processing_jobs(owner_id, import_id, source_order)
  WHERE import_id IS NOT NULL AND source_order IS NOT NULL;
CREATE INDEX processing_jobs_import_order_idx
  ON processing_jobs(import_id, source_order)
  WHERE import_id IS NOT NULL AND source_order IS NOT NULL;

CREATE FUNCTION rembr_enforce_instagram_import_order() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_platform = 'instagram' AND NEW.source_order IS NULL THEN
    RAISE EXCEPTION 'instagram_import_source_order_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_platform <> 'instagram' AND NEW.source_order IS NOT NULL THEN
    RAISE EXCEPTION 'source_order_is_instagram_only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER import_entries_instagram_source_order_required
  BEFORE INSERT OR UPDATE OF source_platform, source_order ON import_entries
  FOR EACH ROW EXECUTE FUNCTION rembr_enforce_instagram_import_order();

CREATE TABLE ai_analysis_preferences (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_version TEXT,
  consented_at TEXT,
  disabled_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (NOT enabled OR (consent_version IS NOT NULL AND consented_at IS NOT NULL))
);

-- The API can show worker readiness without receiving the Meta credential.
CREATE TABLE ai_worker_status (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  meta_api_configured BOOLEAN NOT NULL DEFAULT FALSE,
  last_heartbeat_at TEXT NOT NULL
);

CREATE TABLE ai_analysis_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1 CHECK (generation >= 1),
  status TEXT NOT NULL CHECK (status IN ('queued','processing','paused','completed','partial','failed','cancelled')),
  pause_reason TEXT CHECK (pause_reason IS NULL OR pause_reason IN ('import_budget','monthly_budget','provider_unavailable','uncertain_usage','consent_disabled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 3),
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(owner_id, id),
  UNIQUE(owner_id, item_id, generation),
  FOREIGN KEY(owner_id, import_id) REFERENCES imports(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX ai_analysis_jobs_claim_idx ON ai_analysis_jobs(status, available_at, lease_expires_at);
CREATE INDEX ai_analysis_jobs_import_idx ON ai_analysis_jobs(owner_id, import_id, status, created_at);

CREATE TABLE ai_analysis_results (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  status TEXT NOT NULL CHECK (status IN ('completed','partial')),
  model TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 2400),
  visual_description TEXT NOT NULL DEFAULT '' CHECK (length(visual_description) <= 8000),
  ocr_text TEXT NOT NULL DEFAULT '' CHECK (length(ocr_text) <= 30000),
  transcript TEXT NOT NULL DEFAULT '' CHECK (length(transcript) <= 60000),
  keywords_json TEXT NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(keywords_json::jsonb) = 'array'),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(tags_json::jsonb) = 'array'),
  image_count INTEGER NOT NULL DEFAULT 0 CHECK (image_count BETWEEN 0 AND 20),
  image_bytes INTEGER NOT NULL DEFAULT 0 CHECK (image_bytes BETWEEN 0 AND 104857600),
  video_count INTEGER NOT NULL DEFAULT 0 CHECK (video_count BETWEEN 0 AND 20),
  max_video_bytes INTEGER NOT NULL DEFAULT 0 CHECK (max_video_bytes BETWEEN 0 AND 26214400),
  audio_seconds INTEGER NOT NULL DEFAULT 0 CHECK (audio_seconds >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  billed_microusd BIGINT NOT NULL DEFAULT 0 CHECK (billed_microusd >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, item_id, generation),
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, item_id, generation) REFERENCES ai_analysis_jobs(owner_id, item_id, generation) ON DELETE CASCADE
);
CREATE INDEX ai_analysis_results_owner_item_idx ON ai_analysis_results(owner_id, item_id, generation DESC);

CREATE TABLE ai_import_usage (
  owner_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  cap_microusd BIGINT NOT NULL DEFAULT 20000000 CHECK (cap_microusd = 20000000),
  spent_microusd BIGINT NOT NULL DEFAULT 0 CHECK (spent_microusd >= 0),
  reserved_microusd BIGINT NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, import_id),
  CHECK (spent_microusd + reserved_microusd <= cap_microusd),
  FOREIGN KEY(owner_id, import_id) REFERENCES imports(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE ai_monthly_usage (
  month_start DATE PRIMARY KEY CHECK (EXTRACT(DAY FROM month_start) = 1),
  cap_microusd BIGINT NOT NULL DEFAULT 100000000 CHECK (cap_microusd = 100000000),
  spent_microusd BIGINT NOT NULL DEFAULT 0 CHECK (spent_microusd >= 0),
  reserved_microusd BIGINT NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (spent_microusd + reserved_microusd <= cap_microusd)
);

CREATE TABLE ai_usage_reservations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  month_start DATE NOT NULL,
  reserved_microusd BIGINT NOT NULL CHECK (reserved_microusd > 0),
  actual_microusd BIGINT CHECK (actual_microusd IS NULL OR actual_microusd >= 0),
  status TEXT NOT NULL CHECK (status IN ('reserved','settled','held','released')),
  created_at TEXT NOT NULL,
  settled_at TEXT,
  UNIQUE(job_id, attempt_number),
  FOREIGN KEY(owner_id, import_id) REFERENCES imports(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, job_id) REFERENCES ai_analysis_jobs(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(month_start) REFERENCES ai_monthly_usage(month_start)
);
CREATE INDEX ai_usage_reservations_open_idx ON ai_usage_reservations(status, created_at)
  WHERE status IN ('reserved','held');

-- The app uses its authenticated API and server-side database role. No browser-facing table grants or policies are added.
ALTER TABLE ai_analysis_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_worker_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_import_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_monthly_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_reservations ENABLE ROW LEVEL SECURITY;
