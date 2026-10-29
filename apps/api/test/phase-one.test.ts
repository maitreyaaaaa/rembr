import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import bcrypt from 'bcryptjs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { createTestDatabase } from '../src/db/database.js';
import { extractPage } from '../src/items/extract.js';
import { createItemRepository } from '../src/items/repository.js';
import { CaptureError, fetchPublicMedia, fetchPublicPage, validatePublicUrl } from '../src/items/safe-fetch.js';
import { claimNextJob, processNextJob } from '../src/worker/process-job.js';

const origin = 'http://127.0.0.1:5173';
const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>) => Promise<void>) {
  const database = await createTestDatabase();
  const app = createApp(database, {
    validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`, database);
  } finally {
    server.close();
    await once(server, 'close');
    await database.close();
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
  const user = await response.json() as { user: { id: string; email: string } };
  const username = email.split('@')[0]!.replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 24).padEnd(3, '_');
  const profile = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  assert.equal(profile.status, 200);
  return { cookie, setCookie, user };
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
  await withApi(async (baseUrl, database) => {
    const account = await register(baseUrl, 'sessions@example.test');
    assert.match(account.setCookie, /HttpOnly/i);
    assert.match(account.setCookie, /SameSite=Lax/i);
    const token = account.cookie.slice(account.cookie.indexOf('=') + 1);
    const storedHash = await database.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    assert.equal(storedHash.token_hash, createHash('sha256').update(decodeURIComponent(token)).digest('hex'));
    assert.notEqual(storedHash.token_hash, decodeURIComponent(token));
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

test('registration uses the 15-code-point policy, blocks common/contextual passwords, and preserves full Unicode input', async () => {
  await withApi(async (baseUrl, database) => {
    const registerRaw = (email: string, value: string) => fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: value }),
    });

    const short = await registerRaw('short@example.test', 'Cedar river!!!');
    assert.equal(short.status, 400);
    assert.equal((await short.json() as { error: { code: string } }).error.code, 'password_too_short');

    const normalizedShort = await registerRaw('normalized-short@example.test', 'e\u0301'.repeat(8));
    assert.equal(normalizedShort.status, 400);
    assert.equal((await normalizedShort.json() as { error: { code: string } }).error.code, 'password_too_short');

    const common = await registerRaw('common@example.test', 'passwordpassword');
    assert.equal(common.status, 400);
    assert.equal((await common.json() as { error: { code: string } }).error.code, 'password_blocklisted');

    const contextual = await registerRaw('maitreya@example.test', 'maitreya1234567');
    assert.equal(contextual.status, 400);
    assert.equal((await contextual.json() as { error: { code: string } }).error.code, 'password_blocklisted');

    const longUnicode = '界'.repeat(30);
    assert.ok(Buffer.byteLength(longUnicode) > 72);
    const created = await registerRaw('unicode@example.test', longUnicode);
    assert.equal(created.status, 201);
    const stored = await database.prepare('SELECT password_hash FROM users WHERE email=?').get('unicode@example.test') as { password_hash: string };
    assert.match(stored.password_hash, /^\$argon2id\$/);

    const login = (value: string) => fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unicode@example.test', password: value }),
    });
    assert.equal((await login(longUnicode)).status, 200);
    assert.equal((await login(`${'界'.repeat(24)}different-suffix`)).status, 401);
  });
});

test('legacy bcrypt password hashes remain verifiable during the new-hash rollout', async () => {
  await withApi(async (baseUrl, database) => {
    const legacyPassword = 'legacy-password-is-long-enough';
    await database.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)')
      .run('legacy-user', 'legacy@example.test', await bcrypt.hash(legacyPassword, 12), new Date().toISOString());
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'legacy@example.test', password: legacyPassword }),
    });
    assert.equal(response.status, 200);
  });
});

test('expired sessions cannot restore an authenticated principal', async () => {
  await withApi(async (baseUrl, database) => {
    const account = await register(baseUrl, 'expired@example.test');
    const token = account.cookie.slice(account.cookie.indexOf('=') + 1);
    const tokenHash = createHash('sha256').update(decodeURIComponent(token)).digest('hex');
    const result = await database.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .run('2000-01-01T00:00:00.000Z', tokenHash);
    assert.equal(result.changes, 1);
    const response = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: account.cookie } });
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'unauthorized');
  });
});

test('registration, capture, owner isolation, and deletion stay in one account boundary', async () => {
  await withApi(async (baseUrl, database) => {
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
    const persistedJob = await database.prepare('SELECT status FROM processing_jobs WHERE item_id = ? AND owner_id = ?')
      .get(created.item.id, first.user.user.id) as { status: string } | undefined;
    assert.equal(persistedJob?.status, 'queued');

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
  const database = await createTestDatabase();
  try {
    await database.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('user-1', 'worker@example.test', 'unused', new Date().toISOString());
    const repository = createItemRepository(database);
    const item = await repository.create('user-1', 'https://example.com/article', 'https://example.com/article', 'example.com');
    const processed = await processNextJob(database, async () => ({
      finalUrl: 'https://example.com/article',
      contentType: 'text/html',
      html: '<html><head><title>Useful page</title><meta name="description" content="A source description"></head><body><main><p>Readable source text.</p><script>privateCode()</script></main></body></html>',
    }));
    assert.ok(processed);
    const saved = await repository.get('user-1', item.id);
    assert.equal(saved?.status, 'ready');
    assert.equal(saved?.title, 'Useful page');
    assert.match(saved?.text ?? '', /Readable source text/);
    assert.doesNotMatch(saved?.text ?? '', /privateCode/);
  } finally {
    await database.close();
  }
});

test('a deleted item cannot be recreated by an in-flight worker', async () => {
  const database = await createTestDatabase();
  try {
    await database.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('user-2', 'race@example.test', 'unused', new Date().toISOString());
    const repository = createItemRepository(database);
    const item = await repository.create('user-2', 'https://example.com/race', 'https://example.com/race', 'example.com');
    let releaseFetch!: (value: { finalUrl: string; contentType: string; html: string }) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const processing = processNextJob(database, async () => {
      signalStarted();
      return new Promise((resolve) => { releaseFetch = resolve; });
    });
    await started;
    assert.equal(await repository.delete('user-2', item.id), true);
    releaseFetch({ finalUrl: item.url, contentType: 'text/html', html: '<main>Deleted during capture</main>' });
    assert.equal(await processing, null);
    assert.equal(await repository.get('user-2', item.id), undefined);
    assert.equal(await database.prepare('SELECT count(*) AS count FROM extracted_artifacts').get() && (await database.prepare('SELECT count(*) AS count FROM extracted_artifacts').get() as { count: number }).count, 0);
  } finally {
    await database.close();
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

test('bounded fetch rejects compressed, unsupported, and oversized responses', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/compressed') {
      response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      response.end('not actually compressed');
    } else if (request.url === '/unsupported') {
      response.writeHead(200, { 'content-type': 'application/pdf' });
      response.end('pdf');
    } else if (request.url === '/declared-large') {
      response.writeHead(200, { 'content-type': 'text/html', 'content-length': config.MAX_CAPTURE_BYTES + 1 });
      response.end('small body');
    } else {
      response.writeHead(200, { 'content-type': 'text/html', 'transfer-encoding': 'chunked' });
      response.end(Buffer.alloc(config.MAX_CAPTURE_BYTES + 1, 'a'));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const validateLocalTestTarget = async (input: string) => ({
    url: new URL(input), address: '127.0.0.1', family: 4 as const,
  });
  try {
    const base = `http://127.0.0.1:${address.port}`;
    for (const [path, code] of [
      ['/compressed', 'unsupported_content'],
      ['/unsupported', 'unsupported_content'],
      ['/declared-large', 'page_too_large'],
      ['/streamed-large', 'page_too_large'],
    ] as const) {
      await assert.rejects(fetchPublicPage(`${base}${path}`, { validateUrl: validateLocalTestTarget }),
        (error: unknown) => error instanceof CaptureError && error.code === code, path);
    }
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('media fetch validates redirect targets and enforces bounded image content', async () => {
  const visited: string[] = []; const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const downloaded = await fetchPublicMedia('https://page.example/cover', {
    validateUrl: async (input) => { const url = new URL(input); visited.push(url.hostname); return { url, address: '93.184.216.34', family: 4 }; },
    requestMedia: async (target) => target.url.hostname === 'page.example'
      ? { statusCode: 302, location: 'https://cdn.example/cover.png', contentType: '', body: Buffer.alloc(0) }
      : { statusCode: 200, location: undefined, contentType: 'image/png', body: image },
  });
  assert.deepEqual(visited, ['page.example', 'cdn.example']);
  assert.equal(downloaded.mime, 'image/png');
  assert.deepEqual(downloaded.bytes, image);

  await assert.rejects(fetchPublicMedia('https://page.example/cover', {
    validateUrl: async (input) => {
      const url = new URL(input);
      if (url.hostname === 'internal.local') throw new CaptureError('blocked_target', 'blocked');
      return { url, address: '93.184.216.34', family: 4 };
    },
    requestMedia: async () => ({ statusCode: 302, location: 'http://internal.local/private.png', contentType: '', body: Buffer.alloc(0) }),
  }), { code: 'blocked_target' });
});

test('transient worker failures retry and expired leases are fenced on reclaim', async () => {
  const database = await createTestDatabase();
  try {
    await database.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('user-retry', 'retry@example.test', 'unused', new Date().toISOString());
    const repository = createItemRepository(database);
    const item = await repository.create('user-retry', 'https://example.com/retry', 'https://example.com/retry', 'example.com');
    assert.ok(await processNextJob(database, async () => { throw new Error('temporary network fault'); }));
    let job = await database.prepare('SELECT status, attempts, error_code FROM processing_jobs WHERE item_id = ?')
      .get(item.id) as { status: string; attempts: number; error_code: string | null };
    assert.equal(job.status, 'retry_wait');
    assert.equal(job.attempts, 1);
    assert.equal(job.error_code, 'fetch_failed');
    await database.prepare('UPDATE processing_jobs SET available_at = ? WHERE item_id = ?')
      .run('2000-01-01T00:00:00.000Z', item.id);
    assert.ok(await processNextJob(database, async () => ({
      finalUrl: item.url, contentType: 'text/html', html: '<main>Retry recovered</main>',
    })));
    job = await database.prepare('SELECT status, attempts, error_code FROM processing_jobs WHERE item_id = ?')
      .get(item.id) as { status: string; attempts: number; error_code: string | null };
    assert.equal(job.status, 'completed');
    assert.equal(job.attempts, 2);
    assert.equal((await repository.get('user-retry', item.id))?.status, 'ready');

    const leased = await repository.create('user-retry', 'https://example.com/lease', 'https://example.com/lease', 'example.com');
    await database.prepare(`UPDATE processing_jobs SET status='processing', attempts=1, lease_token='stale-token',
      lease_expires_at='2000-01-01T00:00:00.000Z' WHERE item_id=?`).run(leased.id);
    await database.prepare("UPDATE saved_items SET status='processing' WHERE id=?").run(leased.id);
    const reclaimed = await claimNextJob(database);
    assert.equal(reclaimed?.item_id, leased.id);
    assert.equal(reclaimed?.attempts, 2);
    assert.notEqual(reclaimed?.lease_token, 'stale-token');

    const exhausted = await repository.create('user-retry', 'https://example.com/exhausted', 'https://example.com/exhausted', 'example.com');
    await database.prepare(`UPDATE processing_jobs SET status='processing', attempts=max_attempts,
      lease_token='exhausted-token', lease_expires_at='2000-01-01T00:00:00.000Z' WHERE item_id=?`).run(exhausted.id);
    await database.prepare("UPDATE saved_items SET status='processing' WHERE id=?").run(exhausted.id);
    assert.equal(await claimNextJob(database), undefined);
    const failedJob = await database.prepare('SELECT status,error_code FROM processing_jobs WHERE item_id=?')
      .get(exhausted.id) as { status: string; error_code: string };
    assert.equal(failedJob.status, 'failed');
    assert.equal(failedJob.error_code, 'worker_interrupted');
    assert.equal((await repository.get('user-retry', exhausted.id))?.status, 'failed');
  } finally {
    await database.close();
  }
});

test('HTML extraction removes script content and bounds derived fields', () => {
  const result = extractPage('<title>  A   title </title><body><p>Body text</p><script>doNotKeep()</script></body>', 'https://example.com');
  assert.equal(result.title, 'A title');
  assert.match(result.text, /Body text/);
  assert.doesNotMatch(result.text, /doNotKeep/);
});
