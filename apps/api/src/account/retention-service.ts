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
  return { searchEvents: search.changes, securityEvents: security.changes, adminAccessEvents: adminAccess.changes };
}
