-- Opt-in memory review for saved items. Rows exist only for items the owner chose.
CREATE TABLE item_memory_settings (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 240),
  interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days BETWEEN 1 AND 30),
  successful_recalls INTEGER NOT NULL DEFAULT 0 CHECK (successful_recalls >= 0),
  next_due_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, item_id),
  FOREIGN KEY (owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX item_memory_due_idx ON item_memory_settings(owner_id, next_due_at, item_id);

CREATE TABLE item_memory_prompts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  shown_at TEXT NOT NULL,
  revealed_at TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('remembered','partial','forgot','skipped')),
  answered_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, id),
  FOREIGN KEY (owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE,
  CHECK ((outcome IS NULL AND answered_at IS NULL) OR (outcome IS NOT NULL AND answered_at IS NOT NULL))
);
CREATE INDEX item_memory_prompts_owner_shown_idx ON item_memory_prompts(owner_id, shown_at DESC);
CREATE INDEX item_memory_prompts_item_shown_idx ON item_memory_prompts(owner_id, item_id, shown_at DESC);
CREATE UNIQUE INDEX item_memory_prompts_pending_item_idx ON item_memory_prompts(owner_id, item_id) WHERE outcome IS NULL;

ALTER TABLE item_memory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_memory_prompts ENABLE ROW LEVEL SECURITY;
