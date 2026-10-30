import assert from 'node:assert/strict';
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
  const root = await mkdtemp(join(tmpdir(), 'rembr-admin-'));
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

test('operator role endpoint is self-scoped and deletion queue stays minimal while admins can retry', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'admin-target@example.test');
    const member = await register(baseUrl, 'admin-member@example.test');
    const support = await register(baseUrl, 'admin-support@example.test');
    const admin = await register(baseUrl, 'admin-operator@example.test');
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'support',?)`).run(support.userId, now);
    await database.prepare(`INSERT INTO admin_roles (user_id,role,created_at) VALUES (?,'admin',?)`).run(admin.userId, now);

    assert.equal((await fetch(`${baseUrl}/api/admin/role`)).status, 401);
    const memberRole = await fetch(`${baseUrl}/api/admin/role`, { headers: { Cookie: member.cookie } });
    assert.equal(memberRole.status, 200);
    assert.equal((await memberRole.json() as { role: string | null }).role, null);
    assert.equal(memberRole.headers.get('cache-control'), 'private, no-store, max-age=0');
    const supportRole = await fetch(`${baseUrl}/api/admin/role`, { headers: { Cookie: support.cookie } });
    assert.equal((await supportRole.json() as { role: string }).role, 'support');
    const adminRole = await fetch(`${baseUrl}/api/admin/role`, { headers: { Cookie: admin.cookie } });
    assert.equal((await adminRole.json() as { role: string }).role, 'admin');

    const created = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: true }),
    });
    assert.equal(created.status, 202);
    const deletionId = (await created.json() as { deletion: { id: string } }).deletion.id;
    await database.prepare(`UPDATE account_deletion_requests SET status='partial_failed',attempt_count=max_attempts,error_code='storage_cleanup_failed' WHERE id=?`).run(deletionId);

    const deniedQueue = await fetch(`${baseUrl}/api/admin/account-deletions`, { headers: { Cookie: member.cookie } });
    assert.equal(deniedQueue.status, 403);
    const queueResponse = await fetch(`${baseUrl}/api/admin/account-deletions`, { headers: { Cookie: support.cookie } });
    assert.equal(queueResponse.status, 200);
    assert.equal(queueResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
    const queue = (await queueResponse.json() as { deletions: Array<Record<string, unknown>> }).deletions;
    assert.equal(queue.length, 1);
    assert.deepEqual(Object.keys(queue[0]!).sort(), ['canRetry', 'exportConfirmed', 'id', 'ownerReference', 'requestedAt', 'status']);
    assert.equal(queue[0]?.status, 'partial_failed');
    assert.equal(queue[0]?.canRetry, true, 'admin recovery remains available after automated attempts are exhausted');
    const projectionText = JSON.stringify(queue);
    assert.ok(!projectionText.includes(owner.userId));
    assert.ok(!projectionText.includes('admin-target@example.test'));

    const privateAuditValues = {
      email: 'hidden@example.test', ownerId: owner.userId, actorUserId: admin.userId,
      ownerHash: 'a'.repeat(64), actorHash: 'b'.repeat(64), rawMessage: 'Private account content',
    };
    const auditAt = new Date(Date.now() + 1000).toISOString();
    await database.prepare(`INSERT INTO account_deletion_audit
      (id,request_id,owner_hash,actor_type,actor_user_id,actor_hash,event_type,metadata,created_at)
      VALUES ('admin-audit-projection-test',?,?,?,?,?,'step_failed',?,?)`)
      .run(deletionId, privateAuditValues.ownerHash, 'admin', admin.userId, privateAuditValues.actorHash,
        JSON.stringify({ step: 'remove_storage', code: 'storage_cleanup_failed', attempt: 3, ...privateAuditValues }), auditAt);
    const deniedAudit = await fetch(`${baseUrl}/api/admin/account-deletions/${deletionId}/audit`, { headers: { Cookie: member.cookie } });
    assert.equal(deniedAudit.status, 403);
    const auditResponse = await fetch(`${baseUrl}/api/admin/account-deletions/${deletionId}/audit`, { headers: { Cookie: support.cookie } });
    assert.equal(auditResponse.status, 200);
    assert.equal(auditResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
    const audit = (await auditResponse.json() as { events: Array<Record<string, unknown>> }).events;
    const projectedEvent = audit[audit.length - 1];
    assert.deepEqual(projectedEvent, {
      eventType: 'step_failed', actorType: 'admin', createdAt: auditAt,
      metadata: { step: 'remove_storage', code: 'storage_cleanup_failed', attempt: 3 },
    });
    const auditText = JSON.stringify(audit);
    for (const privateValue of Object.values(privateAuditValues)) assert.ok(!auditText.includes(privateValue));

    const deniedRetry = await fetch(`${baseUrl}/api/admin/account-deletions/${deletionId}/retry`, {
      method: 'POST', headers: { Cookie: support.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }),
    });
    assert.equal(deniedRetry.status, 403);
    const missingConfirmation = await fetch(`${baseUrl}/api/admin/account-deletions/${deletionId}/retry`, {
      method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: false }),
    });
    assert.equal(missingConfirmation.status, 400);
    const retried = await fetch(`${baseUrl}/api/admin/account-deletions/${deletionId}/retry`, {
      method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }),
    });
    assert.equal(retried.status, 200);
    assert.equal((await retried.json() as { deletion: { status: string } }).deletion.status, 'approved');

    const deniedAccess = await database.prepare(`SELECT actor_user_id,target_hash,metadata FROM admin_access_audit
      WHERE event_type='admin_access_denied' ORDER BY metadata->>'action'`).all() as Array<{
        actor_user_id: string; target_hash: string | null; metadata: Record<string, unknown>;
      }>;
    assert.deepEqual(deniedAccess.map((entry) => ({ actor: entry.actor_user_id, targetHash: entry.target_hash, metadata: entry.metadata })), [
      { actor: support.userId, targetHash: null, metadata: { action: 'admin_deletion_retry', requiredRole: 'admin', actualRole: 'support' } },
      { actor: member.userId, targetHash: null, metadata: { action: 'support_deletion_audit', requiredRole: 'support', actualRole: 'none' } },
      { actor: member.userId, targetHash: null, metadata: { action: 'support_deletion_queue', requiredRole: 'support', actualRole: 'none' } },
    ]);
    assert.equal(JSON.stringify(deniedAccess).includes(deletionId), false);

    const deniedFeedResponse = await fetch(`${baseUrl}/api/admin/audit-events?eventType=admin_access_denied&limit=10`, { headers: { Cookie: admin.cookie } });
    assert.equal(deniedFeedResponse.status, 200);
    const deniedFeed = await deniedFeedResponse.json() as { auditEvents: Array<{
      eventType: string; source: string; actorType: string; action?: string; targetReference: string | null;
    }> };
    assert.equal(deniedFeed.auditEvents.length, 3);
    assert.ok(deniedFeed.auditEvents.every((event) => event.eventType === 'admin_access_denied' && event.source === 'admin_access'
      && event.actorType === 'user' && event.targetReference === null));
    assert.deepEqual(deniedFeed.auditEvents.map((event) => event.action).sort(), [
      'admin_deletion_retry', 'support_deletion_audit', 'support_deletion_queue',
    ]);
    const deniedFeedText = JSON.stringify(deniedFeed);
    for (const privateValue of [member.userId, member.cookie, support.userId, support.cookie, admin.userId, deletionId]) {
      assert.equal(deniedFeedText.includes(privateValue), false);
    }
  });
});
