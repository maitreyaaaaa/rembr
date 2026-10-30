import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

export type OperatorRole = 'support' | 'admin';
export type DesiredOperatorRole = OperatorRole | null;

export class AdminRoleChangeError extends Error {
  constructor(readonly code: 'confirmation_required' | 'admin_role_required' | 'account_not_found' | 'account_inactive' | 'self_role_change' | 'role_unchanged' | 'last_admin') {
    super(code);
    this.name = 'AdminRoleChangeError';
  }
}

export async function changeAdminRole(database: DatabaseHandle, input: {
  actorId: string;
  targetId: string;
  role: DesiredOperatorRole;
  confirm: boolean;
  now?: Date;
}): Promise<{ previousRole: DesiredOperatorRole; role: DesiredOperatorRole }> {
  if (!input.confirm) throw new AdminRoleChangeError('confirmation_required');
  if (input.actorId === input.targetId) throw new AdminRoleChangeError('self_role_change');
  const now = (input.now ?? new Date()).toISOString();
  const targetHash = createHash('sha256').update(input.targetId).digest('hex');

  return database.transaction(async () => {
    // Serialize role changes with the one-time bootstrap and each other so two
    // concurrent demotions cannot remove the final active administrator.
    await database.prepare('LOCK TABLE admin_roles IN EXCLUSIVE MODE').run();
    const actor = await database.prepare('SELECT role FROM admin_roles WHERE user_id=?').get(input.actorId) as { role: string } | undefined;
    if (actor?.role !== 'admin') throw new AdminRoleChangeError('admin_role_required');
    const target = await database.prepare('SELECT account_status FROM users WHERE id=? FOR UPDATE').get(input.targetId) as { account_status: string } | undefined;
    if (!target) throw new AdminRoleChangeError('account_not_found');
    if (target.account_status !== 'active') throw new AdminRoleChangeError('account_inactive');
    const current = await database.prepare('SELECT role FROM admin_roles WHERE user_id=?').get(input.targetId) as { role: OperatorRole } | undefined;
    const previousRole = current?.role ?? null;
    if (previousRole === input.role) throw new AdminRoleChangeError('role_unchanged');

    if (previousRole === 'admin' && input.role !== 'admin') {
      const activeAdmins = await database.prepare(`SELECT count(*) AS total FROM admin_roles roles
        JOIN users account ON account.id=roles.user_id WHERE roles.role='admin' AND account.account_status='active'`).get() as { total: string | number };
      if (Number(activeAdmins.total) <= 1) throw new AdminRoleChangeError('last_admin');
    }

    if (input.role === null) {
      await database.prepare('DELETE FROM admin_roles WHERE user_id=?').run(input.targetId);
    } else {
      await database.prepare(`INSERT INTO admin_roles (user_id,role,granted_by,created_at) VALUES (?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,granted_by=excluded.granted_by,created_at=excluded.created_at`)
        .run(input.targetId, input.role, input.actorId, now);
    }

    const action = previousRole === null ? 'granted' : input.role === null ? 'revoked' : 'changed';
    await database.prepare(`INSERT INTO admin_access_audit (id,actor_user_id,event_type,target_hash,metadata,created_at)
      VALUES (?,?,'admin_role_changed',?,?,?)`).run(randomUUID(), input.actorId, targetHash,
        JSON.stringify({ action, previousRole, role: input.role }), now);
    return { previousRole, role: input.role };
  })();
}
