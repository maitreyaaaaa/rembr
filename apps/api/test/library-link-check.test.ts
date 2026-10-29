import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import type { LinkHealthResult } from '../src/items/safe-fetch.js';

const origin = 'http://127.0.0.1:5173';
const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>, checkedUrls: string[]) => Promise<void>) {
  const database = await createTestDatabase();
  const assetsPath = await mkdtemp(join(tmpdir(), 'rembr-link-check-'));
  const checkedUrls: string[] = [];
  const app = createApp(database, {
    validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }),
    checkLink: async (url) => {
      checkedUrls.push(url);
      const status = url.endsWith('/one') ? 'broken' : 'ok';
      return { status, sourceUrl: url, finalUrl: url, httpStatus: status === 'broken' ? 404 : 200, errorCode: '', errorMessage: '', checkedAt: new Date().toISOString() } satisfies LinkHealthResult;
    },
    assetDirectory: assetsPath,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database, checkedUrls); }
  finally { server.closeAllConnections(); server.close(); await database.close(); await rm(assetsPath, { recursive: true, force: true }); }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 201);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
  const body = await response.json() as { user: { id: string } };
  const profile = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email.split('@')[0]!.replaceAll('-', '_') }) });
  assert.equal(profile.status, 200);
  return { cookie, userId: body.user.id };
}

test('user-triggered link checks are bounded, owner-scoped, persisted, and skip recent results', async () => {
  await withApi(async (baseUrl, database, checkedUrls) => {
    const owner = await register(baseUrl, 'link-owner@example.test');
    const other = await register(baseUrl, 'link-other@example.test');
    const baseTime = Date.now();
    const insertPage = (id: string, ownerId: string, path: string, timestamp: number) => database.prepare(`INSERT INTO saved_items
      (id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at,item_kind)
      VALUES (?,?,?,?,?,?,?,?,?,'page')`).run(id, ownerId, `https://example.com/${path}`, `https://example.com/${path}`, path, '', 'ready', new Date(timestamp).toISOString(), new Date(timestamp).toISOString());
    await insertPage('owner-one', owner.userId, 'one', baseTime - 2_000);
    await insertPage('owner-two', owner.userId, 'two', baseTime - 1_000);
    await insertPage('other-one', other.userId, 'private', baseTime);

    assert.equal((await fetch(`${baseUrl}/api/knowledge/links/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 1 }) })).status, 401);
    const invalid = await fetch(`${baseUrl}/api/knowledge/links/check`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 21 }) });
    assert.equal(invalid.status, 400);
    const first = await fetch(`${baseUrl}/api/knowledge/links/check`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 1 }) });
    assert.equal(first.status, 200);
    assert.equal((await first.json() as { checked: LinkHealthResult[] }).checked.length, 1);
    assert.deepEqual(checkedUrls, ['https://example.com/two']);
    const second = await fetch(`${baseUrl}/api/knowledge/links/check`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 1 }) });
    assert.equal((await second.json() as { checked: Array<{ status: string }> }).checked[0]!.status, 'broken');
    assert.deepEqual(checkedUrls, ['https://example.com/two', 'https://example.com/one']);
    const cooldown = await fetch(`${baseUrl}/api/knowledge/links/check`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 20 }) });
    assert.equal((await cooldown.json() as { checked: unknown[] }).checked.length, 0);

    const ownerCheckup = await fetch(`${baseUrl}/api/knowledge/checkup`, { headers: { Cookie: owner.cookie } });
    const ownerHealth = (await ownerCheckup.json() as { checkup: { linkHealth: { checkedItems: number; brokenCount: number; brokenLinks: Array<{ itemId: string }> } } }).checkup.linkHealth;
    assert.equal(ownerHealth.checkedItems, 2);
    assert.equal(ownerHealth.brokenCount, 1);
    assert.deepEqual(ownerHealth.brokenLinks.map((item) => item.itemId), ['owner-one']);
    const otherCheckup = await fetch(`${baseUrl}/api/knowledge/checkup`, { headers: { Cookie: other.cookie } });
    assert.equal((await otherCheckup.json() as { checkup: { linkHealth: { checkedItems: number } } }).checkup.linkHealth.checkedItems, 0);
    assert.equal(await database.prepare('SELECT count(*) AS count FROM link_health_checks WHERE owner_id=?').get(owner.userId).then((row) => Number((row as { count: number }).count)), 2);
  });
});
