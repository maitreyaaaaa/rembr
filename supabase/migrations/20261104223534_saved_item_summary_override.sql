ALTER TABLE saved_items ADD COLUMN summary_override TEXT;
ALTER TABLE saved_items ADD COLUMN why_saved TEXT;

ALTER TABLE saved_items ADD CONSTRAINT saved_items_summary_override_length
  CHECK (summary_override IS NULL OR char_length(summary_override) <= 2000);
ALTER TABLE saved_items ADD CONSTRAINT saved_items_why_saved_length
  CHECK (why_saved IS NULL OR char_length(why_saved) <= 1000);
