import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

export const ADMIN_ACCESS_ACTIONS = [
  'admin_summary', 'admin_worker_status', 'admin_import_list', 'admin_audit_events', 'admin_user_list', 'admin_user_detail', 'admin_user_timeline',
  'support_deletion_queue', 'support_deletion_audit', 'admin_deletion_approve', 'admin_deletion_retry', 'admin_role_change',
] as const;

export type AdminAccessAction = typeof ADMIN_ACCESS_ACTIONS[number];
export type AdminRole = 'none' | 'support' | 'admin';

// Keep denied-access records useful for security review without preserving paths,
// target IDs, query strings, request bodies, or other owner-provided data.
export async function recordAdminAccessDenied(database: DatabaseHandle, actorId: string, action: AdminAccessAction,
  requiredRole: Exclude<AdminRole, 'none'>, actualRole: AdminRole): Promise<void> {
  await database.prepare(`INSERT INTO admin_access_audit (id,actor_user_id,event_type,target_hash,metadata,created_at)
    VALUES (?,?,'admin_access_denied',NULL,?,?)`).run(randomUUID(), actorId,
      JSON.stringify({ action, requiredRole, actualRole }), new Date().toISOString());
}
