import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';

const password = 'correct-horse-battery-staple';
const disclosureVersion = '2026-10-29-v1';

test('AI media preference is off by default and enabling requires the current public-media disclosure', async () => {
  const database = await createTestDatabase();
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ai-preference@example.test', password }),
    });
    assert.equal(registration.status, 201);
    const cookie = (registration.headers.get('set-cookie') ?? '').split(';')[0]!;
    const defaults = await fetch(`${baseUrl}/api/ai/preferences`, { headers: { Cookie: cookie } });
    assert.equal(defaults.status, 200);
    const defaultBody = await defaults.json() as { preference: { enabled: boolean; providerAvailable: boolean } };
    assert.equal(defaultBody.preference.enabled, false);
    assert.equal(typeof defaultBody.preference.providerAvailable, 'boolean');

    const missingDisclosure = await fetch(`${baseUrl}/api/ai/preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(missingDisclosure.status, 400);

    const enable = await fetch(`${baseUrl}/api/ai/preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, disclosureVersion }),
    });
    assert.equal(enable.status, 200);
    assert.equal((await enable.json() as { preference: { enabled: boolean } }).preference.enabled, true);

    const disable = await fetch(`${baseUrl}/api/ai/preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(disable.status, 200);
    assert.equal((await disable.json() as { preference: { enabled: boolean } }).preference.enabled, false);
  } finally {
    server.closeAllConnections(); server.close(); await database.close();
  }
});
