-- Owner-scoped generated collections keep preferences and item corrections durable.
-- Membership candidates are recomputed from current saved content and analysis.

CREATE TABLE smart_collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  source_type TEXT NOT NULL DEFAULT 'auto' CHECK (source_type IN ('auto','rule','capture','topic','collection','platform')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  generation_metadata TEXT NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(generation_metadata::jsonb) = 'object'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id),
  UNIQUE(owner_id, slug)
);
CREATE INDEX smart_collections_owner_visibility_idx ON smart_collections(owner_id, hidden, pinned, updated_at DESC);

CREATE TABLE smart_collection_item_overrides (
  owner_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('include','exclude')),
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 220),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, collection_id, item_id),
  FOREIGN KEY(owner_id, collection_id) REFERENCES smart_collections(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX smart_collection_overrides_owner_action_idx ON smart_collection_item_overrides(owner_id, collection_id, action);

ALTER TABLE smart_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_collection_item_overrides ENABLE ROW LEVEL SECURITY;
