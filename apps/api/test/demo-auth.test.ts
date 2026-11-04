import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';

test('demo entry creates a normal session for the configured shared workspace and supports writes', async () => {
  const database = await createTestDatabase();
  const assetsPath = await mkdtemp(join(tmpdir(), 'rembr-demo-auth-'));
  const demoOwnerId = randomUUID();
  const now = new Date().toISOString();
  await database.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)')
    .run(demoOwnerId, 'rembr-demo@example.test', 'fixture-hash', now);
  const app = createApp(database, { assetDirectory: assetsPath, demoOwnerId });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const entry = await fetch(`${baseUrl}/api/auth/demo`, { method: 'POST' });
    assert.equal(entry.status, 200);
    assert.deepEqual(await entry.json(), { demo: true });
    const cookie = (entry.headers.get('set-cookie') ?? '').split(';')[0]!;
    assert.ok(cookie);

    const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json() as { user: { id: string } }).user.id, demoOwnerId);

    const profile = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'shared_demo' }),
    });
    assert.equal(profile.status, 200);

    const note = new FormData();
    note.set('title', 'Examiner demo save'); note.set('body', 'This save was added through the public demo session.'); note.set('links', '[]');
    const saved = await fetch(`${baseUrl}/api/notes`, { method: 'POST', headers: { Cookie: cookie }, body: note });
    assert.equal(saved.status, 201);
    const { item } = await saved.json() as { item: { id: string } };
    assert.equal((await database.prepare('SELECT owner_id FROM saved_items WHERE id=?').get(item.id) as { owner_id: string }).owner_id, demoOwnerId);
  } finally {
    server.closeAllConnections(); server.close(); await database.close(); await rm(assetsPath, { recursive: true, force: true });
  }
});
