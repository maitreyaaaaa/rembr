import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { recordAccountSecurityEvent } from '../src/account/security-activity.js';

const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>) {
  const database = await createTestDatabase();
  const root = await mkdtemp(join(tmpdir(), 'rembr-security-activity-'));
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

test('security activity exposes only safe owner-scoped sign-in and sign-out labels', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'security-owner@example.test');
    const other = await register(baseUrl, 'security-other@example.test');
    const otherEvent = await database.prepare('SELECT id FROM account_security_events WHERE owner_id=?').get(other.userId) as { id: string };

    const unauthenticated = await fetch(`${baseUrl}/api/account/security-activity`);
    assert.equal(unauthenticated.status, 401);

    const missing = await fetch(`${baseUrl}/api/account/security-activity`, { headers: { Cookie: owner.cookie } });
    assert.equal(missing.status, 200);
    assert.equal(missing.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(missing.headers.get('pragma'), 'no-cache');
    const missingBody = await missing.json() as { activity: Array<Record<string, unknown>> };
    assert.equal(missingBody.activity.length, 1);
    assert.equal(missingBody.activity[0]!.eventType, 'sign_in');
    assert.deepEqual(Object.keys(missingBody.activity[0]!).sort(), ['createdAt', 'eventType', 'id']);
    assert.ok(!JSON.stringify(missingBody).includes(owner.userId));
    assert.ok(!JSON.stringify(missingBody).includes('security-owner@example.test'));
    assert.ok(!JSON.stringify(missingBody).includes(otherEvent.id));

    await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: owner.cookie } });
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'security-owner@example.test', password }),
    });
    assert.equal(login.status, 200);
    const loginCookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const refreshed = await fetch(`${baseUrl}/api/account/security-activity?limit=10`, { headers: { Cookie: loginCookie } });
    const activity = (await refreshed.json() as { activity: Array<{ eventType: string }> }).activity;
    assert.deepEqual(activity.map((event) => event.eventType), ['sign_in', 'sign_out', 'sign_in']);
    assert.equal((await fetch(`${baseUrl}/api/account/security-activity?limit=51`, { headers: { Cookie: loginCookie } })).status, 400);
  });
});

test('deletion request and cancellation add safe account activity while the owner is frozen', async () => {
  await withApi(async (baseUrl, _database) => {
    const owner = await register(baseUrl, 'security-deletion@example.test');
    const requested = await fetch(`${baseUrl}/api/account/deletion`, {
      method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ exportConfirmed: true }),
    });
    assert.equal(requested.status, 202);
    const pending = await fetch(`${baseUrl}/api/account/security-activity`, { headers: { Cookie: owner.cookie } });
    assert.equal(pending.status, 200);
    assert.deepEqual((await pending.json() as { activity: Array<{ eventType: string }> }).activity.map(({ eventType }) => eventType),
      ['deletion_requested', 'sign_in']);

    const cancelled = await fetch(`${baseUrl}/api/account/deletion/cancel`, { method: 'POST', headers: { Cookie: owner.cookie } });
    assert.equal(cancelled.status, 200);
    const activity = await fetch(`${baseUrl}/api/account/security-activity`, { headers: { Cookie: owner.cookie } });
    assert.deepEqual((await activity.json() as { activity: Array<{ eventType: string }> }).activity.map(({ eventType }) => eventType),
      ['deletion_cancelled', 'deletion_requested', 'sign_in']);
  });
});

test('security activity reads are bounded and event writes prune entries older than 90 days', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'security-retention@example.test');
    const old = new Date(Date.now() - 100 * 24 * 60 * 60_000).toISOString();
    await database.prepare(`INSERT INTO account_security_events (id,owner_id,event_type,created_at) VALUES (?,?,?,?)`)
      .run('stale-security-event', owner.userId, 'sign_in', old);
    const countBefore = await database.prepare('SELECT count(*) AS count FROM account_security_events WHERE owner_id=?')
      .get(owner.userId) as { count: number };
    assert.equal(Number(countBefore.count), 2);

    await recordAccountSecurityEvent(database, owner.userId, 'sign_out');
    const rows = await database.prepare('SELECT id,created_at FROM account_security_events WHERE owner_id=? ORDER BY created_at DESC,id DESC')
      .all(owner.userId) as Array<{ id: string; created_at: string }>;
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.id !== 'stale-security-event'));

    const cookie = owner.cookie;
    for (let index = 0; index < 52; index += 1) await recordAccountSecurityEvent(database, owner.userId, 'sign_in');
    const response = await fetch(`${baseUrl}/api/account/security-activity?limit=50`, { headers: { Cookie: cookie } });
    assert.equal((await response.json() as { activity: unknown[] }).activity.length, 50);
  });
});
