import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { AI_DISCLOSURE_VERSION, LOCAL_ASR_DISCLOSURE_VERSION, LOCAL_OCR_DISCLOSURE_VERSION } from '../src/ai/preferences.js';

const password = 'correct-horse-battery-staple';
const disclosureVersion = AI_DISCLOSURE_VERSION;

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

test('local OCR consent is independent, off by default, and requires its own disclosure', async () => {
  const database = await createTestDatabase();
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'local-ocr@example.test', password }),
    });
    assert.equal(registration.status, 201);
    const cookie = (registration.headers.get('set-cookie') ?? '').split(';')[0]!;
    const defaults = await fetch(`${baseUrl}/api/ai/local-ocr-preferences`, { headers: { Cookie: cookie } });
    assert.equal(defaults.status, 200);
    assert.equal((await defaults.json() as { preference: { enabled: boolean } }).preference.enabled, false);

    const missingDisclosure = await fetch(`${baseUrl}/api/ai/local-ocr-preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(missingDisclosure.status, 400);

    const enable = await fetch(`${baseUrl}/api/ai/local-ocr-preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, disclosureVersion: LOCAL_OCR_DISCLOSURE_VERSION }),
    });
    assert.equal(enable.status, 200);
    assert.equal((await enable.json() as { preference: { enabled: boolean } }).preference.enabled, true);
    const meta = await fetch(`${baseUrl}/api/ai/preferences`, { headers: { Cookie: cookie } });
    assert.equal((await meta.json() as { preference: { enabled: boolean } }).preference.enabled, false);
    const enableMeta = await fetch(`${baseUrl}/api/ai/preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, disclosureVersion }),
    });
    assert.equal((await enableMeta.json() as { preference: { enabled: boolean } }).preference.enabled, true);

    const disable = await fetch(`${baseUrl}/api/ai/local-ocr-preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(disable.status, 200);
    assert.equal((await disable.json() as { preference: { enabled: boolean } }).preference.enabled, false);
    const metaStillEnabled = await fetch(`${baseUrl}/api/ai/preferences`, { headers: { Cookie: cookie } });
    assert.equal((await metaStillEnabled.json() as { preference: { enabled: boolean } }).preference.enabled, true);
    const disableMeta = await fetch(`${baseUrl}/api/ai/preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal((await disableMeta.json() as { preference: { enabled: boolean } }).preference.enabled, false);
  } finally {
    server.closeAllConnections(); server.close(); await database.close();
  }
});

test('local ASR consent is independent, off by default, and requires its own disclosure', async () => {
  const database = await createTestDatabase();
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'local-asr@example.test', password }),
    });
    assert.equal(registration.status, 201);
    const cookie = (registration.headers.get('set-cookie') ?? '').split(';')[0]!;
    const defaults = await fetch(`${baseUrl}/api/ai/local-asr-preferences`, { headers: { Cookie: cookie } });
    assert.equal(defaults.status, 200);
    assert.equal((await defaults.json() as { preference: { enabled: boolean; providerAvailable: boolean } }).preference.enabled, false);

    const missingDisclosure = await fetch(`${baseUrl}/api/ai/local-asr-preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(missingDisclosure.status, 400);
    const enable = await fetch(`${baseUrl}/api/ai/local-asr-preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, disclosureVersion: LOCAL_ASR_DISCLOSURE_VERSION }),
    });
    assert.equal(enable.status, 200);
    assert.equal((await enable.json() as { preference: { enabled: boolean } }).preference.enabled, true);
    const meta = await fetch(`${baseUrl}/api/ai/preferences`, { headers: { Cookie: cookie } });
    assert.equal((await meta.json() as { preference: { enabled: boolean } }).preference.enabled, false);
    const ocr = await fetch(`${baseUrl}/api/ai/local-ocr-preferences`, { headers: { Cookie: cookie } });
    assert.equal((await ocr.json() as { preference: { enabled: boolean } }).preference.enabled, false);

    const disable = await fetch(`${baseUrl}/api/ai/local-asr-preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(disable.status, 200);
    assert.equal((await disable.json() as { preference: { enabled: boolean } }).preference.enabled, false);
  } finally {
    server.closeAllConnections(); server.close(); await database.close();
  }
});
