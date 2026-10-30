CREATE INDEX account_deletion_completed_retention_idx
  ON account_deletion_requests(completed_at, id)
  WHERE status = 'completed';

CREATE INDEX account_deletion_cancelled_retention_idx
  ON account_deletion_requests(cancelled_at, id)
  WHERE status = 'cancelled';

CREATE INDEX account_data_exports_terminal_retention_idx
  ON account_data_exports(updated_at, id)
  WHERE status IN ('expired', 'failed', 'cancelled') AND artifact_key IS NULL;
