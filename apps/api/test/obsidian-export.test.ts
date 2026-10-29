import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import JSZip from 'jszip';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { buildObsidianExport } from '../src/knowledge/obsidian-export.js';

const origin = 'http://127.0.0.1:5173';
const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>) {
  const database = await createTestDatabase();
  const assetsPath = await mkdtemp(join(tmpdir(), 'rembr-obsidian-export-'));
  const app = createApp(database, { validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }), assetDirectory: assetsPath });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database); }
  finally { server.closeAllConnections(); server.close(); await database.close(); await rm(assetsPath, { recursive: true, force: true }); }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 201);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
  const body = await response.json() as { user: { id: string } };
  const profile = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email.split('@')[0]!.replaceAll('.', '_').replaceAll('-', '_') }) });
  assert.equal(profile.status, 200);
  return { cookie, userId: body.user.id };
}

test('Obsidian export builder creates all item and concept notes with stable collision-safe paths', () => {
  const { graph, files } = buildObsidianExport([
    { id: 'item-1', title: '../Same Name', url: 'https://example.com/a', description: 'First save', status: 'ready', createdAt: '2026-01-01', note: 'Personal note', summary: 'Summary one', keywords: ['Systems'], analysisTags: [] },
    { id: 'item-2', title: '../Same Name', url: 'https://example.com/b', description: '', status: 'ready', createdAt: '2026-01-02', note: '', summary: '', keywords: [], analysisTags: [] },
  ], [{ itemId: 'item-1', id: 'tag-1', name: 'Research' }], [{ itemId: 'item-1', id: 'collection-1', name: 'Reading' }]);
  assert.equal(graph.stats.indexedItems, 2);
  assert.equal(graph.stats.conceptNodes, 4); // domain, topic, tag, collection
  assert.equal(files.filter((file) => file.path.startsWith('IScraper Items/')).length, 2);
  assert.equal(new Set(files.map((file) => file.path)).size, files.length);
  assert.ok(files.every((file) => !file.path.includes('../')));
  assert.match(files.find((file) => file.path.startsWith('IScraper Items/'))!.content, /Personal note/);
  assert.ok(files.some((file) => file.path.startsWith('IScraper Graph/')));
  assert.ok(files.some((file) => file.path === 'graph.json'));
});

test('Obsidian graph ZIP contains the full owner library and excludes other accounts', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'obsidian-owner@example.test');
    const other = await register(baseUrl, 'obsidian-other@example.test');
    const unauthenticated = await fetch(`${baseUrl}/api/knowledge/graph/export/obsidian`);
    assert.equal(unauthenticated.status, 401);
    const addPage = async (cookie: string, url: string, title: string) => {
      const response = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      assert.ok(response.status === 201 || response.status === 202);
      const body = await response.json() as { item: { id: string } };
      await database.prepare('UPDATE saved_items SET title_override=? WHERE id=?').run(title, body.item.id);
      return body.item.id;
    };
    const first = await addPage(owner.cookie, 'https://example.com/first', 'Same / Name');
    const second = await addPage(owner.cookie, 'https://example.com/second', 'Same / Name');
    const foreign = await addPage(other.cookie, 'https://example.net/private', 'Private other-account item');
    const extraItems = Array.from({ length: 201 }, (_, index) => [
      `export-item-${String(index).padStart(3, '0')}`, owner.userId,
      `https://archive.example.org/${index}`, `https://archive.example.org/${index}`,
      `Archive save ${index}`, '', 'ready', new Date(1_700_000_000_000 + index).toISOString(), new Date(1_700_000_000_000 + index).toISOString(),
    ]);
    const placeholders = extraItems.map(() => '(?,?,?,?,?,?,?,?,?)').join(',');
    await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at) VALUES ${placeholders}`).run(...extraItems.flat());
    await database.prepare('INSERT INTO notes (owner_id,item_id,body,created_at,updated_at) VALUES (?,?,?,?,?)').run(owner.userId, first, 'Owner-authored note', new Date().toISOString(), new Date().toISOString());
    const tag = 'owner-export-tag';
    await database.prepare('INSERT INTO tags (id,owner_id,normalized_name,display_name,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(tag, owner.userId, tag, 'Export tag', new Date().toISOString(), new Date().toISOString());
    await database.prepare('INSERT INTO item_tags (owner_id,item_id,tag_id,created_at) VALUES (?,?,?,?)').run(owner.userId, first, tag, new Date().toISOString());

    const bounded = await fetch(`${baseUrl}/api/knowledge/graph`, { headers: { Cookie: owner.cookie } });
    const boundedGraph = (await bounded.json() as { graph: { stats: { indexedItems: number }; truncated: boolean } }).graph;
    assert.equal(boundedGraph.stats.indexedItems, 200);
    assert.equal(boundedGraph.truncated, true);
    const response = await fetch(`${baseUrl}/api/knowledge/graph/export/obsidian`, { headers: { Cookie: owner.cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const archive = await JSZip.loadAsync(await response.arrayBuffer());
    const fileNames = Object.entries(archive.files).filter(([, file]) => !file.dir).map(([name]) => name);
    assert.ok(fileNames.includes('graph.json'));
    assert.equal(fileNames.filter((name) => name.startsWith('IScraper Items/')).length, 203);
    assert.ok(fileNames.some((name) => name.startsWith('IScraper Graph/Export tag')));
    const itemFiles = fileNames.filter((name) => name.startsWith('IScraper Items/'));
    assert.equal(new Set(itemFiles).size, 203);
    const notes = await Promise.all(itemFiles.map(async (name) => archive.file(name)!.async('string')));
    assert.ok(notes.some((content) => content.includes('Owner-authored note')));
    assert.ok(!notes.some((content) => content.includes('Private other-account item')));
    const graph = JSON.parse(await archive.file('graph.json')!.async('string')) as { stats: { indexedItems: number }; nodes: Array<{ itemId?: string }> };
    assert.equal(graph.stats.indexedItems, 203);
    assert.ok(graph.nodes.some((node) => node.itemId === first));
    assert.ok(graph.nodes.some((node) => node.itemId === second));
    assert.ok(graph.nodes.some((node) => node.itemId === 'export-item-200'));
    assert.ok(!graph.nodes.some((node) => node.itemId === foreign));
  });
});
