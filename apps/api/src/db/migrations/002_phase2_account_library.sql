ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'disabled'));

ALTER TABLE saved_items ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'page'
  CHECK (item_kind IN ('page', 'note'));
ALTER TABLE saved_items ADD COLUMN title_override TEXT;
ALTER TABLE saved_items ADD COLUMN description_override TEXT;

CREATE TABLE asset_objects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note_image', 'avatar')),
  storage_key TEXT NOT NULL UNIQUE,
  detected_mime TEXT NOT NULL CHECK (detected_mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('staging', 'ready', 'deleting')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id)
);
CREATE INDEX asset_objects_owner_state_idx ON asset_objects(owner_id, state, created_at);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 24),
  avatar_url TEXT,
  avatar_asset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id, avatar_asset_id) REFERENCES asset_objects(owner_id, id)
);

CREATE TABLE onboarding_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referral_source TEXT CHECK (referral_source IS NULL OR referral_source IN (
    'whatsapp_friend', 'instagram', 'youtube', 'tiktok', 'x_twitter', 'reddit',
    'linkedin', 'google_search', 'product_hunt', 'school_college', 'other'
  )),
  completed_at TEXT,
  skipped_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (completed_at IS NULL OR skipped_at IS NULL)
);
CREATE TABLE onboarding_content_types (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN (
    'instagram', 'pinterest', 'web_pages_links', 'screenshots', 'documents_pdfs',
    'voice_notes', 'notes', 'inspiration_ideas', 'videos_social_posts'
  )),
  PRIMARY KEY(user_id, content_type)
);

CREATE TABLE notes (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, item_id),
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);
CREATE TABLE note_links (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 19),
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, item_id, url),
  UNIQUE(owner_id, item_id, position),
  FOREIGN KEY(owner_id, item_id) REFERENCES notes(owner_id, item_id) ON DELETE CASCADE
);

CREATE TABLE note_assets (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  PRIMARY KEY(owner_id, item_id, asset_id),
  UNIQUE(owner_id, item_id, position),
  FOREIGN KEY(owner_id, item_id) REFERENCES notes(owner_id, item_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, asset_id) REFERENCES asset_objects(owner_id, id)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 40),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 40),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id),
  UNIQUE(owner_id, normalized_name)
);
CREATE TABLE item_tags (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, item_id, tag_id),
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, tag_id) REFERENCES tags(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  normalized_name TEXT NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, id),
  UNIQUE(owner_id, normalized_name)
);
CREATE TABLE collection_items (
  owner_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, collection_id, item_id),
  FOREIGN KEY(owner_id, collection_id) REFERENCES collections(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, item_id) REFERENCES saved_items(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX saved_items_owner_status_idx ON saved_items(owner_id, status, created_at DESC, id DESC);
CREATE INDEX saved_items_owner_kind_idx ON saved_items(owner_id, item_kind, created_at DESC, id DESC);
CREATE INDEX notes_owner_updated_idx ON notes(owner_id, updated_at DESC);
CREATE INDEX note_links_owner_item_idx ON note_links(owner_id, item_id, position);
CREATE INDEX item_tags_owner_tag_idx ON item_tags(owner_id, tag_id, item_id);
CREATE INDEX collection_items_owner_item_idx ON collection_items(owner_id, item_id, collection_id);
