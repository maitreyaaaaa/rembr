-- User-requested grounded summaries are distinct from Instagram media analysis.
CREATE TABLE ai_saved_item_summaries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation > 0),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  source_characters INTEGER NOT NULL CHECK (source_characters >= 0),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 1800),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  billed_microusd BIGINT NOT NULL CHECK (billed_microusd >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, item_id, generation),
  FOREIGN KEY (owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX ai_saved_item_summaries_latest_idx
  ON ai_saved_item_summaries(owner_id, item_id, generation DESC);

ALTER TABLE ai_saved_item_summaries ENABLE ROW LEVEL SECURITY;
