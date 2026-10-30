import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from '../src/db/database.js';
import { InitialAdminProvisioningError, provisionInitialAdmin } from '../src/account/admin-provisioning.js';
import { parseProvisionAdminArgs } from '../scripts/provision-admin.js';

async function withDatabase(run: (database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>) {
  const database = await createTestDatabase();
  try { await run(database); } finally { await database.close(); }
}

async function addUser(database: Awaited<ReturnType<typeof createTestDatabase>>, id: string, email: string) {
  await database.prepare(`INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)`)
    .run(id, email, 'test-hash', new Date().toISOString());
}

test('initial admin CLI requires explicit single-use confirmation and a fixed admin role', () => {
  assert.throws(() => parseProvisionAdminArgs(['--email', 'ops@example.test', '--role', 'admin']), /usage:/);
  assert.throws(() => parseProvisionAdminArgs(['--email', 'ops@example.test', '--role', 'support', '--confirm', 'yes']), /usage:/);
  assert.throws(() => parseProvisionAdminArgs(['--email', 'ops@example.test', '--role', 'admin', '--confirm', 'yes', '--confirm', 'yes']), /invalid_arguments/);
  assert.deepEqual(parseProvisionAdminArgs(['--email', 'ops@example.test', '--role', 'admin', '--confirm', 'yes']), {
    email: 'ops@example.test', role: 'admin', confirm: true,
  });
});

test('initial admin provisioning fails closed for missing confirmation, invalid, missing, inactive, or ambiguous accounts', async () => {
  await withDatabase(async (database) => {
    await addUser(database, 'inactive', 'inactive@example.test');
    await database.prepare(`UPDATE users SET account_status='disabled' WHERE id='inactive'`).run();
    await addUser(database, 'duplicate-a', 'duplicate@example.test');
    await addUser(database, 'duplicate-b', 'DUPLICATE@example.test');

    const cases = [
      { input: { email: 'ops@example.test', confirm: false }, code: 'confirmation_required' },
      { input: { email: 'not-an-email', confirm: true }, code: 'invalid_email' },
      { input: { email: 'missing@example.test', confirm: true }, code: 'account_not_found' },
      { input: { email: 'inactive@example.test', confirm: true }, code: 'account_inactive' },
      { input: { email: 'duplicate@example.test', confirm: true }, code: 'account_ambiguous' },
    ] as const;

    for (const { input, code } of cases) {
      await assert.rejects(provisionInitialAdmin(database, input), (error: unknown) =>
        error instanceof InitialAdminProvisioningError && error.code === code);
    }
    assert.equal(await database.prepare('SELECT count(*) AS count FROM admin_roles').get<{ count: number }>().then((row) => row?.count), 0);
  });
});

test('initial admin provisioning grants exactly one active account the admin role and refuses repeated bootstrap', async () => {
  await withDatabase(async (database) => {
    await addUser(database, 'first-admin', ' Operator@Example.test ');
    await provisionInitialAdmin(database, { email: 'operator@example.test', confirm: true, now: '2026-10-30T00:00:00.000Z' });

    const role = await database.prepare('SELECT user_id,role,granted_by,created_at FROM admin_roles').get<{
      user_id: string; role: string; granted_by: string | null; created_at: string;
    }>();
    assert.deepEqual(role, {
      user_id: 'first-admin', role: 'admin', granted_by: null, created_at: '2026-10-30T00:00:00.000Z',
    });
    await assert.rejects(provisionInitialAdmin(database, { email: 'operator@example.test', confirm: true }), (error: unknown) =>
      error instanceof InitialAdminProvisioningError && error.code === 'admin_already_provisioned');
    assert.equal(await database.prepare('SELECT count(*) AS count FROM admin_roles').get<{ count: number }>().then((row) => row?.count), 1);
  });
});
