ALTER TABLE admin_access_audit
  DROP CONSTRAINT admin_access_audit_event_type_check;

ALTER TABLE admin_access_audit
  ADD CONSTRAINT admin_access_audit_event_type_check
  CHECK (event_type IN (
    'admin_summary_viewed',
    'admin_worker_status_viewed',
    'admin_import_list_viewed',
    'admin_audit_events_viewed',
    'admin_user_list_viewed',
    'admin_user_detail_viewed',
    'admin_user_timeline_viewed',
    'admin_access_denied'
  ));
