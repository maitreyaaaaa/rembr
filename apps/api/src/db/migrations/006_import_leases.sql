ALTER TABLE imports ADD COLUMN lease_token TEXT;
ALTER TABLE imports ADD COLUMN lease_expires_at TEXT;
CREATE INDEX imports_lease_idx ON imports(status, lease_expires_at);
