-- Persist only bounded evidence metadata, never temporary media URLs or raw frames.
ALTER TABLE ai_analysis_results
  ADD COLUMN media_coverage_json TEXT NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(media_coverage_json::jsonb) = 'object');
