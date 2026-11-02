CREATE TABLE workos_mcp_user_links (
  workos_user_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(workos_user_id, owner_id)
);
CREATE INDEX workos_mcp_user_links_owner_idx ON workos_mcp_user_links(owner_id);

CREATE TABLE mcp_tool_audit_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  item_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX mcp_tool_audit_events_owner_created_idx ON mcp_tool_audit_events(owner_id, created_at DESC);
CREATE INDEX mcp_tool_audit_events_item_idx ON mcp_tool_audit_events(owner_id, item_id) WHERE item_id IS NOT NULL;

ALTER TABLE workos_mcp_user_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_audit_events ENABLE ROW LEVEL SECURITY;
