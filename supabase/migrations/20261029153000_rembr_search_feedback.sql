-- Store only bounded search metadata and result references; never persist raw queries.
CREATE TABLE search_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_hash TEXT NOT NULL CHECK (query_hash ~ '^[a-f0-9]{64}$'),
  query_length INTEGER NOT NULL CHECK (query_length BETWEEN 1 AND 120),
  filters_json TEXT NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(filters_json::jsonb) = 'object'),
  result_count INTEGER NOT NULL CHECK (result_count BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, id)
);
CREATE INDEX search_events_owner_created_idx ON search_events(owner_id, created_at DESC);

CREATE TABLE search_event_results (
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  result_rank INTEGER NOT NULL CHECK (result_rank BETWEEN 1 AND 100),
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, event_id, item_id),
  FOREIGN KEY(owner_id, event_id) REFERENCES search_events(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX search_event_results_item_idx ON search_event_results(owner_id, item_id);

CREATE TABLE search_result_feedback (
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful','not_helpful')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, event_id, item_id),
  FOREIGN KEY(owner_id, event_id, item_id) REFERENCES search_event_results(owner_id, event_id, item_id) ON DELETE CASCADE
);
CREATE INDEX search_feedback_owner_updated_idx ON search_result_feedback(owner_id, updated_at DESC);

ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_event_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_result_feedback ENABLE ROW LEVEL SECURITY;
