ALTER TABLE account_activity_events
  DROP CONSTRAINT account_activity_events_event_type_check;

ALTER TABLE account_activity_events
  ADD CONSTRAINT account_activity_events_event_type_check
  CHECK (event_type IN (
    'data_export_requested', 'data_export_ready', 'data_export_partial', 'data_export_failed',
    'data_export_cancelled', 'data_export_retried', 'data_export_downloaded',
    'import_started', 'import_completed', 'import_failed', 'import_status_changed',
    'background_job_failed', 'background_job_blocked', 'background_job_retrying',
    'search_failed', 'analysis_used'
  ));
