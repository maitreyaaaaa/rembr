import type { DatabaseHandle } from '../db/database.js';

export const ACCOUNT_ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60_000;
const MAX_ACTIVITY_CLEANUP_BATCH = 500;

export async function cleanupExpiredAccountActivity(database: DatabaseHandle, now = new Date(), limit = MAX_ACTIVITY_CLEANUP_BATCH) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ACTIVITY_CLEANUP_BATCH) {
    throw new TypeError(`Account activity cleanup limit must be between 1 and ${MAX_ACTIVITY_CLEANUP_BATCH}.`);
  }
  const cutoff = new Date(now.getTime() - ACCOUNT_ACTIVITY_RETENTION_MS).toISOString();
  const search = await database.prepare(`WITH expired AS MATERIALIZED (
    SELECT id FROM search_events WHERE created_at<? ORDER BY created_at,id LIMIT ?
  ) DELETE FROM search_events WHERE id IN (SELECT id FROM expired)`).run(cutoff, limit);
  const security = await database.prepare(`WITH expired AS MATERIALIZED (
    SELECT id FROM account_security_events WHERE created_at<? ORDER BY created_at,id LIMIT ?
  ) DELETE FROM account_security_events WHERE id IN (SELECT id FROM expired)`).run(cutoff, limit);
  const adminAccess = await database.prepare(`WITH expired AS MATERIALIZED (
    SELECT id FROM admin_access_audit WHERE created_at<? ORDER BY created_at,id LIMIT ?
  ) DELETE FROM admin_access_audit WHERE id IN (SELECT id FROM expired)`).run(cutoff, limit);

  // Export artifacts expire after seven days. Keep their status history for at
  // most 90 days after the terminal status, and only purge rows whose private
  // artifact key has already been cleared by the storage cleanup worker.
  const exportHistory = await database.prepare(`WITH expired AS MATERIALIZED (
    SELECT id FROM account_data_exports WHERE status IN ('expired','failed','cancelled')
      AND artifact_key IS NULL AND updated_at<? ORDER BY updated_at,id LIMIT ?
  ) DELETE FROM account_data_exports WHERE id IN (SELECT id FROM expired)`).run(cutoff, limit);

  // Keep a minimal pseudonymous deletion record while the request is unresolved.
  // Once completed or cancelled, remove the audit and checkpoint rows after the
  // same 90-day window. Failed requests stay available for recovery/support.
  const deletionHistory = await database.transaction(async () => {
    const requests = await database.prepare(`SELECT id FROM account_deletion_requests
      WHERE (status='completed' AND completed_at<?) OR (status='cancelled' AND cancelled_at<?)
      ORDER BY COALESCE(completed_at,cancelled_at),id LIMIT ?`).all(cutoff, cutoff, limit) as Array<{ id: string }>;
    if (requests.length === 0) return { requests: 0, audits: 0 };
    const placeholders = requests.map(() => '?').join(',');
    const ids = requests.map(({ id }) => id);
    const audits = await database.prepare(`DELETE FROM account_deletion_audit WHERE request_id IN (${placeholders})`).run(...ids);
    const removed = await database.prepare(`DELETE FROM account_deletion_requests WHERE id IN (${placeholders})`).run(...ids);
    return { requests: removed.changes, audits: audits.changes };
  })();

  return {
    searchEvents: search.changes,
    securityEvents: security.changes,
    adminAccessEvents: adminAccess.changes,
    exportHistory: exportHistory.changes,
    deletionRequests: deletionHistory.requests,
    deletionAudits: deletionHistory.audits,
  };
}
