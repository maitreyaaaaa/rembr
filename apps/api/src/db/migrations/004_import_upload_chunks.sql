ALTER TABLE saved_items ADD COLUMN source_platform TEXT
  CHECK (source_platform IS NULL OR source_platform IN ('instagram', 'pinterest', 'x'));
ALTER TABLE saved_items ADD COLUMN source_id TEXT;
ALTER TABLE saved_items ADD COLUMN source_metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE import_upload_chunks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  upload_file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index BETWEEN 0 AND 99),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, upload_file_id, chunk_index),
  FOREIGN KEY(owner_id, upload_file_id) REFERENCES import_upload_files(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX import_upload_chunks_file_idx ON import_upload_chunks(owner_id, upload_file_id, chunk_index);
