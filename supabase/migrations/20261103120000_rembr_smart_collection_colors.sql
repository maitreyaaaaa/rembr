ALTER TABLE smart_collections
  ADD COLUMN folder_color TEXT
  CHECK (folder_color IS NULL OR folder_color ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$');
