import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { createAccountDeletionService } from '../src/account/deletion-service.js';
import { ACCOUNT_OWNER_TABLES } from '../src/account/data-map-service.js';
import { OwnerLifecycleError, withOwnerWorkLease } from '../src/account/owner-lifecycle.js';

const password = 'correct-horse-battery-staple';

test('account data map inventory covers every owner_id and user_id table in the live schema', async () => {
  await withApi(async (_baseUrl, database) => {
    const rows = await database.prepare(`SELECT DISTINCT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name IN ('owner_id','user_id') ORDER BY table_name`).all() as Array<{ table_name: string }>;
    const inventoried = new Set(ACCOUNT_OWNER_TABLES.map(({ table }) => table));
    // Operational rows are excluded from exports; account deletion drains the media queue and expired work leases.
    const excludedOperationalTables = new Set(['account_owner_work_leases', 'media_cleanup_queue']);
    const missing = rows.map(({ table_name }) => table_name)
      .filter((table) => !inventoried.has(table) && !excludedOperationalTables.has(table));
    assert.deepEqual(missing, [], `owner_id/user_id tables missing from export/deletion inventory: ${missing.join(', ')}`);
  });
});

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>) {
  const database = await createTestDatabase();
  const root = await mkdtemp(join(tmpdir(), 'rembr-deletion-'));
  const app = createApp(database, { assetDirectory: join(root, 'assets'), importDirectory: join(root, 'imports'), mediaDirectory: join(root, 'media') });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database); }
  finally { server.closeAllConnections(); server.close(); await database.close(); await rm(root, { recursive: true, force: true }); }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 201);
  return {
    cookie: (response.headers.get('set-cookie') ?? '').split(';')[0]!,
    userId: (await response.json() as { user: { id: string } }).user.id,
  };
}

test('owner deletion request freezes account, survives refresh, and can be cancelled before approval', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'delete-owner@example.test');
    const missingConfirmation = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: false }),
    });
    assert.equal(missingConfirmation.status, 400);

    const created = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: true }),
    });
    assert.equal(created.status, 202);
    assert.equal((await created.json() as { deletion: { status: string } }).deletion.status, 'pending_approval');
    assert.equal((await database.prepare('SELECT account_status FROM users WHERE id=?').get(owner.userId) as { account_status: string }).account_status, 'disabled');
    assert.equal((await fetch(`${baseUrl}/api/profile`, { headers: { Cookie: owner.cookie } })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: owner.cookie } })).status, 200);

    const refresh = await fetch(`${baseUrl}/api/account/deletion`, { headers: { Cookie: owner.cookie } });
    assert.equal(refresh.status, 200);
    assert.equal((await refresh.json() as { deletion: { status: string } }).deletion.status, 'pending_approval');
    assert.equal(refresh.headers.get('cache-control'), 'private, no-store, max-age=0');

    const cancelled = await fetch(`${baseUrl}/api/account/deletion/cancel`, { method: 'POST', headers: { Cookie: owner.cookie } });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json() as { deletion: { status: string } }).deletion.status, 'cancelled');
    assert.equal((await database.prepare('SELECT account_status FROM users WHERE id=?').get(owner.userId) as { account_status: string }).account_status, 'active');
    assert.equal((await fetch(`${baseUrl}/api/profile`, { headers: { Cookie: owner.cookie } })).status, 200);
    assert.equal((await database.prepare("SELECT count(*) AS count FROM account_deletion_audit WHERE owner_hash IS NOT NULL").get() as { count: number }).count, 2);
  });
});

test('support can review minimal deletion records while only admins can approve', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'delete-target@example.test');
    const support = await register(baseUrl, 'delete-support@example.test');
    const admin = await register(baseUrl, 'delete-admin@example.test');
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'support',?)`).run(support.userId, now);
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now);
    const requested = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: true }),
    });
    assert.equal(requested.status, 202);
    const deletionId = (await requested.json() as { deletion: { id: string } }).deletion.id;

    const queue = await fetch(`${baseUrl}/api/admin/account-deletions`, { headers: { Cookie: support.cookie } });
    assert.equal(queue.status, 200);
    const queueText = await queue.text();
    assert.ok(queueText.includes(deletionId));
    assert.ok(!queueText.includes(owner.userId));
    assert.ok(!queueText.includes('delete-target@example.test'));

    const deniedApproval = await fetch(`${baseUrl}/api/admin/account-deletions/${deletionId}/approve`, { method: 'POST', headers: { Cookie: support.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    assert.equal(deniedApproval.status, 403);
    const missingConfirmation = await fetch(`${baseUrl}/api/admin/account-deletions/${deletionId}/approve`, { method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: false }) });
    assert.equal(missingConfirmation.status, 400);
    const service = createAccountDeletionService(database);
    await assert.rejects(service.approve(deletionId, support.userId),
      (cause: unknown) => cause instanceof Error && cause.message === 'admin_role_required');
    const approved = await fetch(`${baseUrl}/api/admin/account-deletions/${deletionId}/approve`, { method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    assert.equal(approved.status, 200);
    assert.equal((await approved.json() as { deletion: { status: string } }).deletion.status, 'approved');
    assert.equal((await fetch(`${baseUrl}/api/account/deletion/cancel`, { method: 'POST', headers: { Cookie: owner.cookie } })).status, 409);
  });
});

test('deletion worker retries a failed storage step and retains only a hash-backed audit trail', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'delete-retry-target@example.test');
    const admin = await register(baseUrl, 'delete-retry-admin@example.test');
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now);
    const itemId = 'delete-retry-item';
    await database.prepare(`INSERT INTO saved_items
      (id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at)
      VALUES (?,?,?,?,'Private title','Private description','ready',?,?)`)
      .run(itemId, owner.userId, 'https://example.com/delete-retry', 'https://example.com/delete-retry', now, now);
    const assetKey = '11111111-1111-4111-8111-111111111111.asset';
    await database.prepare(`INSERT INTO asset_objects
      (id,owner_id,kind,storage_key,detected_mime,byte_size,sha256,state,created_at,updated_at)
      VALUES (?,?, 'avatar',?,'image/png',8,?,'ready',?,?)`)
      .run('delete-retry-asset', owner.userId, assetKey, 'a'.repeat(64), now, now);

    const request = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: true }),
    });
    const deletionId = (await request.json() as { deletion: { id: string } }).deletion.id;
    const service = createAccountDeletionService(database);
    await service.approve(deletionId, admin.userId);
    let failOnce = true;
    const removedAssets: string[] = [];
    let activeRemovals = 0;
    let maxActiveRemovals = 0;
    const storage = {
      assets: { async remove(key: string) {
        activeRemovals += 1;
        maxActiveRemovals = Math.max(maxActiveRemovals, activeRemovals);
        removedAssets.push(key);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeRemovals -= 1;
        if (failOnce) { failOnce = false; throw new Error('storage temporarily unavailable'); }
      } },
      imports: { async removeFile() {} },
      media: { async remove() {} },
      exports: { async remove() {} },
    };
    const firstClaim = await service.claimNext();
    assert.ok(firstClaim);
    assert.equal((await service.processClaim(firstClaim, storage))?.status, 'partial_failed');
    assert.equal((await database.prepare('SELECT count(*) AS count FROM users WHERE id=?').get(owner.userId) as { count: number }).count, 1);

    await service.retry(deletionId, admin.userId);
    const retryClaim = await service.claimNext();
    assert.ok(retryClaim);
    assert.equal((await service.processClaim(retryClaim, storage))?.status, 'completed');
    assert.deepEqual(removedAssets, [assetKey, assetKey]);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM users WHERE id=?').get(owner.userId) as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM saved_items WHERE owner_id=?').get(owner.userId) as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM asset_objects WHERE owner_id=?').get(owner.userId) as { count: number }).count, 0);
    const retained = await database.prepare('SELECT owner_id,status,owner_hash FROM account_deletion_requests WHERE id=?').get(deletionId) as
      { owner_id: string | null; status: string; owner_hash: string };
    assert.equal(retained.owner_id, null);
    assert.equal(retained.status, 'completed');
    assert.equal(retained.owner_hash.length, 64);
    assert.equal((await database.prepare('SELECT operator_retry_count FROM account_deletion_requests WHERE id=?').get(deletionId) as { operator_retry_count: number }).operator_retry_count, 1);
    assert.equal((await database.prepare("SELECT count(*) AS count FROM account_deletion_steps WHERE request_id=? AND status='completed'").get(deletionId) as { count: number }).count, 5);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM account_deletion_audit WHERE request_id=?').get(deletionId) as { count: number }).count > 5, true);
    assert.ok(maxActiveRemovals <= 20, `storage cleanup exceeded the batch bound: ${maxActiveRemovals}`);
    assert.equal(typeof (await database.prepare("SELECT progress_cursor FROM account_deletion_steps WHERE request_id=? AND step_key='remove_storage'").get(deletionId) as { progress_cursor: string | null }).progress_cursor, 'string');
  });
});

test('account deletion removes owner-tagged queued media bytes with no remaining artifact row', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'delete-queued-media@example.test');
    const admin = await register(baseUrl, 'delete-queued-media-admin@example.test');
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, new Date().toISOString());
    const key = 'orphaned-private-media.media';
    await database.prepare('INSERT INTO admin_roles (user_id,role,granted_by,created_at) VALUES (?,?,?,?)')
      .run(owner.userId, 'support', admin.userId, new Date().toISOString());
    await database.prepare(`INSERT INTO media_cleanup_queue (storage_key,owner_id,created_at,updated_at) VALUES (?,?,?,?)`)
      .run(key, owner.userId, new Date().toISOString(), new Date().toISOString());

    const requested = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: true }),
    });
    const deletionId = (await requested.json() as { deletion: { id: string } }).deletion.id;
    const service = createAccountDeletionService(database);
    await service.approve(deletionId, admin.userId);
    const claim = await service.claimNext();
    assert.ok(claim);
    const removed: string[] = [];
    const storage = {
      assets: { async remove() {} }, imports: { async removeFile() {} },
      media: { async remove(storageKey: string) { removed.push(storageKey); } },
      exports: { async remove() {} },
    };
    assert.equal((await service.processClaim(claim, storage))?.status, 'completed');
    assert.deepEqual(removed, [key]);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM media_cleanup_queue WHERE owner_id=?').get(owner.userId) as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM admin_roles WHERE user_id=?').get(owner.userId) as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM users WHERE id=?').get(owner.userId) as { count: number }).count, 0);
  });
});

test('freeze blocks new provider dispatch and deletion drains work admitted before the freeze', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'delete-dispatch-target@example.test');
    const admin = await register(baseUrl, 'delete-dispatch-admin@example.test');
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, new Date().toISOString());

    let signalStarted!: () => void;
    let releaseWork!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const providerWork = withOwnerWorkLease(database, owner.userId, 'ai_analysis', async () => {
      signalStarted();
      await new Promise<void>((resolve) => { releaseWork = resolve; });
    });
    await started;

    const requested = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: true }),
    });
    const deletionId = (await requested.json() as { deletion: { id: string } }).deletion.id;
    await assert.rejects(withOwnerWorkLease(database, owner.userId, 'visual_search', async () => 'must not run'),
      (cause: unknown) => cause instanceof OwnerLifecycleError && cause.code === 'account_inactive');

    const service = createAccountDeletionService(database);
    await service.approve(deletionId, admin.userId);
    const firstClaim = await service.claimNext();
    assert.ok(firstClaim);
    const storage = { assets: { async remove() {} }, imports: { async removeFile() {} }, media: { async remove() {} }, exports: { async remove() {} } };
    assert.equal((await service.processClaim(firstClaim, storage))?.status, 'approved');
    assert.equal((await database.prepare('SELECT count(*) AS count FROM users WHERE id=?').get(owner.userId) as { count: number }).count, 1);

    releaseWork();
    await providerWork;
    const eligibleAt = new Date(Date.now() + 35_000);
    const releasedLease = await database.prepare('SELECT count(*) AS count FROM account_owner_work_leases WHERE owner_id=? AND expires_at>?')
      .get(owner.userId, new Date().toISOString()) as { count: number };
    const pendingRetry = await database.prepare('SELECT status,available_at FROM account_deletion_requests WHERE id=?')
      .get(deletionId) as { status: string; available_at: string };
    assert.equal(Number(releasedLease.count), 0);
    assert.equal(pendingRetry.status, 'approved');
    assert.ok(pendingRetry.available_at <= eligibleAt.toISOString());
    const retryClaim = await service.claimNext(eligibleAt);
    assert.ok(retryClaim);
    assert.equal((await service.processClaim(retryClaim, storage))?.status, 'completed');
  });
});

test('owner work lease retries transient heartbeat errors without aborting live work', async () => {
  await withApi(async (_baseUrl, database) => {
    const owner = await register(_baseUrl, 'lease-heartbeat-retry@example.test');
    const originalPrepare = database.prepare.bind(database);
    let renewAttempts = 0;
    (database as unknown as { prepare: typeof database.prepare }).prepare = ((sql: string) => {
      const statement = originalPrepare(sql);
      if (!sql.includes('UPDATE account_owner_work_leases SET expires_at=?')) return statement;
      return {
        ...statement,
        get: async (...values: unknown[]) => {
          renewAttempts += 1;
          if (renewAttempts === 1) throw new Error('temporary database disconnect');
          return statement.get(...values);
        },
      } as typeof statement;
    }) as typeof database.prepare;
    try {
      const result = await withOwnerWorkLease(database, owner.userId, 'ai_analysis', async (signal) => {
        const initial = await originalPrepare('SELECT expires_at FROM account_owner_work_leases WHERE owner_id=?').get(owner.userId) as { expires_at: string };
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(signal.aborted, false);
        const renewed = await originalPrepare('SELECT expires_at FROM account_owner_work_leases WHERE owner_id=?').get(owner.userId) as { expires_at: string };
        return { initial: initial.expires_at, renewed: renewed.expires_at };
      }, new Date(), 10);
      assert.ok(renewAttempts >= 2, 'heartbeat should retry after the transient database error');
      assert.ok(result.renewed > result.initial, 'the retry should extend the lease expiry');
    } finally {
      (database as unknown as { prepare: typeof database.prepare }).prepare = originalPrepare;
    }
  });
});

test('owner work lease aborts only after the database confirms its row is gone', async () => {
  await withApi(async (_baseUrl, database) => {
    const owner = await register(_baseUrl, 'lease-confirmed-loss@example.test');
    let started!: () => void;
    const workStarted = new Promise<void>((resolve) => { started = resolve; });
    const running = withOwnerWorkLease(database, owner.userId, 'ai_analysis', async (signal) => {
      started();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      return 'aborted';
    }, new Date(), 10);
    await workStarted;
    await database.prepare('DELETE FROM account_owner_work_leases WHERE owner_id=?').run(owner.userId);
    await assert.rejects(running, (cause: unknown) => cause instanceof OwnerLifecycleError && cause.code === 'work_lease_lost');
  });
});

test('admin retry recovers a max-attempt deletion after identity removal but before step logging', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'delete-crash-target@example.test');
    const admin = await register(baseUrl, 'delete-crash-admin@example.test');
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, new Date().toISOString());
    const requested = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: true }),
    });
    const deletionId = (await requested.json() as { deletion: { id: string } }).deletion.id;
    const service = createAccountDeletionService(database);
    await service.approve(deletionId, admin.userId);

    await database.prepare(`UPDATE account_deletion_steps SET status='completed' WHERE request_id=?
      AND step_key IN ('quiesce_workers','revoke_access','remove_storage','delete_owner_records')`).run(deletionId);
    await database.prepare('DELETE FROM users WHERE id=?').run(owner.userId);
    await database.prepare(`UPDATE account_deletion_requests SET status='failed',attempt_count=max_attempts,error_code='attempts_exhausted'
      WHERE id=?`).run(deletionId);

    await assert.rejects(service.retry(deletionId, owner.userId),
      (cause: unknown) => cause instanceof Error && cause.message === 'admin_role_required');
    await service.retry(deletionId, admin.userId);
    const reset = await database.prepare('SELECT status,owner_id,attempt_count,operator_retry_count FROM account_deletion_requests WHERE id=?')
      .get(deletionId) as { status: string; owner_id: string | null; attempt_count: number; operator_retry_count: number };
    assert.equal(reset.status, 'approved');
    assert.equal(reset.owner_id, null);
    assert.equal(Number(reset.attempt_count), 0);
    assert.equal(Number(reset.operator_retry_count), 1);

    const claim = await service.claimNext();
    assert.ok(claim);
    const storage = { assets: { async remove() {} }, imports: { async removeFile() {} }, media: { async remove() {} }, exports: { async remove() {} } };
    assert.equal((await service.processClaim(claim, storage))?.status, 'completed');
    assert.equal((await database.prepare("SELECT count(*) AS count FROM account_deletion_audit WHERE request_id=? AND event_type='retry_requested'")
      .get(deletionId) as { count: number }).count, 1);
  });
});
