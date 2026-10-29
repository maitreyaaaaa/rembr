-- User-scheduled rediscovery reminders for saved library items.

CREATE TABLE library_reminders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','dismissed')),
  reason TEXT NOT NULL DEFAULT 'week' CHECK (length(reason) BETWEEN 1 AND 80),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,item_id) REFERENCES saved_items(owner_id,id) ON DELETE CASCADE,
  CHECK ((status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done' AND completed_at IS NULL))
);

CREATE INDEX library_reminders_owner_due_idx ON library_reminders(owner_id,status,remind_at,id);
CREATE INDEX library_reminders_item_idx ON library_reminders(owner_id,item_id,status,remind_at);

ALTER TABLE library_reminders ENABLE ROW LEVEL SECURITY;
