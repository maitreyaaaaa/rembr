import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { AI_DISCLOSURE_VERSION } from '../src/ai/preferences.js';
import { AI_SEARCH_DISCLOSURE_VERSION } from '../src/knowledge/ai-search-preferences.js';

const password = 'correct-horse-battery-staple';
test('Terms-enabled AI media analysis can be disabled and stale grants fail closed', async () => {
  const database = await createTestDatabase();
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ai-preference@example.test', password, acceptedTerms: true }),
    });
    assert.equal(registration.status, 201);
    const cookie = (registration.headers.get('set-cookie') ?? '').split(';')[0]!;
    const account = await registration.json() as { user: { id: string } };
    const profile = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ai_preference_user' }),
    });
    assert.equal(profile.status, 200);
    await database.prepare(`UPDATE ai_analysis_preferences SET enabled=TRUE,consent_version=?,
      consented_at=(SELECT created_at FROM users WHERE id=?),updated_at=(SELECT created_at FROM users WHERE id=?) WHERE owner_id=?`)
      .run(AI_DISCLOSURE_VERSION, account.user.id, account.user.id, account.user.id);
    await database.prepare(`UPDATE ai_search_preferences SET enabled=TRUE,consent_version=?,
      consented_at=(SELECT created_at FROM users WHERE id=?),updated_at=(SELECT created_at FROM users WHERE id=?) WHERE owner_id=?`)
      .run(AI_SEARCH_DISCLOSURE_VERSION, account.user.id, account.user.id, account.user.id);
    const defaults = await fetch(`${baseUrl}/api/ai/preferences`, { headers: { Cookie: cookie } });
    assert.equal(defaults.status, 200);
    const defaultBody = await defaults.json() as { preference: { enabled: boolean; providerAvailable: boolean } };
    assert.equal(defaultBody.preference.enabled, false);
    assert.equal(typeof defaultBody.preference.providerAvailable, 'boolean');
    const searchPreferences = await fetch(`${baseUrl}/api/knowledge/ai-preferences`, { headers: { Cookie: cookie } });
    assert.equal((await searchPreferences.json() as { preference: { enabled: boolean } }).preference.enabled, false);

    const consentRequired = await fetch(`${baseUrl}/api/ai/preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(consentRequired.status, 400);
    const consent = await fetch(`${baseUrl}/api/ai/preferences`, {
      method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, disclosureVersion: AI_DISCLOSURE_VERSION }),
    });
    assert.equal(consent.status, 200);
    assert.equal((await consent.json() as { preference: { enabled: boolean } }).preference.enabled, true);

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
