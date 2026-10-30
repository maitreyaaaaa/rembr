ALTER TABLE account_data_exports
  DROP CONSTRAINT account_data_exports_status_check;

ALTER TABLE account_data_exports
  ADD CONSTRAINT account_data_exports_status_check
  CHECK (status IN ('queued', 'processing', 'ready', 'partial', 'failed', 'cancelled', 'expired'));

ALTER TABLE account_data_exports
  DROP CONSTRAINT account_data_exports_check;

ALTER TABLE account_data_exports
  ADD CONSTRAINT account_data_exports_artifact_state_check
  CHECK (status NOT IN ('ready', 'partial') OR (artifact_key IS NOT NULL AND expires_at IS NOT NULL));
