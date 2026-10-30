CREATE INDEX search_events_retention_idx ON search_events(created_at,id);
CREATE INDEX account_security_events_retention_idx ON account_security_events(created_at,id);
