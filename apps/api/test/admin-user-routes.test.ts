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
    await database.prepare(`INSERT INTO visual_embedding_jobs (id,owner_id,item_id,status,available_at,created_at,updated_at)
      VALUES (?,?,?,'queued',?,?,?)`).run('worker-visual-job', owner.userId, 'worker-item', queuedAt, queuedAt, now);
    await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'queued',?,?)`).run('worker-visual-item-2', owner.userId, 'https://example.test/private-url-2', 'https://example.test/private-url-2', 'Private title 2', queuedAt, now);
    await database.prepare(`INSERT INTO visual_embedding_jobs (id,owner_id,item_id,status,available_at,created_at,updated_at)
      VALUES (?,?,?,'processing',?,?,?)`).run('worker-visual-job-2', owner.userId, 'worker-visual-item-2', queuedAt, queuedAt, now);
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
      visualEmbeddingJobs: { waiting: number; processing: number; oldestQueuedAt: string | null };
      exports: { waiting: number; processing: number; oldestQueuedAt: string | null };
    } };
    assert.equal(body.workerStatus.processingJobs.waiting, 1);
    assert.equal(body.workerStatus.processingJobs.oldestQueuedAt, queuedAt);
    assert.equal(body.workerStatus.imports.waiting, 1);
    assert.equal(body.workerStatus.imports.oldestQueuedAt, queuedAt);
    assert.equal(body.workerStatus.aiAnalysisJobs.waiting, 1);
    assert.equal(body.workerStatus.aiAnalysisJobs.oldestQueuedAt, queuedAt);
    assert.equal(body.workerStatus.visualEmbeddingJobs.waiting, 1);
    assert.equal(body.workerStatus.visualEmbeddingJobs.processing, 1);
    assert.equal(body.workerStatus.visualEmbeddingJobs.oldestQueuedAt, queuedAt);
    assert.equal(body.workerStatus.exports.waiting, 1);
    assert.equal(body.workerStatus.exports.oldestQueuedAt, queuedAt);
    const serialized = JSON.stringify(body);
    for (const sensitive of ['Private title', 'private-url', owner.userId, owner.cookie, 'worker-job', 'worker-visual-job', 'worker-export']) assert.equal(serialized.includes(sensitive), false);
    assert.deepEqual(Object.keys(body.workerStatus).sort(), ['aiAnalysisJobs', 'exports', 'imports', 'processingJobs', 'sampledAt', 'visualEmbeddingJobs'].sort());
    const audit = await database.prepare(`SELECT actor_user_id,event_type,target_hash,metadata FROM admin_access_audit
      WHERE event_type='admin_worker_status_viewed'`).get() as { actor_user_id: string; event_type: string; target_hash: string | null; metadata: unknown };
    assert.deepEqual(audit, { actor_user_id: admin.userId, event_type: 'admin_worker_status_viewed', target_hash: null, metadata: {} });
  });
});

test('admin import list is bounded, role-restricted, redacted, no-store, and audited', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'imports-owner@example.test');
    const member = await register(baseUrl, 'imports-member@example.test');
    const support = await register(baseUrl, 'imports-support@example.test');
    const admin = await register(baseUrl, 'imports-admin@example.test');
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'support',?)`).run(support.userId, now);
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now);
    await database.prepare(`INSERT INTO imports (id,owner_id,request_id,source,status,file_count,total_bytes,parsed_count,new_count,duplicate_count,skipped_count,failed_count,created_at,updated_at,completed_at)
      VALUES (?,?,?,'x','partial',2,9000,4,2,1,1,0,?,?,?)`).run('private-import-key', owner.userId, 'private-request-id', now, now, now);
    await database.prepare(`INSERT INTO import_entries (id,owner_id,import_id,source_platform,status,created_at)
      VALUES (?,?,?,'x','duplicate',?)`).run('private-entry-id', owner.userId, 'private-import-key', now);
    await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'queued',?,?)`).run('private-import-item', owner.userId, 'https://example.test/private-url', 'https://example.test/private-url', 'Private import title', now, now);
    await database.prepare(`INSERT INTO processing_jobs (id,owner_id,item_id,import_id,correlation_id,status,available_at,created_at,updated_at)
      VALUES (?,?,?,?,?,'retry_wait',?,?,?)`).run('private-import-job', owner.userId, 'private-import-item', 'private-import-key', 'private-correlation', now, now, now);

    const route = `${baseUrl}/api/admin/imports`;
    assert.equal((await fetch(route)).status, 401);
    assert.equal((await fetch(route, { headers: { Cookie: member.cookie } })).status, 403);
    assert.equal((await fetch(route, { headers: { Cookie: support.cookie } })).status, 403);
    const response = await fetch(route, { headers: { Cookie: admin.cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    const body = await response.json() as { imports: Array<AdminImportRowForTest> };
    assert.equal(body.imports.length, 1);
    assert.match(body.imports[0]!.reference, /^[0-9a-f]{16}$/);
    assert.equal(body.imports[0]!.source, 'x');
    assert.equal(body.imports[0]!.status, 'partial');
    assert.equal(body.imports[0]!.fileCount, 2);
    assert.equal(body.imports[0]!.totalBytes, 9000);
    assert.deepEqual(body.imports[0]!.entries, { accepted: 0, duplicate: 1, skipped: 0, failed: 0 });
    assert.deepEqual(body.imports[0]!.jobs, { waiting: 1, processing: 0, completed: 0, failed: 0 });
    const serialized = JSON.stringify(body);
    for (const sensitive of ['private-import-key', 'private-request-id', 'private-entry-id', 'private-import-job', 'private-url', 'Private import title', owner.userId, owner.cookie, 'fileNames', 'error_code']) {
      assert.equal(serialized.includes(sensitive), false);
    }
    const audit = await database.prepare(`SELECT actor_user_id,event_type,target_hash,metadata FROM admin_access_audit
      WHERE event_type='admin_import_list_viewed'`).get() as { actor_user_id: string; event_type: string; target_hash: string | null; metadata: unknown };
    assert.deepEqual(audit, { actor_user_id: admin.userId, event_type: 'admin_import_list_viewed', target_hash: null, metadata: { limit: 50, resultCount: 1 } });
  });
});

test('admin audit browser filters and paginates redacted records without exposing identities or metadata', async () => {
  await withApi(async (baseUrl, database) => {
    const target = await register(baseUrl, 'audit-target@example.test');
    const member = await register(baseUrl, 'audit-member@example.test');
    const support = await register(baseUrl, 'audit-support@example.test');
    const admin = await register(baseUrl, 'audit-admin@example.test');
    const now = new Date();
    const timestamp = (delta: number) => new Date(now.getTime() - delta).toISOString();
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'support',?)`).run(support.userId, now.toISOString());
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now.toISOString());
    await database.prepare('DELETE FROM account_security_events').run();
    await database.prepare('DELETE FROM admin_access_audit').run();
    const ownerHash = createHash('sha256').update(target.userId).digest('hex');
    await database.prepare(`INSERT INTO account_security_events (id,owner_id,event_type,created_at) VALUES (?,?,?,?)`)
      .run('private-security-event-id', target.userId, 'sign_in', timestamp(1_000));
    await database.prepare(`INSERT INTO account_deletion_requests
      (id,owner_id,owner_hash,status,export_confirmed,requested_at,available_at,created_at,updated_at)
      VALUES (?,?,?,'pending_approval',TRUE,?,?,?,?)`).run('private-deletion-request-id', target.userId, ownerHash,
      timestamp(2_000), timestamp(2_000), timestamp(2_000), timestamp(2_000));
    await database.prepare(`INSERT INTO account_deletion_audit
      (id,request_id,owner_hash,actor_type,event_type,metadata,created_at) VALUES (?,?,?,'worker','step_completed',?,?)`)
      .run('private-deletion-event-id', 'private-deletion-request-id', ownerHash,
        JSON.stringify({ step: 'delete_owner_records', secret: 'private-audit-metadata' }), timestamp(2_000));
    await database.prepare(`INSERT INTO admin_access_audit (id,actor_user_id,event_type,target_hash,metadata,created_at)
      VALUES (?,?,'admin_summary_viewed',?,?,?)`).run('private-admin-event-id', admin.userId, ownerHash,
        JSON.stringify({ privateDetail: 'private-admin-metadata' }), timestamp(3_000));

    const route = `${baseUrl}/api/admin/audit-events`;
    assert.equal((await fetch(route)).status, 401);
    assert.equal((await fetch(route, { headers: { Cookie: member.cookie } })).status, 403);
    assert.equal((await fetch(route, { headers: { Cookie: support.cookie } })).status, 403);
    const firstResponse = await fetch(`${route}?limit=2`, { headers: { Cookie: admin.cookie } });
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
    const firstPage = await firstResponse.json() as { auditEvents: AdminAuditEventForTest[]; nextCursor: string | null };
    assert.equal(firstPage.auditEvents.length, 2);
    assert.equal(firstPage.auditEvents[0]!.source, 'security');
    assert.equal(firstPage.auditEvents[0]!.eventType, 'sign_in');
    assert.equal(firstPage.auditEvents[1]!.source, 'deletion');
    assert.ok(firstPage.nextCursor);
    const secondPageResponse = await fetch(`${route}?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`, { headers: { Cookie: admin.cookie } });
    const secondPage = await secondPageResponse.json() as { auditEvents: AdminAuditEventForTest[]; nextCursor: string | null };
    assert.equal(secondPageResponse.status, 200);
    assert.equal(secondPage.auditEvents.length, 1);
    assert.equal(secondPage.auditEvents[0]!.source, 'admin_access');
    assert.equal(secondPage.auditEvents[0]!.eventType, 'admin_summary_viewed');
    assert.equal(secondPage.nextCursor, null);
    const filteredResponse = await fetch(`${route}?source=security&eventType=sign_in&targetUserId=${target.userId}`, { headers: { Cookie: admin.cookie } });
    const filtered = await filteredResponse.json() as { auditEvents: AdminAuditEventForTest[] };
    assert.equal(filteredResponse.status, 200);
    assert.equal(filtered.auditEvents.length, 1);
    assert.equal(filtered.auditEvents[0]!.targetReference, ownerHash.slice(0, 16));
    assert.equal((await fetch(`${route}?eventType=account_blocked`, { headers: { Cookie: admin.cookie } })).status, 400);
    assert.equal((await fetch(`${route}?targetUserId=not-a-uuid`, { headers: { Cookie: admin.cookie } })).status, 400);
    assert.equal((await fetch(`${route}?cursor=not-a-cursor`, { headers: { Cookie: admin.cookie } })).status, 400);

    const serialized = JSON.stringify([firstPage, secondPage, filtered]);
    for (const sensitive of [target.userId, target.cookie, target.email, admin.userId, 'private-security-event-id', 'private-deletion-request-id',
      'private-deletion-event-id', 'private-admin-event-id', 'private-audit-metadata', 'private-admin-metadata', 'actor_user_id', 'request_id', 'ip_hash']) {
      assert.equal(serialized.includes(sensitive), false);
    }
    const readAudit = await database.prepare(`SELECT metadata FROM admin_access_audit WHERE event_type='admin_audit_events_viewed'`).all() as Array<{ metadata: Record<string, unknown> }>;
    assert.equal(readAudit.length, 3);
    assert.ok(readAudit.every(({ metadata }) => !JSON.stringify(metadata).includes(target.userId)));
    assert.ok(readAudit.some(({ metadata }) => metadata.hasTargetFilter === true));
    assert.ok(readAudit.every(({ metadata }) => Object.keys(metadata).every((key) =>
      ['limit', 'hasSourceFilter', 'hasEventTypeFilter', 'hasTargetFilter', 'hasCursor', 'resultCount'].includes(key))));
  });
});

test('admin per-user timeline merges safe events, keyset-paginates, and audits access without exposing content', async () => {
  await withApi(async (baseUrl, database) => {
    const target = await register(baseUrl, 'timeline-target@example.test');
    const member = await register(baseUrl, 'timeline-member@example.test');
    const support = await register(baseUrl, 'timeline-support@example.test');
    const admin = await register(baseUrl, 'timeline-admin@example.test');
    const now = new Date();
    const timestamp = (delta: number) => new Date(now.getTime() - delta).toISOString();
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'support',?)`).run(support.userId, now.toISOString());
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now.toISOString());
    await database.prepare('DELETE FROM account_security_events WHERE owner_id=?').run(target.userId);
    const ownerHash = createHash('sha256').update(target.userId).digest('hex');
    await database.prepare(`INSERT INTO account_security_events (id,owner_id,event_type,created_at) VALUES (?,?,?,?)`)
      .run('private-timeline-security-id', target.userId, 'sign_out', timestamp(1_000));
    await database.prepare(`INSERT INTO account_deletion_requests
      (id,owner_id,owner_hash,status,export_confirmed,requested_at,available_at,created_at,updated_at)
      VALUES (?,?,?,'pending_approval',TRUE,?,?,?,?)`).run('private-timeline-deletion-id', target.userId, ownerHash,
      timestamp(5_000), timestamp(5_000), timestamp(5_000), timestamp(5_000));
    await database.prepare(`INSERT INTO account_deletion_audit
      (id,request_id,owner_hash,actor_type,event_type,metadata,created_at) VALUES (?,?,?,'worker','step_completed',?,?)`)
      .run('private-timeline-deletion-event-id', 'private-timeline-deletion-id', ownerHash,
        JSON.stringify({ step: 'delete_owner_records', storageKey: 'secret/path' }), timestamp(5_000));
    await database.prepare(`INSERT INTO account_data_exports (id,owner_id,status,error_code,created_at,updated_at)
      VALUES (?,?,'failed','private-export-error',?,?)`).run('private-timeline-export-id', target.userId, timestamp(3_000), timestamp(3_000));
    await database.prepare(`INSERT INTO imports (id,owner_id,request_id,source,status,created_at,updated_at,completed_at,error_code)
      VALUES (?,?,'private-import-request','x','partial',?,?,?,'private-import-error')`)
      .run('private-timeline-import-id', target.userId, timestamp(4_000), timestamp(4_000), timestamp(4_000));
    await database.prepare(`INSERT INTO admin_access_audit (id,actor_user_id,event_type,target_hash,metadata,created_at)
      VALUES (?,?,'admin_user_detail_viewed',?,?,?)`).run('private-timeline-admin-event-id', admin.userId, ownerHash,
      JSON.stringify({ privateDetail: 'private-admin-metadata' }), timestamp(2_000));

    const route = `${baseUrl}/api/admin/users/${encodeURIComponent(target.userId)}/timeline`;
    assert.equal((await fetch(route)).status, 401);
    assert.equal((await fetch(route, { headers: { Cookie: member.cookie } })).status, 403);
    assert.equal((await fetch(route, { headers: { Cookie: support.cookie } })).status, 403);
    const firstResponse = await fetch(`${route}?limit=2`, { headers: { Cookie: admin.cookie } });
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
    const firstPage = await firstResponse.json() as { timeline: AdminTimelineEventForTest[]; nextCursor: string | null };
    assert.deepEqual(firstPage.timeline.map(({ source, eventType }) => ({ source, eventType })), [
      { source: 'security', eventType: 'sign_out' },
      { source: 'admin_access', eventType: 'admin_user_detail_viewed' },
    ]);
    assert.ok(firstPage.nextCursor);
    const secondResponse = await fetch(`${route}?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`, { headers: { Cookie: admin.cookie } });
    assert.equal(secondResponse.status, 200);
    const secondPage = await secondResponse.json() as { timeline: AdminTimelineEventForTest[]; nextCursor: string | null };
    assert.deepEqual(secondPage.timeline.map(({ source, eventType }) => ({ source, eventType })), [
      { source: 'export', eventType: 'export_failed' },
      { source: 'import', eventType: 'import_partial' },
    ]);
    assert.ok(secondPage.nextCursor);
    const thirdResponse = await fetch(`${route}?limit=2&cursor=${encodeURIComponent(secondPage.nextCursor!)}`, { headers: { Cookie: admin.cookie } });
    assert.equal(thirdResponse.status, 200);
    const thirdPage = await thirdResponse.json() as { timeline: AdminTimelineEventForTest[]; nextCursor: string | null };
    assert.deepEqual(thirdPage.timeline.map(({ source, eventType }) => ({ source, eventType })), [
      { source: 'deletion', eventType: 'step_completed' },
    ]);
    assert.equal(thirdPage.nextCursor, null);
    assert.match(firstPage.timeline[0]!.reference, /^[0-9a-f]{16}$/);
    assert.equal((await fetch(`${route}?limit=0`, { headers: { Cookie: admin.cookie } })).status, 400);
    assert.equal((await fetch(`${route}?cursor=not-a-cursor`, { headers: { Cookie: admin.cookie } })).status, 400);

    const serialized = JSON.stringify([firstPage, secondPage, thirdPage]);
    for (const sensitive of [target.userId, target.cookie, target.email, admin.userId, 'private-timeline-security-id',
      'private-timeline-deletion-id', 'private-timeline-deletion-event-id', 'private-timeline-export-id',
      'private-timeline-import-id', 'private-timeline-admin-event-id', 'private-export-error', 'private-import-error',
      'private-admin-metadata', 'secret/path', 'storageKey', 'request_id', 'actor_user_id']) {
      assert.equal(serialized.includes(sensitive), false);
    }
    const readAudits = await database.prepare(`SELECT target_hash,metadata FROM admin_access_audit WHERE event_type='admin_user_timeline_viewed'`).all() as Array<{ target_hash: string; metadata: Record<string, unknown> }>;
    assert.equal(readAudits.length, 3);
    assert.ok(readAudits.every(({ target_hash, metadata }) => target_hash === ownerHash &&
      !JSON.stringify(metadata).includes(target.userId) && Object.keys(metadata).every((key) => ['limit', 'hasCursor', 'resultCount'].includes(key))));
  });
});

interface AdminImportRowForTest {
  reference: string; source: string; status: string; fileCount: number; totalBytes: number;
  entries: { accepted: number; duplicate: number; skipped: number; failed: number };
  jobs: { waiting: number; processing: number; completed: number; failed: number };
}

interface AdminAuditEventForTest {
  reference: string; source: string; eventType: string; actorType: string; targetReference: string | null; createdAt: string;
}

interface AdminTimelineEventForTest { reference: string; source: string; eventType: string; actorType: string; createdAt: string }
