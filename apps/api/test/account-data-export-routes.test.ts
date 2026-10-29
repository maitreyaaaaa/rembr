import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import type { PrivateExportArtifactStorage } from '../src/account/data-export-service.js';

const origin = 'http://127.0.0.1:5173';
test('account export routes require a session, hide other owners, and send no-store headers', async () => {
  const database = await createTestDatabase();
  const storage: PrivateExportArtifactStorage = {
    async write() { return 'opaque'; }, async read() { return Buffer.from('zip'); }, async remove() {},
  };
  const app = createApp(database, { exportStorage: storage });
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const unauthorized = await fetch(`${base}/api/account/data-exports`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unauthorized.status, 401);
    const accounts: string[] = [];
    for (const email of ['export-a@example.test', 'export-b@example.test']) {
      const created = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'cedar meadow lantern river sunset 2026' }) });
      assert.equal(created.status, 201);
      accounts.push(created.headers.get('set-cookie')!.split(';')[0]!);
    }
    const requested = await fetch(`${base}/api/account/data-exports`, { method: 'POST', headers: { Origin: origin, Cookie: accounts[0]!, 'Content-Type': 'application/json' }, body: '{"includeFiles":false}' });
    assert.equal(requested.status, 202);
    assert.match(requested.headers.get('cache-control') ?? '', /no-store/);
    const id = (await requested.json() as { id: string }).id;
    const history = await fetch(`${base}/api/account/data-exports`, { headers: { Cookie: accounts[0]! } });
    assert.equal(history.status, 200);
    assert.deepEqual((await history.json() as { exports: Array<{ id: string }> }).exports.map((item) => item.id), [id]);
    const foreign = await fetch(`${base}/api/account/data-exports/${id}`, { headers: { Cookie: accounts[1]! } });
    assert.equal(foreign.status, 404);
    const foreignHistory = await fetch(`${base}/api/account/data-exports`, { headers: { Cookie: accounts[1]! } });
    assert.deepEqual((await foreignHistory.json() as { exports: unknown[] }).exports, []);
    const ownerStatus = await fetch(`${base}/api/account/data-exports/${id}`, { headers: { Cookie: accounts[0]! } });
    assert.equal(ownerStatus.status, 200);
    assert.match(ownerStatus.headers.get('cache-control') ?? '', /no-store/);
    await database.prepare("UPDATE account_data_exports SET status='ready',artifact_key='opaque',expires_at=? WHERE id=?")
      .run(new Date(Date.now() + 60_000).toISOString(), id);
    const download = await fetch(`${base}/api/account/data-exports/${id}/download`, { headers: { Cookie: accounts[0]! } });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/zip');
    assert.match(download.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(await download.text(), 'zip');
    await database.prepare("UPDATE account_data_exports SET expires_at=? WHERE id=?")
      .run(new Date(Date.now() - 60_000).toISOString(), id);
    const expired = await fetch(`${base}/api/account/data-exports/${id}/download`, { headers: { Cookie: accounts[0]! } });
    assert.equal(expired.status, 410);
    assert.equal((await expired.json() as { error: { code: string } }).error.code, 'export_expired');
  } finally { server.close(); await once(server, 'close'); await database.close(); }
});
