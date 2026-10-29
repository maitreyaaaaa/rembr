import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { SEMANTIC_DISCLOSURE_VERSION } from '../src/library/semantic-routes.js';
import type { EmbeddingProvider, EmbeddingPurpose, EmbeddingVector } from '../src/library/semantic-embeddings.js';

const origin = 'http://127.0.0.1:5173';
const password = 'correct-horse-battery-staple';
const dimensions = 1_536;

class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'test-semantic-v1';
  readonly dimensions = dimensions;
  calls: Array<{ text: string; purpose: EmbeddingPurpose }> = [];
  async embed(text: string, purpose: EmbeddingPurpose): Promise<EmbeddingVector> {
    this.calls.push({ text, purpose });
    return { model: this.model, values: [1, ...Array.from({ length: dimensions - 1 }, () => 0)], inputTokens: 10 };
  }
}

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>, provider: EmbeddingProvider) {
  const database = await createTestDatabase();
  const assetsPath = await mkdtemp(join(tmpdir(), 'rembr-semantic-search-'));
  const app = createApp(database, { assetDirectory: assetsPath, semanticEmbeddingProvider: provider });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database); }
  finally {
    server.closeAllConnections();
    server.close();
    await database.close();
    await rm(assetsPath, { recursive: true, force: true });
  }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 201);
  return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
}

async function completeProfile(baseUrl: string, cookie: string, username: string) {
  const response = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  assert.equal(response.status, 200);
}

async function seedReadyItem(database: Awaited<ReturnType<typeof createTestDatabase>>, ownerId: string, id: string) {
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'ready',?,?)`).run(id, ownerId, `https://example.test/${id}`, `https://example.test/${id}`, 'Weekend garden plan', 'Ideas for a small garden', now, now);
  await database.prepare(`INSERT INTO extracted_artifacts (id,owner_id,item_id,title,description,text_content,fetched_at,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(`artifact-${id}`, ownerId, id, 'Weekend garden plan', 'Ideas for a small garden', 'Tomatoes, herbs, raised beds and sunlight.', now, now);
}

async function enableConsent(baseUrl: string, cookie: string) {
  return fetch(`${baseUrl}/api/semantic/preferences`, {
    method: 'PUT', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, disclosureVersion: SEMANTIC_DISCLOSURE_VERSION }),
  });
}

test('semantic routes are off by default and never call the provider before separate consent', async () => {
  const provider = new FakeEmbeddingProvider();
  await withApi(async (baseUrl, database) => {
    const cookie = await register(baseUrl, 'semantic-off@example.test');
    await completeProfile(baseUrl, cookie, 'semanticoff');
    const user = await database.prepare('SELECT id FROM users WHERE email=?').get('semantic-off@example.test') as { id: string };
    await seedReadyItem(database, user.id, 'semantic-off-item');

    const preferenceResponse = await fetch(`${baseUrl}/api/semantic/preferences`, { headers: { Cookie: cookie } });
    const preference = await preferenceResponse.json() as { preference: { enabled: boolean; providerAvailable: boolean } };
    assert.equal(preference.preference.enabled, false);
    assert.equal(preference.preference.providerAvailable, true);

    const index = await fetch(`${baseUrl}/api/semantic/index`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(index.status, 403);
    const search = await fetch(`${baseUrl}/api/semantic/search?q=garden`, { headers: { Cookie: cookie } });
    assert.equal(search.status, 200);
    const result = await search.json() as { mode: string; items: Array<{ id: string }>; fallbackReason: string };
    assert.equal(result.mode, 'keyword_fallback');
    assert.equal(result.fallbackReason, 'consent_required');
    assert.deepEqual(provider.calls, []);
  }, provider);
});

test('semantic indexing and hybrid search are owner-scoped, metered, and delete vectors when consent is revoked', async () => {
  const provider = new FakeEmbeddingProvider();
  await withApi(async (baseUrl, database) => {
    const cookieA = await register(baseUrl, 'semantic-a@example.test');
    const cookieB = await register(baseUrl, 'semantic-b@example.test');
    await completeProfile(baseUrl, cookieA, 'semantica');
    await completeProfile(baseUrl, cookieB, 'semanticb');
    const userA = await database.prepare('SELECT id FROM users WHERE email=?').get('semantic-a@example.test') as { id: string };
    const userB = await database.prepare('SELECT id FROM users WHERE email=?').get('semantic-b@example.test') as { id: string };
    await seedReadyItem(database, userA.id, 'semantic-a-item');
    await seedReadyItem(database, userB.id, 'semantic-b-item');
    assert.equal((await enableConsent(baseUrl, cookieA)).status, 200);

    const index = await fetch(`${baseUrl}/api/semantic/index`, { method: 'POST', headers: { Cookie: cookieA, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(index.status, 200);
    assert.equal((await index.json() as { indexed: number }).indexed, 1);
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM ai_search_usage_reservations WHERE owner_id=? AND status=?').get(userA.id, 'settled') as { count: number }).count, 1);

    const searchA = await fetch(`${baseUrl}/api/semantic/search?q=small%20outdoor%20growing`, { headers: { Cookie: cookieA } });
    const resultA = await searchA.json() as { mode: string; items: Array<{ id: string }> };
    assert.equal(resultA.mode, 'semantic_hybrid');
    assert.deepEqual(resultA.items.map((item) => item.id), ['semantic-a-item']);
    const searchB = await fetch(`${baseUrl}/api/semantic/search?q=garden`, { headers: { Cookie: cookieB } });
    const resultB = await searchB.json() as { mode: string; items: Array<{ id: string }>; fallbackReason: string };
    assert.equal(resultB.mode, 'keyword_fallback');
    assert.equal(resultB.fallbackReason, 'consent_required');
    assert.deepEqual(resultB.items.map((item) => item.id), ['semantic-b-item']);

    const disabled = await fetch(`${baseUrl}/api/semantic/preferences`, {
      method: 'PUT', headers: { Cookie: cookieA, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(disabled.status, 200);
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM semantic_item_embeddings WHERE owner_id=?').get(userA.id) as { count: number }).count, 0);
    const providerCallsBeforeRevokedSearch = provider.calls.length;
    await fetch(`${baseUrl}/api/semantic/search?q=garden`, { headers: { Cookie: cookieA } });
    assert.equal(provider.calls.length, providerCallsBeforeRevokedSearch);
  }, provider);
});
