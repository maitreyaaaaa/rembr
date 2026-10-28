ALTER TABLE imports ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX imports_owner_idempotency_idx ON imports(owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
