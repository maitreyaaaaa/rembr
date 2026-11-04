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
  const assetsPath = await mkdtemp(join(tmpdir(), 'rembr-memory-assets-'));
  const app = createApp(database, { validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }), assetDirectory: assetsPath });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database); }
  finally { server.closeAllConnections(); server.close(); await database.close(); await rm(assetsPath, { recursive: true, force: true }); }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, acceptedTerms: true }) });
  assert.equal(response.status, 201);
  return { cookie: (response.headers.get('set-cookie') ?? '').split(';')[0]!, id: (await response.json() as { user: { id: string } }).user.id };
}

async function profile(baseUrl: string, cookie: string, username: string) {
  const response = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  assert.equal(response.status, 200);
}

async function createPage(baseUrl: string, cookie: string, path: string) {
  const response = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `https://memory-fixture.test/${path}` }) });
  assert.ok([200, 202].includes(response.status));
  return (await response.json() as { item: { id: string } }).item.id;
}

async function enable(baseUrl: string, cookie: string, itemId: string, reason: string) {
  return fetch(`${baseUrl}/api/knowledge/items/${itemId}/memory`, { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, reason }) });
}

test('memory recall is owner scoped, hides the source until reveal, and spaces successful recall', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'memory-owner@example.test');
    const other = await register(baseUrl, 'memory-other@example.test');
    await profile(baseUrl, owner.cookie, 'memory_owner');
    await profile(baseUrl, other.cookie, 'memory_other');
    const itemId = await createPage(baseUrl, owner.cookie, 'recipe');
    assert.equal((await enable(baseUrl, owner.cookie, itemId, 'Try this')).status, 200);
    const detail = await fetch(`${baseUrl}/api/items/${itemId}`, { headers: { Cookie: owner.cookie } });
    assert.equal((await detail.json() as { item: { remembering: { reason: string } } }).item.remembering.reason, 'Try this');
    const search = await fetch(`${baseUrl}/api/items?search=Try`, { headers: { Cookie: owner.cookie } });
    assert.equal((await search.json() as { items: Array<{ id: string; remembering: { reason: string } | null }> }).items[0]?.remembering?.reason, 'Try this');
    assert.equal((await enable(baseUrl, other.cookie, itemId, 'foreign')).status, 404);
    await database.prepare('UPDATE item_memory_settings SET next_due_at=? WHERE owner_id=? AND item_id=?')
      .run(new Date(Date.now() - 60_000).toISOString(), owner.id, itemId);

    const next = await fetch(`${baseUrl}/api/knowledge/recall/next`, { method: 'POST', headers: { Cookie: owner.cookie } });
    assert.equal(next.status, 200);
    const prompt = (await next.json() as { prompt: { id: string; question: string; reason: string }; remainingThisWeek: number }).prompt;
    assert.equal(prompt.question, 'Why did you save this?');
    assert.equal(prompt.reason, 'Try this');
    assert.equal((await fetch(`${baseUrl}/api/knowledge/recall/prompts/${prompt.id}/reveal`, { method: 'POST', headers: { Cookie: other.cookie } })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/knowledge/recall/prompts/${prompt.id}/respond`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'remembered' }) })).status, 409);
    const reveal = await fetch(`${baseUrl}/api/knowledge/recall/prompts/${prompt.id}/reveal`, { method: 'POST', headers: { Cookie: owner.cookie } });
    assert.equal(reveal.status, 200);
    assert.equal((await reveal.json() as { item: { id: string } }).item.id, itemId);
    assert.equal((await fetch(`${baseUrl}/api/knowledge/recall/prompts/${prompt.id}/respond`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'remembered' }) })).status, 200);
    const schedule = await database.prepare('SELECT interval_days AS "intervalDays",successful_recalls AS "successfulRecalls",next_due_at AS "nextDueAt" FROM item_memory_settings WHERE owner_id=? AND item_id=?').get(owner.id, itemId) as { intervalDays: number; successfulRecalls: number; nextDueAt: string };
    assert.equal(schedule.intervalDays, 3);
    assert.equal(schedule.successfulRecalls, 1);
    assert.ok(Date.parse(schedule.nextDueAt) > Date.now() + 2 * 24 * 60 * 60 * 1000);
  });
});

test('memory recall shows no more than three prompts in a rolling week and skip does not count as forgetting', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'memory-cap@example.test');
    await profile(baseUrl, owner.cookie, 'memory_cap');
    const ids = await Promise.all(['one', 'two', 'three', 'four'].map((path) => createPage(baseUrl, owner.cookie, path)));
    for (const id of ids) assert.equal((await enable(baseUrl, owner.cookie, id, '')).status, 200);
    await database.prepare('UPDATE item_memory_settings SET next_due_at=? WHERE owner_id=?').run(new Date(Date.now() - 60_000).toISOString(), owner.id);

    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${baseUrl}/api/knowledge/recall/next`, { method: 'POST', headers: { Cookie: owner.cookie } });
      const { prompt, remainingThisWeek } = await response.json() as { prompt: { id: string } | null; remainingThisWeek: number };
      assert.ok(prompt);
      assert.equal(remainingThisWeek, 2 - index);
      assert.equal((await fetch(`${baseUrl}/api/knowledge/recall/prompts/${prompt.id}/respond`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'skipped' }) })).status, 200);
      const schedule = await database.prepare('SELECT interval_days AS "intervalDays",successful_recalls AS "successfulRecalls" FROM item_memory_settings WHERE owner_id=? AND item_id=?').get(owner.id, (await database.prepare('SELECT item_id AS "itemId" FROM item_memory_prompts WHERE owner_id=? AND id=?').get(owner.id, prompt.id) as { itemId: string }).itemId) as { intervalDays: number; successfulRecalls: number };
      assert.equal(schedule.intervalDays, 1);
      assert.equal(schedule.successfulRecalls, 0);
    }
    const capped = await fetch(`${baseUrl}/api/knowledge/recall/next`, { method: 'POST', headers: { Cookie: owner.cookie } });
    assert.deepEqual(await capped.json(), { prompt: null, remainingThisWeek: 0 });
  });
});
