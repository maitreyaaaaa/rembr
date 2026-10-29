-- Consent and owner-scoped storage for private-library semantic retrieval.
-- OpenRouter returns 1,536 dimensions for openai/text-embedding-3-small.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE semantic_search_preferences (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  disclosure_version TEXT,
  consented_at TEXT,
  disabled_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (NOT enabled OR (disclosure_version IS NOT NULL AND consented_at IS NOT NULL))
);
ALTER TABLE semantic_search_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON semantic_search_preferences FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON semantic_search_preferences FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON semantic_search_preferences FROM authenticated';
  END IF;
END;
$$;

CREATE TABLE semantic_item_embeddings (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  embedding extensions.vector(1536) NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, item_id, model),
  FOREIGN KEY (owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX semantic_item_embeddings_owner_model_idx
  ON semantic_item_embeddings(owner_id, model);
ALTER TABLE semantic_item_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON semantic_item_embeddings FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON semantic_item_embeddings FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON semantic_item_embeddings FROM authenticated';
  END IF;
END;
$$;
