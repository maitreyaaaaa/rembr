-- Interactive grounded answers share the existing monthly AI budget and keep an auditable token-cost ledger.
CREATE TABLE ai_search_usage_reservations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_start DATE NOT NULL REFERENCES ai_monthly_usage(month_start),
  reserved_microusd BIGINT NOT NULL CHECK (reserved_microusd > 0),
  actual_microusd BIGINT CHECK (actual_microusd IS NULL OR actual_microusd >= 0),
  status TEXT NOT NULL CHECK (status IN ('reserved','settled','held','released')),
  created_at TEXT NOT NULL,
  settled_at TEXT,
  CHECK ((status = 'settled' AND actual_microusd IS NOT NULL AND settled_at IS NOT NULL)
    OR (status <> 'settled' AND actual_microusd IS NULL))
);

CREATE INDEX ai_search_usage_reservations_owner_month_idx
  ON ai_search_usage_reservations(owner_id,month_start,created_at DESC);
CREATE INDEX ai_search_usage_reservations_open_idx
  ON ai_search_usage_reservations(status,created_at)
  WHERE status IN ('reserved','held');

ALTER TABLE ai_search_usage_reservations ENABLE ROW LEVEL SECURITY;
