import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { extractPage } from '../src/items/extract.js';
import { createItemRepository } from '../src/items/repository.js';
import { CaptureError, fetchPublicPage, validatePublicUrl } from '../src/items/safe-fetch.js';
import { processNextJob } from '../src/worker/process-job.js';

const origin = 'http://127.0.0.1:5173';
const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string) => Promise<void>) {
  const database = createTestDatabase();
  const app = createApp(database, {
    validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    database.close();
  }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = response.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  assert.equal(response.status, 201);
  assert.ok(cookie, 'registration returns a session cookie');
  return { cookie, setCookie, user: await response.json() as { user: { id: string; email: string } } };
}

test('API denies private library access without a verified session', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/items`);
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'unauthorized');
    const foreignOrigin = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'foreign@example.test', password }),
    });
    assert.equal(foreignOrigin.status, 403);
  });
});

test('session cookie is HttpOnly and a signed-out session is immediately revoked', async () => {
  await withApi(async (baseUrl) => {
    const account = await register(baseUrl, 'sessions@example.test');
    assert.match(account.setCookie, /HttpOnly/i);
    assert.match(account.setCookie, /SameSite=Lax/i);
    const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: account.cookie } });
    assert.equal(sessionResponse.status, 200);
    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: account.cookie, Origin: origin } });
    assert.equal(logout.status, 204);
    const afterLogout = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: account.cookie } });
    assert.equal(afterLogout.status, 401);
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sessions@example.test', password }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Lax/i);
  });
});

test('registration, capture, owner isolation, and deletion stay in one account boundary', async () => {
  await withApi(async (baseUrl) => {
    const first = await register(baseUrl, 'one@example.test');
    const second = await register(baseUrl, 'two@example.test');
    const capture = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: first.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/article#section' }),
    });
    assert.equal(capture.status, 202);
    const created = await capture.json() as { item: { id: string; status: string }; duplicate: boolean };
    assert.equal(created.item.status, 'queued');
    assert.equal(created.duplicate, false);

    const visibleToOwner = await fetch(`${baseUrl}/api/items`, { headers: { Cookie: first.cookie } });
    assert.equal((await visibleToOwner.json() as { items: unknown[] }).items.length, 1);
    const hiddenFromOtherUser = await fetch(`${baseUrl}/api/items`, { headers: { Cookie: second.cookie } });
    assert.equal((await hiddenFromOtherUser.json() as { items: unknown[] }).items.length, 0);

    const foreignRead = await fetch(`${baseUrl}/api/items/${created.item.id}`, { headers: { Cookie: second.cookie } });
    assert.equal(foreignRead.status, 404);
    const foreignDelete = await fetch(`${baseUrl}/api/items/${created.item.id}`, { method: 'DELETE', headers: { Cookie: second.cookie } });
    assert.equal(foreignDelete.status, 404);

    const ownerDelete = await fetch(`${baseUrl}/api/items/${created.item.id}`, { method: 'DELETE', headers: { Cookie: first.cookie, Origin: origin } });
    assert.equal(ownerDelete.status, 204);
  });
});

test('same-account duplicate capture does not create another job', async () => {
  await withApi(async (baseUrl) => {
    const account = await register(baseUrl, 'duplicate@example.test');
    const headers = { Origin: origin, Cookie: account.cookie, 'Content-Type': 'application/json' };
    const submit = (url: string) => fetch(`${baseUrl}/api/items`, { method: 'POST', headers, body: JSON.stringify({ url }) });
    assert.equal((await submit('https://example.com/story')).status, 202);
    const duplicate = await submit('https://example.com/story#comments');
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json() as { duplicate: boolean }).duplicate, true);
    const list = await fetch(`${baseUrl}/api/items`, { headers: { Cookie: account.cookie } });
    assert.equal((await list.json() as { items: unknown[] }).items.length, 1);
  });
});

test('worker stores a deterministic readable artifact for the owning account', async () => {
  const database = createTestDatabase();
  try {
    database.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('user-1', 'worker@example.test', 'unused', new Date().toISOString());
    const repository = createItemRepository(database);
    const item = repository.create('user-1', 'https://example.com/article', 'https://example.com/article', 'example.com');
    const processed = await processNextJob(database, async () => ({
      finalUrl: 'https://example.com/article',
      contentType: 'text/html',
      html: '<html><head><title>Useful page</title><meta name="description" content="A source description"></head><body><main><p>Readable source text.</p><script>privateCode()</script></main></body></html>',
    }));
    assert.ok(processed);
    const saved = repository.get('user-1', item.id);
    assert.equal(saved?.status, 'ready');
    assert.equal(saved?.title, 'Useful page');
    assert.match(saved?.text ?? '', /Readable source text/);
    assert.doesNotMatch(saved?.text ?? '', /privateCode/);
  } finally {
    database.close();
  }
});

test('a deleted item cannot be recreated by an in-flight worker', async () => {
  const database = createTestDatabase();
  try {
    database.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('user-2', 'race@example.test', 'unused', new Date().toISOString());
    const repository = createItemRepository(database);
    const item = repository.create('user-2', 'https://example.com/race', 'https://example.com/race', 'example.com');
    let releaseFetch!: (value: { finalUrl: string; contentType: string; html: string }) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const processing = processNextJob(database, async () => {
      signalStarted();
      return new Promise((resolve) => { releaseFetch = resolve; });
    });
    await started;
    assert.equal(repository.delete('user-2', item.id), true);
    releaseFetch({ finalUrl: item.url, contentType: 'text/html', html: '<main>Deleted during capture</main>' });
    assert.equal(await processing, null);
    assert.equal(repository.get('user-2', item.id), undefined);
    assert.equal(database.prepare('SELECT count(*) AS count FROM extracted_artifacts').get() && (database.prepare('SELECT count(*) AS count FROM extracted_artifacts').get() as { count: number }).count, 0);
  } finally {
    database.close();
  }
});

test('URL validation blocks private addresses, custom ports, and unsupported schemes', async () => {
  await assert.rejects(validatePublicUrl('http://127.0.0.1/'), (error: unknown) => error instanceof CaptureError && error.code === 'blocked_target');
  await assert.rejects(validatePublicUrl('http://[::1]/'), (error: unknown) => error instanceof CaptureError && error.code === 'blocked_target');
  await assert.rejects(validatePublicUrl('http://169.254.169.254/latest/meta-data/'), (error: unknown) => error instanceof CaptureError && error.code === 'blocked_target');
  await assert.rejects(validatePublicUrl('http://192.168.1.1/'), (error: unknown) => error instanceof CaptureError && error.code === 'blocked_target');
  await assert.rejects(validatePublicUrl('https://example.com:8443/'), (error: unknown) => error instanceof CaptureError && error.code === 'unsupported_url');
  await assert.rejects(validatePublicUrl('file:///etc/passwd'), (error: unknown) => error instanceof CaptureError && error.code === 'unsupported_url');
});

test('every redirect target is revalidated before a new connection', async () => {
  const targets: string[] = [];
  await assert.rejects(fetchPublicPage('https://public.example/', {
    validateUrl: async (input) => {
      targets.push(input);
      if (input.includes('127.0.0.1')) throw new CaptureError('blocked_target', 'private');
      return { url: new URL(input), address: '93.184.216.34', family: 4 };
    },
    requestPage: async () => ({ statusCode: 302, location: 'http://127.0.0.1/admin', contentType: 'text/html', body: '' }),
  }), (error: unknown) => error instanceof CaptureError && error.code === 'blocked_target');
  assert.equal(targets.length, 2);
});

test('HTML extraction removes script content and bounds derived fields', () => {
  const result = extractPage('<title>  A   title </title><body><p>Body text</p><script>doNotKeep()</script></body>', 'https://example.com');
  assert.equal(result.title, 'A title');
  assert.match(result.text, /Body text/);
  assert.doesNotMatch(result.text, /doNotKeep/);
});
