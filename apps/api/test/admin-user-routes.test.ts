import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';

const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>) {
  const database = await createTestDatabase();
  const root = await mkdtemp(join(tmpdir(), 'rembr-admin-users-'));
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
  return { cookie: (response.headers.get('set-cookie') ?? '').split(';')[0]!, userId: (await response.json() as { user: { id: string } }).user.id };
}

test('admin user search and detail are admin-only, bounded, sanitized, no-store, and audited without raw search text', async () => {
  await withApi(async (baseUrl, database) => {
    const target = await register(baseUrl, 'lookup-target@example.test');
    const member = await register(baseUrl, 'lookup-member@example.test');
    const support = await register(baseUrl, 'lookup-support@example.test');
    const admin = await register(baseUrl, 'lookup-admin@example.test');
    const targetCreatedAt = (await database.prepare('SELECT created_at FROM users WHERE id=?').get(target.userId) as { created_at: string }).created_at;
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'support',?)`).run(support.userId, now);
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now);
    await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run('lookup-item', target.userId, 'https://example.test/private-path', 'https://example.test/private-path',
      'Sensitive saved title', 'ready', now, now);
    await database.prepare(`INSERT INTO profiles (user_id,username,created_at,updated_at) VALUES (?,?,?,?)`)
      .run(target.userId, 'lookup_target', now, now);
    await database.prepare(`INSERT INTO account_security_events (id,owner_id,event_type,created_at) VALUES (?,?,?,?)`)
      .run('lookup-security-event', target.userId, 'sign_in', now);
    await database.prepare(`INSERT INTO account_deletion_requests
      (id,owner_id,owner_hash,status,export_confirmed,requested_at,available_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run('lookup-deletion', target.userId, 'd'.repeat(64), 'pending_approval', true, now, now, now, now);

    const route = `${baseUrl}/api/admin/users`;
    assert.equal((await fetch(route)).status, 401);
    assert.equal((await fetch(`${route}?query=lookup`, { headers: { Cookie: member.cookie } })).status, 403);
    assert.equal((await fetch(`${route}?query=lookup`, { headers: { Cookie: support.cookie } })).status, 403);
    assert.equal((await fetch(`${route}/${target.userId}`, { headers: { Cookie: support.cookie } })).status, 403);
    assert.equal((await fetch(`${route}/${target.userId}`, { headers: { Cookie: member.cookie } })).status, 403);
    assert.equal((await fetch(`${route}?query=ab`, { headers: { Cookie: admin.cookie } })).status, 400);
    assert.equal((await fetch(`${route}?query=lookup&limit=51`, { headers: { Cookie: admin.cookie } })).status, 400);
    assert.equal((await fetch(`${route}?query=lookup&offset=100001`, { headers: { Cookie: admin.cookie } })).status, 400);

    const search = await fetch(`${route}?query=lookup-target&limit=1`, { headers: { Cookie: admin.cookie } });
    assert.equal(search.status, 200);
    assert.equal(search.headers.get('cache-control'), 'private, no-store, max-age=0');
    const list = await search.json() as { users: Array<Record<string, unknown>>; nextOffset: number | null };
    assert.deepEqual(list.users, [{ userId: target.userId, email: 'lookup-target@example.test', accountStatus: 'active', createdAt: targetCreatedAt }]);
    assert.equal(list.nextOffset, null);
    assert.equal(JSON.stringify(list).includes('password_hash'), false);
    const wildcard = await fetch(`${route}?query=lookup%25&limit=10`, { headers: { Cookie: admin.cookie } });
    assert.deepEqual((await wildcard.json() as { users: unknown[] }).users, [], 'percent is treated as a literal character');
    const firstPage = await fetch(`${route}?query=lookup&limit=1`, { headers: { Cookie: admin.cookie } });
    const firstPageBody = await firstPage.json() as { users: unknown[]; nextOffset: number | null };
    assert.equal(firstPageBody.users.length, 1);
    assert.equal(firstPageBody.nextOffset, 1);
    const secondPage = await fetch(`${route}?query=lookup&limit=1&offset=1`, { headers: { Cookie: admin.cookie } });
    const secondPageBody = await secondPage.json() as { users: unknown[]; nextOffset: number | null };
    assert.equal(secondPageBody.users.length, 1);
    assert.equal(secondPageBody.nextOffset, 2);

    const detailResponse = await fetch(`${route}/${target.userId}`, { headers: { Cookie: admin.cookie } });
    assert.equal(detailResponse.status, 200);
    assert.equal(detailResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
    const detail = await detailResponse.json() as { user: Record<string, unknown> };
    const serialized = JSON.stringify(detail);
    assert.equal((detail.user.dataCategories as Array<{ id: string; rowCount: number }>).find(({ id }) => id === 'saved_library')?.rowCount, 1);
    assert.equal((detail.user.recentSecurityActivity as Array<{ eventType: string }>)[0]?.eventType, 'sign_in');
    assert.deepEqual(detail.user.latestDeletion, { status: 'pending_approval', requestedAt: now, completedAt: null });
    for (const sensitive of ['Sensitive saved title', 'private-path', password, 'password_hash', 'token_hash']) assert.equal(serialized.includes(sensitive), false);

    const audits = await database.prepare(`SELECT actor_user_id,event_type,target_hash,metadata FROM admin_access_audit ORDER BY created_at,id`)
      .all() as Array<{ actor_user_id: string; event_type: string; target_hash: string | null; metadata: unknown }>;
    assert.equal(audits.length, 5);
    assert.deepEqual(audits.slice(0, 4).map(({ event_type, target_hash }) => [event_type, target_hash]), [
      ['admin_user_list_viewed', null], ['admin_user_list_viewed', null],
      ['admin_user_list_viewed', null], ['admin_user_list_viewed', null],
    ]);
    assert.deepEqual([audits[4]!.event_type, audits[4]!.target_hash], [
      'admin_user_detail_viewed', createHash('sha256').update(target.userId).digest('hex'),
    ]);
    assert.ok(audits.every(({ actor_user_id }) => actor_user_id === admin.userId));
    const auditText = JSON.stringify(audits);
    assert.equal(auditText.includes('lookup-target@example.test'), false);
    assert.equal(auditText.includes(target.userId), false);
    assert.equal(auditText.includes('query'), true, 'list audit retains only query presence and length metadata');
    assert.equal((await database.prepare(`SELECT relrowsecurity FROM pg_class WHERE relname='admin_access_audit'`).get() as { relrowsecurity: boolean }).relrowsecurity, true);
  });
});

test('admin operations overview returns aggregate-only counts to admins and audits the read', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'overview-owner@example.test');
    const support = await register(baseUrl, 'overview-support@example.test');
    const admin = await register(baseUrl, 'overview-admin@example.test');
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'support',?)`).run(support.userId, now);
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now);
    await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run('overview-item', owner.userId, 'https://example.test/private-path', 'https://example.test/private-path',
      'Private item title', 'ready', now, now);

    const route = `${baseUrl}/api/admin/summary`;
    assert.equal((await fetch(route)).status, 401);
    assert.equal((await fetch(route, { headers: { Cookie: support.cookie } })).status, 403);
    const response = await fetch(route, { headers: { Cookie: admin.cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    const body = await response.json() as { summary: { accounts: { total: number; active: number }; savedItems: { total: number; byStatus: Record<string, number> } } };
    assert.equal(body.summary.accounts.total, 3);
    assert.equal(body.summary.accounts.active, 3);
    assert.equal(body.summary.savedItems.total, 1);
    assert.equal(body.summary.savedItems.byStatus.ready, 1);
    const serialized = JSON.stringify(body);
    for (const sensitive of ['Private item title', 'private-path', owner.userId, owner.cookie, password]) assert.equal(serialized.includes(sensitive), false);
    const audit = await database.prepare(`SELECT actor_user_id,event_type,target_hash,metadata FROM admin_access_audit WHERE event_type='admin_summary_viewed'`)
      .get() as { actor_user_id: string; event_type: string; target_hash: string | null; metadata: unknown };
    assert.equal(audit.actor_user_id, admin.userId);
    assert.equal(audit.target_hash, null);
    assert.deepEqual(audit.metadata, {});
  });
});

test('worker status is admin-only, aggregate-only, no-store, and durably audited', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'worker-owner@example.test');
    const member = await register(baseUrl, 'worker-member@example.test');
    const support = await register(baseUrl, 'worker-support@example.test');
    const admin = await register(baseUrl, 'worker-admin@example.test');
    const now = new Date().toISOString();
    const queuedAt = '2026-10-29T08:30:00.000Z';
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'support',?)`).run(support.userId, now);
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now);
    await database.prepare(`INSERT INTO imports (id,owner_id,request_id,source,status,created_at,updated_at)
      VALUES (?,?,?,'instagram','queued',?,?)`).run('worker-import', owner.userId, 'worker-request', queuedAt, now);
    await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'queued',?,?)`).run('worker-item', owner.userId, 'https://example.test/private-url', 'https://example.test/private-url', 'Private title', queuedAt, now);
    await database.prepare(`INSERT INTO processing_jobs (id,owner_id,item_id,import_id,correlation_id,status,available_at,created_at,updated_at)
      VALUES (?,?,?,?,?,'retry_wait',?,?,?)`).run('worker-job', owner.userId, 'worker-item', 'worker-import', 'worker-correlation', queuedAt, queuedAt, now);
    await database.prepare(`INSERT INTO ai_analysis_jobs (id,owner_id,import_id,item_id,status,available_at,created_at,updated_at)
      VALUES (?,?,?,?,'queued',?,?,?)`).run('worker-ai-job', owner.userId, 'worker-import', 'worker-item', queuedAt, queuedAt, now);
    await database.prepare(`INSERT INTO account_data_exports (id,owner_id,status,include_files,created_at,updated_at)
      VALUES (?,?,'queued',FALSE,?,?)`).run('worker-export', owner.userId, queuedAt, now);

    const route = `${baseUrl}/api/admin/worker/status`;
    assert.equal((await fetch(route)).status, 401);
    assert.equal((await fetch(route, { headers: { Cookie: member.cookie } })).status, 403);
    assert.equal((await fetch(route, { headers: { Cookie: support.cookie } })).status, 403);
    const response = await fetch(route, { headers: { Cookie: admin.cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    const body = await response.json() as { workerStatus: Record<string, unknown> & {
      processingJobs: { waiting: number; processing: number; oldestQueuedAt: string | null };
      imports: { waiting: number; processing: number; oldestQueuedAt: string | null };
      aiAnalysisJobs: { waiting: number; processing: number; oldestQueuedAt: string | null };
      exports: { waiting: number; processing: number; oldestQueuedAt: string | null };
    } };
    assert.equal(body.workerStatus.processingJobs.waiting, 1);
    assert.equal(body.workerStatus.processingJobs.oldestQueuedAt, queuedAt);
    assert.equal(body.workerStatus.imports.waiting, 1);
    assert.equal(body.workerStatus.imports.oldestQueuedAt, queuedAt);
    assert.equal(body.workerStatus.aiAnalysisJobs.waiting, 1);
    assert.equal(body.workerStatus.aiAnalysisJobs.oldestQueuedAt, queuedAt);
    assert.equal(body.workerStatus.exports.waiting, 1);
    assert.equal(body.workerStatus.exports.oldestQueuedAt, queuedAt);
    const serialized = JSON.stringify(body);
    for (const sensitive of ['Private title', 'private-url', owner.userId, owner.cookie, 'worker-job', 'worker-export']) assert.equal(serialized.includes(sensitive), false);
    assert.deepEqual(Object.keys(body.workerStatus).sort(), ['aiAnalysisJobs', 'exports', 'imports', 'processingJobs', 'sampledAt'].sort());
    const audit = await database.prepare(`SELECT actor_user_id,event_type,target_hash,metadata FROM admin_access_audit
      WHERE event_type='admin_worker_status_viewed'`).get() as { actor_user_id: string; event_type: string; target_hash: string | null; metadata: unknown };
    assert.deepEqual(audit, { actor_user_id: admin.userId, event_type: 'admin_worker_status_viewed', target_hash: null, metadata: {} });
  });
});
