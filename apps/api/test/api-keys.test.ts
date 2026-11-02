import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';

const origin = 'http://127.0.0.1:5173';
const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>) {
  const database = await createTestDatabase();
  const assetsPath = await mkdtemp(join(tmpdir(), 'rembr-api-keys-'));
  const app = createApp(database, {
    assetDirectory: assetsPath,
    validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database); }
  finally { server.closeAllConnections(); server.close(); await database.close(); await rm(assetsPath, { recursive: true, force: true }); }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 201);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
  const body = await response.json() as { user: { id: string } };
  const profile = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email.split('@')[0]!.replaceAll('-', '_') }),
  });
  assert.equal(profile.status, 200);
  return { cookie, userId: body.user.id };
}

async function createKey(baseUrl: string, cookie: string, scopes: string[]) {
  const response = await fetch(`${baseUrl}/api/developer-keys`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test integration', scopes, expiresInDays: 90 }),
  });
  return { response, body: await response.json() as { key: { token: string; prefix: string; scopes: string[] } } };
}

test('scoped API keys are one-time, owner-bound, expiring, and revocable', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'api-key-owner@example.test');
    const other = await register(baseUrl, 'api-key-other@example.test');

    assert.equal((await fetch(`${baseUrl}/api/developer-keys`)).status, 401);
    const created = await createKey(baseUrl, owner.cookie, ['library:read', 'collections:read']);
    assert.equal(created.response.status, 201);
    const readToken = created.body.key.token;
    const publicId = created.body.key.prefix.replace(/^rmb_live_|_$/g, '');
    const stored = await database.prepare('SELECT secret_hash FROM personal_api_keys WHERE public_id=?').get(publicId) as { secret_hash: string };
    assert.equal(stored.secret_hash.length, 64);
    assert.equal(stored.secret_hash.includes(readToken), false);

    const ownerItem = '00000000-0000-4000-8000-000000000001';
    const otherItem = '00000000-0000-4000-8000-000000000002';
    const now = new Date().toISOString();
    const insertItem = (id: string, ownerId: string, title: string) => database.prepare(`INSERT INTO saved_items
      (id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at,item_kind)
      VALUES (?,?,?,?,?,?,'ready',?,?,'page')`).run(id, ownerId, `https://example.com/${title}`, `https://example.com/${title}`, title, '', now, now);
    await insertItem(ownerItem, owner.userId, 'owner needle');
    await insertItem(otherItem, other.userId, 'private needle');
    await database.prepare(`INSERT INTO collections (id,owner_id,name,normalized_name,description,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run('owner-collection', owner.userId, 'Owner saves', 'owner saves', '', now, now);
    await database.prepare(`INSERT INTO collections (id,owner_id,name,normalized_name,description,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run('other-collection', other.userId, 'Private saves', 'private saves', '', now, now);

    const readHeaders = { Authorization: `Bearer ${readToken}` };
    const alteredToken = `${readToken.slice(0, -1)}${readToken.endsWith('a') ? 'b' : 'a'}`;
    assert.equal((await fetch(`${baseUrl}/api/v1/items`, { headers: { Authorization: `Bearer ${alteredToken}` } })).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/v1/items`, { headers: { Authorization: 'Bearer malformed' } })).status, 401);
    const itemResponse = await fetch(`${baseUrl}/api/v1/items?search=needle`, { headers: readHeaders });
    assert.equal(itemResponse.status, 200);
    const items = (await itemResponse.json() as { items: Array<{ id: string }> }).items;
    assert.deepEqual(items.map((item) => item.id), [ownerItem]);
    const collectionResponse = await fetch(`${baseUrl}/api/v1/collections`, { headers: readHeaders });
    assert.equal(collectionResponse.status, 200);
    assert.deepEqual((await collectionResponse.json() as { collections: Array<{ id: string }> }).collections.map((entry) => entry.id), ['owner-collection']);

    const listed = await fetch(`${baseUrl}/api/developer-keys`, { headers: { Cookie: owner.cookie } });
    const listedKeys = (await listed.json() as { keys: Array<Record<string, unknown>> }).keys;
    assert.equal(JSON.stringify(listedKeys).includes(readToken), false);
    assert.equal(listedKeys.length, 1);
    const keyId = String(listedKeys[0]!.id);
    const foreignRevoke = await fetch(`${baseUrl}/api/developer-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE', headers: { Cookie: other.cookie } });
    assert.equal(foreignRevoke.status, 404);

    const writeOnly = await createKey(baseUrl, owner.cookie, ['library:write']);
    assert.equal(writeOnly.response.status, 201);
    const writeToken = writeOnly.body.key.token;
    const deniedRead = await fetch(`${baseUrl}/api/v1/items`, { headers: { Authorization: `Bearer ${writeToken}` } });
    assert.equal(deniedRead.status, 403);
    assert.equal((await deniedRead.json() as { error: { code: string } }).error.code, 'insufficient_scope');
    const saved = await fetch(`${baseUrl}/api/v1/items`, {
      method: 'POST', headers: { Authorization: `Bearer ${writeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/shared-link' }),
    });
    assert.equal(saved.status, 202);

    await database.prepare('UPDATE personal_api_keys SET expires_at=? WHERE public_id=?')
      .run(new Date(Date.now() - 1_000).toISOString(), publicId);
    assert.equal((await fetch(`${baseUrl}/api/v1/items`, { headers: readHeaders })).status, 401);

    const revoke = await fetch(`${baseUrl}/api/developer-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE', headers: { Cookie: owner.cookie } });
    assert.equal(revoke.status, 204);
    assert.equal((await fetch(`${baseUrl}/api/v1/collections`, { headers: readHeaders })).status, 401);
  });
});
