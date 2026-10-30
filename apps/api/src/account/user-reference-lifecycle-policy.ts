export interface UserReferenceLifecycleException {
  table: string;
  column: string;
  lifecycle: 'operational' | 'audit' | 'operator_identity';
  reason: string;
}

// These direct users(id) references are intentionally outside the owner data map.
// The schema-backed inventory test requires an explicit lifecycle reason for each.
export const ACCOUNT_USER_REFERENCE_EXCEPTIONS: readonly UserReferenceLifecycleException[] = [
  {
    table: 'account_deletion_audit', column: 'actor_user_id', lifecycle: 'audit',
    reason: 'Minimal pseudonymous deletion audit actor reference; retained only while the workflow is unresolved or within the 90-day terminal audit window.',
  },
  {
    table: 'account_deletion_requests', column: 'approved_by', lifecycle: 'operator_identity',
    reason: 'Approving operator identity is workflow metadata; terminal deletion history is purged after 90 days.',
  },
  {
    table: 'account_owner_work_leases', column: 'owner_id', lifecycle: 'operational',
    reason: 'Short-lived coordination lease used to fence owner writes and deletion; it is not personal export content and expires with the lease.',
  },
  {
    table: 'admin_access_audit', column: 'actor_user_id', lifecycle: 'audit',
    reason: 'Redacted administrator access audit actor reference; rows are retained for 90 days and are not included in personal exports.',
  },
  {
    table: 'admin_roles', column: 'granted_by', lifecycle: 'operator_identity',
    reason: 'Granting operator identity is excluded from personal exports; the owner’s own role is exported and role rows follow account deletion.',
  },
  {
    table: 'media_cleanup_queue', column: 'owner_id', lifecycle: 'operational',
    reason: 'Owner-attributed private object cleanup intent is drained during deletion; it is operational queue state and excluded from exports.',
  },
];
