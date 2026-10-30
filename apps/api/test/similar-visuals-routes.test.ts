import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { LOCAL_VISUAL_DISCLOSURE_VERSION } from '../src/ai/preferences.js';

const origin = 'http://127.0.0.1:5173';
const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>) {
  const database = await createTestDatabase();
  const root = await mkdtemp(join(tmpdir(), 'rembr-similar-visuals-'));
  const app = createApp(database, { assetDirectory: join(root, 'assets'), mediaDirectory: join(root, 'media') });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database); }
  finally { server.closeAllConnections(); server.close(); await database.close(); await rm(root, { recursive: true, force: true }); }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 201);
  return { cookie: (response.headers.get('set-cookie') ?? '').split(';')[0]!, user: (await response.json() as { user: { id: string } }).user };
}

async function completeProfile(baseUrl: string, cookie: string, username: string) {
  const response = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  assert.equal(response.status, 200);
}

async function seedItem(database: Awaited<ReturnType<typeof createTestDatabase>>, ownerId: string, id: string, title: string) {
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO saved_items(id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'ready',?,?)`).run(id, ownerId, `https://example.org/${id}`, `https://example.org/${id}`, title, '', now, now);
}

test('similar saves are owner-scoped, same-model, bounded, no-store, and never return vector data', async () => {
  await withApi(async (baseUrl, database) => {
    const ownerA = await register(baseUrl, 'visual-similar-a@example.test');
    const ownerB = await register(baseUrl, 'visual-similar-b@example.test');
    await completeProfile(baseUrl, ownerA.cookie, 'visualsimilaritya');
    await completeProfile(baseUrl, ownerB.cookie, 'visualsimilarityb');
    await seedItem(database, ownerA.user.id, 'similar-source', 'Small green garden layout');
    await seedItem(database, ownerA.user.id, 'similar-candidate', 'A picture of raised beds');
    await seedItem(database, ownerB.user.id, 'foreign-candidate', 'A picture of raised beds');
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO ai_analysis_preferences(owner_id,enabled,updated_at,local_visual_enabled,local_visual_consent_version,local_visual_consented_at)
      VALUES(?,FALSE,?,TRUE,?,?)`).run(ownerA.user.id, now, LOCAL_VISUAL_DISCLOSURE_VERSION, now);
    for (const [ownerId, itemId, model, vector] of [
      [ownerA.user.id, 'similar-source', 'clip-v1', [1, 0]],
      [ownerA.user.id, 'similar-candidate', 'clip-v1', [0.99, 0.01]],
      [ownerB.user.id, 'foreign-candidate', 'clip-v1', [1, 0]],
      [ownerA.user.id, 'similar-candidate', 'different-model', [1, 0]],
    ] as Array<[string, string, string, number[]]>) {
      await database.prepare(`INSERT INTO visual_item_embeddings(owner_id,item_id,model,content_hash,embedding,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?)`).run(ownerId, itemId, model, 'a'.repeat(64), vector, now, now);
    }

    const response = await fetch(`${baseUrl}/api/items/similar-source/similar-visuals?limit=5`, { headers: { Cookie: ownerA.cookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const body = await response.json() as { items: Array<{ item: { id: string }; similarity: { score: number; reason: string } }> };
    assert.deepEqual(body.items.map((entry) => entry.item.id), ['similar-candidate']);
    assert.equal(body.items[0]?.similarity.reason, 'Looks very visually similar.');
    assert.doesNotMatch(JSON.stringify(body), /embedding|clip-v1|foreign-candidate/);
    assert.equal((await fetch(`${baseUrl}/api/items/foreign-candidate/similar-visuals`, { headers: { Cookie: ownerA.cookie } })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/items/similar-source/similar-visuals?limit=21`, { headers: { Cookie: ownerA.cookie } })).status, 400);
  });
});

test('similar saves falls back to owner-scoped text when local vectors are not consented', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'visual-similar-text@example.test');
    await completeProfile(baseUrl, owner.cookie, 'visualsimilartext');
    await seedItem(database, owner.user.id, 'text-source', 'A pale ceramic bowl');
    await seedItem(database, owner.user.id, 'text-match', 'Pale ceramic bowls for a shelf');
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO visual_item_embeddings(owner_id,item_id,model,content_hash,embedding,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).run(owner.user.id, 'text-source', 'clip-v1', 'b'.repeat(64), [1, 0], now, now);
    const response = await fetch(`${baseUrl}/api/items/text-source/similar-visuals`, { headers: { Cookie: owner.cookie } });
    assert.equal(response.status, 200);
    const body = await response.json() as { items: Array<{ item: { id: string } }> };
    assert.deepEqual(body.items.map((entry) => entry.item.id), ['text-match']);
  });
});

test('local visual consent is off by default, requires the current disclosure, queues existing images, and revocation deletes vectors', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'visual-consent@example.test');
    await completeProfile(baseUrl, owner.cookie, 'visualconsentuser');
    await seedItem(database, owner.user.id, 'visual-consent-item', 'Image with a garden');
    const initial = await fetch(`${baseUrl}/api/ai/local-visual-preferences`, { headers: { Cookie: owner.cookie } });
    const initialBody = await initial.json() as { preference: { enabled: boolean } };
    assert.equal(initialBody.preference.enabled, false);
    const needsDisclosure = await fetch(`${baseUrl}/api/ai/local-visual-preferences`, { method: 'PUT',
      headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(needsDisclosure.status, 400);
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO media_artifacts(id,owner_id,item_id,generation,source_url,storage_key,detected_mime,byte_size,sha256,status,active,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,'ready',1,?)`).run('visual-media', owner.user.id, 'visual-consent-item', 1,
      'https://example.org/photo.png', '00000000-0000-4000-8000-000000000001.media', 'image/png', 20, 'c'.repeat(64), now);
    const enabled = await fetch(`${baseUrl}/api/ai/local-visual-preferences`, { method: 'PUT',
      headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, disclosureVersion: LOCAL_VISUAL_DISCLOSURE_VERSION }),
    });
    assert.equal(enabled.status, 200);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM visual_embedding_jobs WHERE owner_id=? AND item_id=?')
      .get(owner.user.id, 'visual-consent-item') as { count: number }).count, 1);
    await database.prepare(`INSERT INTO visual_item_embeddings(owner_id,item_id,model,content_hash,embedding,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).run(owner.user.id, 'visual-consent-item', 'local-visual-test', 'a'.repeat(64), [1, 0], now, now);
    await database.prepare(`INSERT INTO account_owner_work_leases(id,owner_id,work_type,expires_at,created_at) VALUES(?,?,?,?,?)`)
      .run('visual-work-lease', owner.user.id, 'visual_embedding', new Date(Date.now() + 60_000).toISOString(), now);
    const disabled = await fetch(`${baseUrl}/api/ai/local-visual-preferences`, { method: 'PUT',
      headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }),
    });
    assert.equal(disabled.status, 200);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM visual_item_embeddings WHERE owner_id=?')
      .get(owner.user.id) as { count: number }).count, 0);
    assert.equal((await database.prepare(`SELECT count(*) AS count FROM visual_embedding_jobs WHERE owner_id=? AND status='cancelled'`)
      .get(owner.user.id) as { count: number }).count, 1);
    assert.equal((await database.prepare(`SELECT count(*) AS count FROM account_owner_work_leases WHERE owner_id=? AND work_type='visual_embedding'`)
      .get(owner.user.id) as { count: number }).count, 0);
  });
});
