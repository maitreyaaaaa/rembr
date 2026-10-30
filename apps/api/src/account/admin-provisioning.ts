import type { DatabaseHandle } from '../db/database.js';

export type InitialAdminProvisioningErrorCode =
  | 'confirmation_required'
  | 'invalid_email'
  | 'account_not_found'
  | 'account_inactive'
  | 'account_ambiguous'
  | 'admin_already_provisioned';

export class InitialAdminProvisioningError extends Error {
  constructor(readonly code: InitialAdminProvisioningErrorCode) {
    super(code);
    this.name = 'InitialAdminProvisioningError';
  }
}

export async function provisionInitialAdmin(database: DatabaseHandle, input: {
  email: string;
  confirm: boolean;
  now?: string;
}): Promise<void> {
  if (!input.confirm) throw new InitialAdminProvisioningError('confirmation_required');
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InitialAdminProvisioningError('invalid_email');
  }

  await database.transaction(async () => {
    // Serialize the one-time bootstrap with every other role-table writer.
    await database.prepare('LOCK TABLE admin_roles IN EXCLUSIVE MODE').run();
    const existingRole = await database.prepare('SELECT user_id FROM admin_roles LIMIT 1').get();
    if (existingRole) throw new InitialAdminProvisioningError('admin_already_provisioned');

    const matches = await database.prepare(`SELECT id, account_status FROM users
      WHERE lower(trim(email))=?`).all(email) as Array<{ id: string; account_status: string }>;
    if (matches.length === 0) throw new InitialAdminProvisioningError('account_not_found');
    if (matches.length !== 1) throw new InitialAdminProvisioningError('account_ambiguous');
    if (matches[0]!.account_status !== 'active') throw new InitialAdminProvisioningError('account_inactive');

    await database.prepare(`INSERT INTO admin_roles (user_id,role,granted_by,created_at)
      VALUES (?,'admin',NULL,?)`).run(matches[0]!.id, input.now ?? new Date().toISOString());
  })();
}
