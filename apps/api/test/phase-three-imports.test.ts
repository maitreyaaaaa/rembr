import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { createImportService, validateImportFiles } from '../src/imports/service.js';
import { createImportRepository } from '../src/imports/repository.js';
import { LOCAL_OCR_DISCLOSURE_VERSION } from '../src/ai/preferences.js';
import type { ParsedImportItem } from '../src/imports/parser.js';
import { LocalImportStorage } from '../src/imports/storage.js';
import { LocalMediaStorage } from '../src/media/storage.js';
import { claimNextJob, processNextJob } from '../src/worker/process-job.js';
import { CaptureError } from '../src/items/safe-fetch.js';

const password = 'correct-horse-battery-staple';

test('local media storage honors an aborted owner-work signal before creating an object', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rembr-media-abort-'));
  try {
    const storage = new LocalMediaStorage(root);
    const controller = new AbortController();
    controller.abort(new Error('work_lease_lost'));
    await assert.rejects(storage.write(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png',
      '6e40dc60-72a2-4ce3-96b5-fc502e1bff96.media', controller.signal));
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('upload validation accepts source-compatible X JavaScript bookmark exports', () => {
  const bytes = Buffer.byteLength('window.YTD.bookmark.part0 = [];');
  assert.doesNotThrow(() => validateImportFiles([{ name: 'bookmark.js', mime: 'application/javascript', size: bytes, chunks: 1 }]));
});

test('new Instagram imports queue analysis for separate local OCR consent without Meta consent', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO users (id,email,password_hash,created_at)
      VALUES ('local-ocr-import-user','local-ocr-import@example.test','x',?)`).run(now);
    await database.prepare(`INSERT INTO imports (id,owner_id,request_id,source,status,created_at,updated_at,lease_token,lease_expires_at)
      VALUES ('local-ocr-import','local-ocr-import-user','local-ocr-import','instagram','parsing',?,?, 'parse-lease',?)`)
      .run(now, now, new Date(Date.now() + 60_000).toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences
      (owner_id,enabled,consent_version,consented_at,updated_at,local_ocr_enabled,local_ocr_consent_version,local_ocr_consented_at)
      VALUES ('local-ocr-import-user',FALSE,NULL,NULL,?,TRUE,?,?)`)
      .run(now, LOCAL_OCR_DISCLOSURE_VERSION, now);
    await createImportRepository(database).accept('local-ocr-import-user', 'local-ocr-import', 'parse-lease', [], [{
      platform: 'instagram', url: 'https://www.instagram.com/p/local-ocr-item/', sourceId: 'local-ocr-item',
      title: 'Saved image', description: '', collection: null, metadata: {}, sourceOrder: 0,
    }]);
    assert.equal((await database.prepare(`SELECT count(*) AS count FROM ai_analysis_jobs
      WHERE owner_id='local-ocr-import-user' AND import_id='local-ocr-import'`).get() as { count: number }).count, 1);
  } finally { await database.close(); }
});
async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>, importPath: string, mediaPath: string) => Promise<void>) {
  const database = await createTestDatabase(); const root = await mkdtemp(join(tmpdir(), 'rembr-imports-')); const assets = join(root, 'assets'); const importPath = join(root, 'imports'); const mediaPath = join(root, 'media');
  const app = createApp(database, { assetDirectory: assets, importDirectory: importPath, mediaDirectory: mediaPath, validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database, importPath, mediaPath); }
  finally { server.closeAllConnections(); server.close(); await database.close(); await rm(root, { recursive: true, force: true }); }
}

async function register(baseUrl: string, email: string, username: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 201);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
  const profile = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  assert.equal(profile.status, 200);
  return cookie;
}

test('Phase 3 import manifests precede chunks, auto-queue parsed items, deduplicate, and clean raw files', async () => {
  await withApi(async (baseUrl, database, importPath) => {
    const owner = await register(baseUrl, 'importer@example.test', 'importer_1');
    const csv = Buffer.from('url,title\nhttps://www.pinterest.com/pin/987654321/,Saved pin\n');
    const created = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'text/csv', size: csv.length, chunks: 2 }] }) });
    assert.equal(created.status, 201);
    const manifest = await created.json() as { importId: string; status: string; files: Array<{ fileId: string }> };
    assert.equal(manifest.status, 'uploading');
    assert.equal((await database.prepare('SELECT count(*) AS count FROM imports').get() as { count: number }).count, 1);
    const fileId = manifest.files[0]!.fileId;
    const first = csv.subarray(0, 15); const second = csv.subarray(15);
    const upload = (index: number, bytes: Buffer) => fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${fileId}/chunks/${index}`, { method: 'PUT', headers: { Cookie: owner, 'Content-Type': 'application/octet-stream' }, body: bytes });
    assert.equal((await upload(0, first)).status, 200);
    assert.equal((await upload(0, first)).status, 200);
    const completedUpload = await upload(1, second);
    assert.equal(completedUpload.status, 202);
    assert.equal((await completedUpload.json() as { status: string }).status, 'staged');
    assert.equal((await upload(1, second)).status, 202);

    const service = createImportService(database, new LocalImportStorage(importPath));
    assert.equal(await service.processNextImport(), manifest.importId);
    const detail = await fetch(`${baseUrl}/api/imports/${manifest.importId}`, { headers: { Cookie: owner } });
    const imported = await detail.json() as { import: { status: string; new_count: number; duplicate_count: number; cleanup_status: string }; entries: Array<{ status: string }> };
    assert.equal(imported.import.status, 'queued');
    assert.equal(imported.import.new_count, 1);
    assert.equal(imported.import.duplicate_count, 0);
    assert.equal(imported.import.cleanup_status, 'complete');
    assert.equal(imported.entries[0]?.status, 'queued');
    assert.equal((await database.prepare('SELECT count(*) AS count FROM processing_jobs').get() as { count: number }).count, 1);
    const progressResponse = await fetch(`${baseUrl}/api/imports/${manifest.importId}/progress`, { headers: { Cookie: owner } });
    assert.equal(progressResponse.status, 200);
    const progress = (await progressResponse.json() as { progress: Record<string, number | string> }).progress;
    assert.deepEqual(progress, {
      importId: manifest.importId,
      status: 'queued',
      total: 1,
      settled: 0,
      saved: 0,
      paused: 0,
      queued: 1,
      processing: 0,
      retryWaiting: 0,
      failed: 0,
      cancelled: 0,
      parseFailed: 0,
    });
    const pausedAt = new Date().toISOString();
    await database.prepare(`INSERT INTO job_pause_states (owner_id,job_id,pause_cause,paused_at)
      SELECT owner_id,id,'operator',? FROM processing_jobs WHERE import_id=?`).run(pausedAt, manifest.importId);
    const pausedProgress = (await (await fetch(`${baseUrl}/api/imports/${manifest.importId}/progress`, { headers: { Cookie: owner } })).json() as { progress: { paused: number; queued: number; settled: number } }).progress;
    assert.deepEqual({ paused: pausedProgress.paused, queued: pausedProgress.queued, settled: pausedProgress.settled }, { paused: 1, queued: 0, settled: 0 });
    await database.prepare('DELETE FROM job_pause_states WHERE job_id=(SELECT id FROM processing_jobs WHERE import_id=?)').run(manifest.importId);
    await database.prepare(`UPDATE processing_jobs SET status='partial' WHERE import_id=?`).run(manifest.importId);
    const settledProgress = (await (await fetch(`${baseUrl}/api/imports/${manifest.importId}/progress`, { headers: { Cookie: owner } })).json() as { progress: { saved: number; settled: number; processing: number } }).progress;
    assert.deepEqual({ saved: settledProgress.saved, settled: settledProgress.settled, processing: settledProgress.processing }, { saved: 1, settled: 1, processing: 0 });
    await database.prepare(`UPDATE processing_jobs SET status='retry_wait' WHERE import_id=?`).run(manifest.importId);
    const retryProgress = (await (await fetch(`${baseUrl}/api/imports/${manifest.importId}/progress`, { headers: { Cookie: owner } })).json() as { progress: { retryWaiting: number; settled: number } }).progress;
    assert.deepEqual({ retryWaiting: retryProgress.retryWaiting, settled: retryProgress.settled }, { retryWaiting: 1, settled: 0 });
    await database.prepare(`UPDATE processing_jobs SET status='processing' WHERE import_id=?`).run(manifest.importId);
    const processingProgress = (await (await fetch(`${baseUrl}/api/imports/${manifest.importId}/progress`, { headers: { Cookie: owner } })).json() as { progress: { processing: number; settled: number } }).progress;
    assert.deepEqual({ processing: processingProgress.processing, settled: processingProgress.settled }, { processing: 1, settled: 0 });
    await database.prepare(`UPDATE processing_jobs SET status='failed' WHERE import_id=?`).run(manifest.importId);
    const failedProgress = (await (await fetch(`${baseUrl}/api/imports/${manifest.importId}/progress`, { headers: { Cookie: owner } })).json() as { progress: { failed: number; settled: number; saved: number } }).progress;
    assert.deepEqual({ failed: failedProgress.failed, settled: failedProgress.settled, saved: failedProgress.saved }, { failed: 1, settled: 1, saved: 0 });
    await database.prepare(`UPDATE processing_jobs SET status='cancelled' WHERE import_id=?`).run(manifest.importId);
    const cancelledProgress = (await (await fetch(`${baseUrl}/api/imports/${manifest.importId}/progress`, { headers: { Cookie: owner } })).json() as { progress: { cancelled: number; settled: number } }).progress;
    assert.deepEqual({ cancelled: cancelledProgress.cancelled, settled: cancelledProgress.settled }, { cancelled: 1, settled: 1 });

    const otherOwner = await register(baseUrl, 'other-importer@example.test', 'other_importer');
    assert.equal((await fetch(`${baseUrl}/api/imports/${manifest.importId}/progress`, { headers: { Cookie: otherOwner } })).status, 404);
    const saved = await fetch(`${baseUrl}/api/items?search=Saved%20pin`, { headers: { Cookie: owner } });
    assert.equal((await saved.json() as { items: Array<{ title: string; kind: string }> }).items[0]?.title, 'Saved pin');

    const duplicate = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'text/csv', size: csv.length, chunks: 1 }] }) });
    const secondManifest = await duplicate.json() as { importId: string; files: Array<{ fileId: string }> };
    assert.equal(duplicate.status, 201);
    const duplicateUpload = await fetch(`${baseUrl}/api/imports/${secondManifest.importId}/files/${secondManifest.files[0]!.fileId}/chunks/0`, { method: 'PUT', headers: { Cookie: owner, 'Content-Type': 'application/octet-stream' }, body: csv });
    assert.equal(duplicateUpload.status, 202);
    assert.equal(await service.processNextImport(), secondManifest.importId);
    const duplicateDetail = await (await fetch(`${baseUrl}/api/imports/${secondManifest.importId}`, { headers: { Cookie: owner } })).json() as { import: { status: string; new_count: number; duplicate_count: number } };
    assert.equal(duplicateDetail.import.status, 'completed');
    const duplicateProgress = (await (await fetch(`${baseUrl}/api/imports/${secondManifest.importId}/progress`, { headers: { Cookie: owner } })).json() as { progress: { total: number; settled: number; parseFailed: number; status: string } }).progress;
    assert.deepEqual({ total: duplicateProgress.total, settled: duplicateProgress.settled, parseFailed: duplicateProgress.parseFailed, status: duplicateProgress.status }, { total: 0, settled: 0, parseFailed: 0, status: 'completed' });
    assert.equal(duplicateDetail.import.new_count, 0);
    assert.equal(duplicateDetail.import.duplicate_count, 1);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM processing_jobs').get() as { count: number }).count, 1);
    const storedFile = await database.prepare('SELECT storage_key FROM import_upload_files WHERE import_id=?').get(manifest.importId) as { storage_key: string };
    await assert.rejects(readFile(join(importPath, `${storedFile.storage_key}.upload`)));
  });
});

test('large import acceptance batches writes and deduplicates repeated URLs across lookup chunks', async () => {
  await withApi(async (baseUrl, database) => {
    await register(baseUrl, 'batch-importer@example.test', 'batch_importer');
    const account = await database.prepare('SELECT id FROM users WHERE email=?').get('batch-importer@example.test') as { id: string } | undefined;
    assert.ok(account);

    const repository = createImportRepository(database);
    const manifest = await repository.create(account.id, 'large-request', 'large-import-key', [{ name: 'saved_posts.json', mime: 'application/json', size: 1, chunks: 1 }]);
    await database.prepare(`UPDATE imports SET status='staged' WHERE owner_id=? AND id=?`).run(account.id, manifest.id);
    await database.prepare(`UPDATE import_upload_files SET state='staged' WHERE owner_id=? AND import_id=?`).run(account.id, manifest.id);
    const lease = await repository.claimForParsing(account.id, manifest.id);
    assert.ok(lease);
    const fileRows = await repository.files(account.id, manifest.id);
    const items: ParsedImportItem[] = Array.from({ length: 501 }, (_unused, index) => {
      const platform: ParsedImportItem['platform'] = index < 300 ? 'instagram' : 'pinterest';
      const sourceIndex = index === 500 ? 300 : index;
      const url = platform === 'instagram'
        ? `https://www.instagram.com/p/BATCH${sourceIndex}/`
        : `https://www.pinterest.com/pin/${sourceIndex + 1}/`;
      return {
        platform, url, sourceId: `BATCH${sourceIndex}`, title: `Saved post ${sourceIndex}`, description: '', collection: 'Saved posts',
        metadata: { sourceFile: 'saved_posts.json', hashtags: [`tag${sourceIndex}`], collections: ['Saved posts'] },
        ...(platform === 'instagram' ? { sourceOrder: index } : {}),
      };
    });

    const result = await repository.accept(account.id, manifest.id, lease, fileRows.map((file) => ({ id: String(file.id), key: String(file.storage_key), name: String(file.original_name) })), items);
    assert.deepEqual(result, { status: 'queued', parsedCount: 501, newCount: 500, duplicateCount: 1, skippedCount: 0, failedCount: 0 });
    assert.equal(Number((await database.prepare('SELECT count(*) AS count FROM saved_items WHERE owner_id=?').get(account.id) as { count: number }).count), 500);
    assert.equal(Number((await database.prepare('SELECT count(*) AS count FROM processing_jobs WHERE import_id=?').get(manifest.id) as { count: number }).count), 500);
    assert.equal(Number((await database.prepare(`SELECT count(*) AS count FROM import_entries WHERE import_id=? AND status='duplicate'`).get(manifest.id) as { count: number }).count), 1);
    assert.equal(Number((await database.prepare('SELECT count(*) AS count FROM item_tags WHERE owner_id=?').get(account.id) as { count: number }).count), 500);
    assert.equal(Number((await database.prepare('SELECT count(*) AS count FROM collection_items WHERE owner_id=?').get(account.id) as { count: number }).count), 500);
  });
});

test('owner can stop import jobs and remove only import-created items while duplicate items remain', async () => {
  await withApi(async (baseUrl, database) => {
    const ownerCookie = await register(baseUrl, 'import-cleanup@example.test', 'import_cleanup');
    const otherCookie = await register(baseUrl, 'import-cleanup-other@example.test', 'import_cleanup_other');
    const account = await database.prepare('SELECT id FROM users WHERE email=?').get('import-cleanup@example.test') as { id: string };
    const now = new Date().toISOString();
    const duplicateId = 'existing-instagram-item';
    await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at,source_platform,source_id,source_metadata_json)
      VALUES (?,?,?,?,?,?,'ready',?,?, 'instagram','EXISTING','{}')`)
      .run(duplicateId, account.id, 'https://www.instagram.com/p/EXISTING/', 'https://www.instagram.com/p/EXISTING/', 'Existing item', '', now, now);
    const repository = createImportRepository(database);
    const manifest = await repository.create(account.id, 'cleanup-request', 'cleanup-import-key-001', [{ name: 'saved_posts.json', mime: 'application/json', size: 1, chunks: 1 }]);
    await database.prepare(`UPDATE imports SET status='parsing',lease_token='cleanup-lease',request_id='cleanup-request' WHERE owner_id=? AND id=?`).run(account.id, manifest.id);
    const files = await repository.files(account.id, manifest.id);
    const parsed = (url: string, sourceId: string, sourceOrder: number): ParsedImportItem => ({
      platform: 'instagram', url, sourceId, title: sourceId, description: '', collection: null,
      metadata: { sourceFile: 'saved_posts.json' }, sourceOrder,
    });
    await repository.accept(account.id, manifest.id, 'cleanup-lease', files.map((file) => ({ id: String(file.id), key: String(file.storage_key), name: String(file.original_name) })), [
      parsed('https://www.instagram.com/p/EXISTING/', 'EXISTING', 0),
      parsed('https://www.instagram.com/reel/ACTIVE/', 'ACTIVE', 1),
      parsed('https://www.instagram.com/reel/NEWITEM/', 'NEWITEM', 2),
      parsed('https://www.instagram.com/reel/QUEUED/', 'QUEUED', 3),
    ]);
    await database.prepare(`UPDATE processing_jobs SET status='completed',updated_at=?
      WHERE import_id=? AND item_id IN (SELECT id FROM saved_items WHERE original_url LIKE '%/NEWITEM/')`).run(now, manifest.id);
    await database.prepare(`UPDATE saved_items SET status='ready' WHERE owner_id=? AND original_url LIKE '%/NEWITEM/'`).run(account.id);
    await database.prepare(`UPDATE import_entries SET status='saved' WHERE owner_id=? AND import_id=? AND source_id='NEWITEM'`).run(account.id, manifest.id);
    let releaseFetch!: (value: { finalUrl: string; contentType: string; html: string }) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const processing = processNextJob(database, async () => {
      signalStarted();
      return await new Promise((resolve) => { releaseFetch = resolve; });
    });
    await started;
    const wrongOwner = await fetch(`${baseUrl}/api/imports/${manifest.id}/jobs/cancel`, { method: 'POST', headers: { Cookie: otherCookie } });
    assert.equal(wrongOwner.status, 404);
    const canceled = await fetch(`${baseUrl}/api/imports/${manifest.id}/jobs/cancel`, { method: 'POST', headers: { Cookie: ownerCookie } });
    assert.equal(canceled.status, 200);
    assert.deepEqual(await canceled.json(), { importId: manifest.id, cancelled: 1, active: 1 });
    assert.equal(Number((await database.prepare(`SELECT count(*) AS count FROM import_entries WHERE import_id=? AND status='cancelled'`).get(manifest.id) as { count: number }).count), 1);
    const prematureDiscard = await fetch(`${baseUrl}/api/imports/${manifest.id}/discard-created-items`, { method: 'POST', headers: { Cookie: ownerCookie } });
    assert.equal(prematureDiscard.status, 409);
    releaseFetch({ finalUrl: 'https://www.instagram.com/reel/ACTIVE/', contentType: 'text/html', html: '<main>canceled capture</main>' });
    assert.ok(await processing);
    assert.equal(Number((await database.prepare(`SELECT count(*) AS count FROM import_entries WHERE import_id=? AND status='cancelled'`).get(manifest.id) as { count: number }).count), 2);
    const discarded = await fetch(`${baseUrl}/api/imports/${manifest.id}/discard-created-items`, { method: 'POST', headers: { Cookie: ownerCookie } });
    assert.equal(discarded.status, 200);
    assert.deepEqual(await discarded.json(), { importId: manifest.id, deleted: 3, duplicatesPreserved: true });
    assert.equal(Number((await database.prepare('SELECT count(*) AS count FROM saved_items WHERE owner_id=? AND id=?').get(account.id, duplicateId) as { count: number }).count), 1);
    assert.equal(Number((await database.prepare('SELECT count(*) AS count FROM saved_items WHERE owner_id=? AND original_url=?').get(account.id, 'https://www.instagram.com/reel/NEWITEM/') as { count: number }).count), 0);
    assert.equal(Number((await database.prepare('SELECT count(*) AS count FROM saved_items WHERE owner_id=? AND original_url=?').get(account.id, 'https://www.instagram.com/reel/ACTIVE/') as { count: number }).count), 0);
    assert.equal(Number((await database.prepare('SELECT count(*) AS count FROM saved_items WHERE owner_id=? AND original_url=?').get(account.id, 'https://www.instagram.com/reel/QUEUED/') as { count: number }).count), 0);
    const hostileDiscard = await fetch(`${baseUrl}/api/imports/${manifest.id}/discard-created-items`, { method: 'POST', headers: { Cookie: otherCookie } });
    assert.equal(hostileDiscard.status, 404);
  });
});

test('Phase 3 import status and chunk writes are owner scoped and bounded', async () => {
  await withApi(async (baseUrl) => {
    const owner = await register(baseUrl, 'owner@example.test', 'owner_01');
    const other = await register(baseUrl, 'other@example.test', 'other_01');
    const rejected = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'image/png', size: 10, chunks: 1 }] }) });
    assert.equal(rejected.status, 400);
    const bytes = Buffer.from('url,title\nhttps://www.pinterest.com/pin/123456/,pin\n');
    const created = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'text/csv', size: bytes.length, chunks: 2 }] }) });
    const manifest = await created.json() as { importId: string; files: Array<{ fileId: string }> };
    assert.equal((await fetch(`${baseUrl}/api/imports/${manifest.importId}`, { headers: { Cookie: other } })).status, 404);
    const wrong = await fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${manifest.files[0]!.fileId}/chunks/0`, { method: 'PUT', headers: { Cookie: other, 'Content-Type': 'application/octet-stream' }, body: bytes });
    assert.equal(wrong.status, 404);
    const split = 20; const firstPart = bytes.subarray(0, split); const lastPart = bytes.subarray(split);
    assert.equal((await fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${manifest.files[0]!.fileId}/chunks/0`, { method: 'PUT', headers: { Cookie: owner, 'Content-Type': 'application/octet-stream' }, body: firstPart })).status, 200);
    const truncated = await fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${manifest.files[0]!.fileId}/chunks/1`, { method: 'PUT', headers: { Cookie: owner, 'Content-Type': 'application/octet-stream' }, body: lastPart.subarray(1) });
    assert.equal(truncated.status, 400);
    const retry = await fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${manifest.files[0]!.fileId}/chunks/1`, { method: 'PUT', headers: { Cookie: owner, 'Content-Type': 'application/octet-stream' }, body: lastPart });
    assert.equal(retry.status, 202);
  });
});

test('import creation is idempotent for matching files and rejects key reuse with changed files', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'idempotent@example.test', 'idempotent_1');
    const headers = { Cookie: owner, 'Content-Type': 'application/json', 'Idempotency-Key': 'retry-key-0000000001' };
    const body = JSON.stringify({ files: [{ name: 'pins.csv', mime: 'text/csv', size: 20, chunks: 1 }] });
    const first = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers, body });
    const firstImport = await first.json() as { importId: string };
    const second = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers, body });
    const secondImport = await second.json() as { importId: string };
    assert.equal(second.status, 201);
    assert.equal(secondImport.importId, firstImport.importId);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM imports').get() as { count: number }).count, 1);
    const conflict = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers, body: JSON.stringify({ files: [{ name: 'different.csv', mime: 'text/csv', size: 20, chunks: 1 }] }) });
    assert.equal(conflict.status, 409);
  });
});

test('owners can cancel an incomplete import and remove staged private bytes', async () => {
  await withApi(async (baseUrl, database, importPath) => {
    const owner = await register(baseUrl, 'cancel-import@example.test', 'cancelimp_1');
    const bytes = Buffer.from('url,title\nhttps://www.pinterest.com/pin/7654321/,Pin\n');
    const created = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'text/csv', size: bytes.length, chunks: 2 }] }) });
    const manifest = await created.json() as { importId: string; files: Array<{ fileId: string }> };
    const partial = bytes.subarray(0, 12);
    assert.equal((await fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${manifest.files[0]!.fileId}/chunks/0`, { method: 'PUT', headers: { Cookie: owner, 'Content-Type': 'application/octet-stream' }, body: partial })).status, 200);
    const canceled = await fetch(`${baseUrl}/api/imports/${manifest.importId}/cancel`, { method: 'POST', headers: { Cookie: owner } });
    assert.equal(canceled.status, 200);
    const state = await database.prepare('SELECT status,cleanup_status FROM imports WHERE id=?').get(manifest.importId) as { status: string; cleanup_status: string };
    assert.deepEqual(state, { status: 'failed', cleanup_status: 'complete' });
    const key = await database.prepare('SELECT storage_key FROM import_upload_files WHERE import_id=?').get(manifest.importId) as { storage_key: string };
    await assert.rejects(readFile(join(importPath, `${key.storage_key}.000.part`)));
  });
});

test('startup cleanup recovers terminal imports left pending by a worker crash', async () => {
  await withApi(async (baseUrl, database, importPath) => {
    const owner = await register(baseUrl, 'cleanup-recovery@example.test', 'cleanrec_1');
    const bytes = Buffer.from('url,title\nhttps://www.pinterest.com/pin/1234567/,Pin\n'); const first = bytes.subarray(0, 14);
    const created = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'text/csv', size: bytes.length, chunks: 2 }] }) });
    const manifest = await created.json() as { importId: string; files: Array<{ fileId: string }> };
    assert.equal((await fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${manifest.files[0]!.fileId}/chunks/0`, { method: 'PUT', headers: { Cookie: owner, 'Content-Type': 'application/octet-stream' }, body: first })).status, 200);
    const key = await database.prepare('SELECT storage_key FROM import_upload_files WHERE import_id=?').get(manifest.importId) as { storage_key: string };
    await database.prepare(`UPDATE imports SET status='failed',cleanup_status='pending' WHERE id=?`).run(manifest.importId);
    await database.prepare(`UPDATE import_upload_files SET state='failed' WHERE import_id=?`).run(manifest.importId);
    const service = createImportService(database, new LocalImportStorage(importPath));
    assert.equal(await service.retryCleanup(), 1);
    assert.equal((await database.prepare('SELECT cleanup_status FROM imports WHERE id=?').get(manifest.importId) as { cleanup_status: string }).cleanup_status, 'complete');
    await assert.rejects(readFile(join(importPath, `${key.storage_key}.000.part`)));
  });
});

test('partial parser failures remain visible after queued work succeeds and exhausted leases close imports', async () => {
  await withApi(async (baseUrl, database, importPath) => {
    const owner = await register(baseUrl, 'partial-import@example.test', 'partial_01');
    const valid = Buffer.from('url,title\nhttps://www.pinterest.com/pin/7654321/,Valid pin\n');
    const invalid = Buffer.from('url,title\nhttps://example.com/not-a-pin,Unsupported row\n');
    const files = [valid, invalid].map((bytes, index) => ({ name: `pins-${index}.csv`, mime: 'text/csv', size: bytes.length, chunks: 1 }));
    const created = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) });
    const manifest = await created.json() as { importId: string; files: Array<{ fileId: string }> };
    assert.equal(created.status, 201);
    for (let index = 0; index < files.length; index += 1) {
      const response = await fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${manifest.files[index]!.fileId}/chunks/0`, { method: 'PUT', headers: { Cookie: owner, 'Content-Type': 'application/octet-stream' }, body: [valid, invalid][index]! });
      assert.equal(response.status, index === files.length - 1 ? 202 : 200);
    }
    const service = createImportService(database, new LocalImportStorage(importPath));
    assert.equal(await service.processNextImport(), manifest.importId);
    assert.equal((await database.prepare('SELECT status FROM imports WHERE id=?').get(manifest.importId) as { status: string }).status, 'partial');
    assert.ok(await processNextJob(database, async () => ({ finalUrl: 'https://www.pinterest.com/pin/7654321/', contentType: 'text/html', html: '<main>saved pin text</main>' })));
    assert.equal((await database.prepare('SELECT status FROM imports WHERE id=?').get(manifest.importId) as { status: string }).status, 'partial');
    assert.equal((await database.prepare(`SELECT status FROM import_entries WHERE import_id=? AND source_url='https://www.pinterest.com/pin/7654321/'`).get(manifest.importId) as { status: string }).status, 'saved');

    const job = await database.prepare('SELECT id,item_id FROM processing_jobs WHERE import_id=?').get(manifest.importId) as { id: string; item_id: string };
    const expired = new Date(Date.now() - 60_000).toISOString();
    await database.prepare(`UPDATE processing_jobs SET status='processing',attempts=max_attempts,lease_token='expired',lease_expires_at=?,updated_at=? WHERE id=?`).run(expired, expired, job.id);
    await database.prepare(`UPDATE saved_items SET status='processing' WHERE id=?`).run(job.item_id);
    await database.prepare(`UPDATE imports SET status='processing' WHERE id=?`).run(manifest.importId);
    assert.equal(await processNextJob(database), null);
    assert.equal((await database.prepare('SELECT status FROM imports WHERE id=?').get(manifest.importId) as { status: string }).status, 'partial');
  });
});

test('owners can cancel queued work and foreign users cannot read job state', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'cancel-owner@example.test', 'cancel_01');
    const other = await register(baseUrl, 'cancel-other@example.test', 'cancel_02');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/cancel-me' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    const hidden = await fetch(`${baseUrl}/api/items/${item.id}/job`, { headers: { Cookie: other } });
    assert.equal(hidden.status, 404);
    const cancelled = await fetch(`${baseUrl}/api/items/${item.id}/job/cancel`, { method: 'POST', headers: { Cookie: owner } });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json() as { job: { status: string } }).job.status, 'cancelled');
    const details = await fetch(`${baseUrl}/api/items/${item.id}`, { headers: { Cookie: owner } });
    assert.equal((await details.json() as { item: { status: string } }).item.status, 'cancelled');
    assert.equal(await processNextJob(database, async () => ({ finalUrl: 'https://example.com/cancel-me', contentType: 'text/html', html: '<main>must not run</main>' })), null);
  });
});

test('worker saves safe image media privately, scopes reads, and keeps the last good file on reprocess failure', async () => {
  await withApi(async (baseUrl, database, _importPath, mediaPath) => {
    const owner = await register(baseUrl, 'media-owner@example.test', 'mediaown_1');
    const other = await register(baseUrl, 'media-other@example.test', 'mediaoth_1');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/media' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const page = async () => ({ finalUrl: 'https://example.com/media', contentType: 'text/html', html: '<meta property="og:image" content="/cover.png"><main>Readable article</main>' });
    const storage = new LocalMediaStorage(mediaPath);
    assert.ok(await processNextJob(database, page, { storage, fetchMedia: async () => ({ finalUrl: 'https://cdn.example.com/cover.png', mime: 'image/png', bytes: image }) }));
    const details = await fetch(`${baseUrl}/api/items/${item.id}`, { headers: { Cookie: owner } });
    const media = (await details.json() as { item: { media: Array<{ id: string; url: string | null; status: string }> } }).item.media;
    assert.equal(media[0]?.status, 'ready');
    assert.ok(media[0]?.url);
    assert.equal((await fetch(`${baseUrl}${media[0]!.url}`, { headers: { Cookie: other } })).status, 404);
    const saved = await fetch(`${baseUrl}${media[0]!.url}`, { headers: { Cookie: owner } });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await saved.arrayBuffer()), image);

    assert.equal((await fetch(`${baseUrl}/api/items/${item.id}/job/reprocess`, { method: 'POST', headers: { Cookie: owner } })).status, 200);
    assert.ok(await processNextJob(database, page, { storage, fetchMedia: async () => { throw new CaptureError('media_unavailable', 'Unavailable'); } }));
    assert.equal((await database.prepare('SELECT status FROM processing_jobs WHERE item_id=?').get(item.id) as { status: string }).status, 'partial');
    assert.equal((await database.prepare(`SELECT count(*) AS count FROM media_artifacts WHERE owner_id=(SELECT id FROM users WHERE email='media-owner@example.test') AND item_id=? AND status='ready' AND active=1`).get(item.id) as { count: number }).count, 1);
    const storageKey = await database.prepare('SELECT storage_key FROM media_artifacts WHERE item_id=? AND status=\'ready\' AND active=1').get(item.id) as { storage_key: string };
    assert.equal((await fetch(`${baseUrl}/api/items/${item.id}`, { method: 'DELETE', headers: { Cookie: owner } })).status, 204);
    await assert.rejects(readFile(join(mediaPath, storageKey.storage_key)));
    assert.equal((await database.prepare('SELECT count(*) AS count FROM media_cleanup_queue').get() as { count: number }).count, 0);
  });
});

test('worker stores supported audio and video media privately and serves the declared media types', async () => {
  await withApi(async (baseUrl, database, _importPath, mediaPath) => {
    const owner = await register(baseUrl, 'av-media-owner@example.test', 'avmedia_1');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/av-media' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    const video = Buffer.alloc(16); video.writeUInt32BE(16, 0); video.write('ftyp', 4, 'ascii'); video.write('isom', 8, 'ascii');
    const audio = Buffer.from('ID3\x04\x00\x00', 'binary');
    const page = async () => ({ finalUrl: 'https://example.com/av-media', contentType: 'text/html', html: '<video src="/movie.mp4"></video><audio src="/voice.mp3"></audio><main>Readable media page</main>' });
    const storage = new LocalMediaStorage(mediaPath);
    assert.ok(await processNextJob(database, page, { storage, fetchMedia: async (url) => url.endsWith('.mp4')
      ? { finalUrl: 'https://cdn.example.com/movie.mp4', mime: 'video/mp4', bytes: video }
      : { finalUrl: 'https://cdn.example.com/voice.mp3', mime: 'audio/mpeg', bytes: audio } }));
    const details = await fetch(`${baseUrl}/api/items/${item.id}`, { headers: { Cookie: owner } });
    const media = (await details.json() as { item: { media: Array<{ mime: string; url: string; status: string }> } }).item.media;
    assert.deepEqual(
      media.map((asset) => [asset.mime, asset.status]).sort(([left], [right]) => String(left).localeCompare(String(right))),
      [['audio/mpeg', 'ready'], ['video/mp4', 'ready']],
    );
    for (const asset of media) {
      const response = await fetch(`${baseUrl}${asset.url}`, { headers: { Cookie: owner } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), asset.mime);
    }
  });
});

test('Instagram media is not copied into persistent Rembr media storage during normal page processing', async () => {
  await withApi(async (baseUrl, database, _importPath, mediaPath) => {
    const owner = await register(baseUrl, 'instagram-temp-media@example.test', 'igtempmedia');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://www.instagram.com/p/public-post/' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    await database.prepare("UPDATE saved_items SET source_platform='instagram' WHERE id=?").run(item.id);
    let mediaFetches = 0;
    assert.ok(await processNextJob(database, async () => ({ finalUrl: 'https://www.instagram.com/p/public-post/', contentType: 'text/html', html: '<main>Public post</main><img src="https://cdn.example/image.jpg">' }), {
      storage: new LocalMediaStorage(mediaPath),
      fetchMedia: async () => { mediaFetches += 1; return { finalUrl: 'https://cdn.example/image.jpg', mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) }; },
    }));
    assert.equal(mediaFetches, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM media_artifacts WHERE item_id=?').get(item.id) as { count: number }).count, 0);
  });
});

test('reprocess keeps the last good artifact and eligible failure retry creates a new generation', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'reprocess@example.test', 'reprocess_1');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/reprocess' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    assert.ok(await processNextJob(database, async () => ({ finalUrl: 'https://example.com/reprocess', contentType: 'text/html', html: '<main>last good version</main>' })));
    const artifact = await database.prepare('SELECT text_content FROM extracted_artifacts WHERE item_id=?').get(item.id) as { text_content: string };
    assert.match(artifact.text_content, /last good version/);
    const reprocess = await fetch(`${baseUrl}/api/items/${item.id}/job/reprocess`, { method: 'POST', headers: { Cookie: owner } });
    assert.equal(reprocess.status, 200);
    assert.equal((await database.prepare('SELECT text_content FROM extracted_artifacts WHERE item_id=?').get(item.id) as { text_content: string }).text_content, artifact.text_content);
    assert.ok(await processNextJob(database, async () => { throw new CaptureError('page_unavailable', 'Temporary failure'); }));
    await database.prepare(`UPDATE processing_jobs SET status='failed',attempts=max_attempts,error_code='fetch_failed' WHERE item_id=?`).run(item.id);
    const retry = await fetch(`${baseUrl}/api/items/${item.id}/job/retry`, { method: 'POST', headers: { Cookie: owner } });
    assert.equal(retry.status, 200);
    const job = (await retry.json() as { job: { generation: number; status: string } }).job;
    assert.equal(job.generation, 3);
    assert.equal(job.status, 'queued');
    assert.equal((await database.prepare('SELECT count(*) AS count FROM job_attempts WHERE job_id=(SELECT id FROM processing_jobs WHERE item_id=?)').get(item.id) as { count: number }).count, 2);
  });
});

test('cancellation during a running fetch fences the final artifact write', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'running-cancel@example.test', 'run_cancel');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/running-cancel' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    let resolveFetch!: (value: { finalUrl: string; contentType: string; html: string }) => void;
    const processing = processNextJob(database, () => new Promise((resolve) => { resolveFetch = resolve; }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cancellation = await fetch(`${baseUrl}/api/items/${item.id}/job/cancel`, { method: 'POST', headers: { Cookie: owner } });
    assert.equal((await cancellation.json() as { job: { status: string } }).job.status, 'cancel_requested');
    resolveFetch({ finalUrl: 'https://example.com/running-cancel', contentType: 'text/html', html: '<main>cancelled content</main>' });
    await processing;
    assert.equal((await database.prepare('SELECT count(*) AS count FROM extracted_artifacts WHERE item_id=?').get(item.id) as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT status FROM processing_jobs WHERE item_id=?').get(item.id) as { status: string }).status, 'cancelled');
  });
});

test('capture media intent fences deletion and retries cleanup when freeze wins during object write', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'media-fenced@example.test', 'media_fenced');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/media-fenced' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    const account = await database.prepare('SELECT owner_id FROM saved_items WHERE id=?').get(item.id) as { owner_id: string };
    const stored = new Set<string>(); const removed: string[] = []; let removeAttempts = 0;
    let signalWriteStarted!: () => void; let releaseWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => { signalWriteStarted = resolve; });
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const storage = {
      async initialize() {},
      async write(_bytes: Buffer, _mime: string, key?: string) {
        signalWriteStarted();
        await writeGate;
        stored.add(String(key));
        return { key: String(key), mime: 'image/png' as const, bytes: 8, sha256: 'a'.repeat(64) };
      },
      async read() { throw new Error('not used'); },
      async remove(key: string) {
        removed.push(key); removeAttempts += 1;
        if (removeAttempts === 1) throw new Error('temporary storage failure');
        stored.delete(key);
      },
      async removeUnknown() {},
    };
    const image = Buffer.from([137,80,78,71,13,10,26,10]);
    const processing = processNextJob(database,
      async () => ({ finalUrl: 'https://example.com/media-fenced', contentType: 'text/html', html: '<img src="https://cdn.example/image.png">' }),
      { storage, fetchMedia: async (url) => ({ finalUrl: url, mime: 'image/png', bytes: image }) });
    await writeStarted;
    const lease = await database.prepare(`SELECT count(*) AS count FROM account_owner_work_leases
      WHERE owner_id=? AND work_type='media_upload' AND expires_at>?`).get(account.owner_id, new Date().toISOString()) as { count: number };
    assert.equal(Number(lease.count), 1);
    const intent = await database.prepare(`SELECT storage_key,status,error_code,active FROM media_artifacts WHERE item_id=?`)
      .get(item.id) as { storage_key: string; status: string; error_code: string; active: number };
    assert.match(intent.storage_key, /^[0-9a-f-]{36}\.media$/i);
    assert.deepEqual({ status: intent.status, error_code: intent.error_code, active: Number(intent.active) },
      { status: 'failed', error_code: 'media_write_pending', active: 1 });
    await database.transaction(async () => {
      await database.prepare("UPDATE users SET account_status='disabled' WHERE id=?").run(account.owner_id);
      await database.prepare(`UPDATE processing_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL
        WHERE item_id=? AND owner_id=?`).run(item.id, account.owner_id);
    })();
    assert.equal((await database.prepare('SELECT count(*) AS count FROM media_artifacts WHERE owner_id=? AND storage_key=?')
      .get(account.owner_id, intent.storage_key) as { count: number }).count, 1,
      'deletion can enumerate the planned object key before storage.write completes');
    releaseWrite();
    assert.equal(await processing, null);
    assert.deepEqual(removed, [intent.storage_key, intent.storage_key]);
    assert.equal(stored.size, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM media_artifacts WHERE item_id=?').get(item.id) as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM media_cleanup_queue').get() as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM account_owner_work_leases WHERE owner_id=?')
      .get(account.owner_id) as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT status FROM processing_jobs WHERE item_id=?').get(item.id) as { status: string }).status, 'cancelled');
  });
});

test('capture worker does not claim jobs for disabled accounts', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'disabled-worker@example.test', 'disabled_worker');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/disabled-worker' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    await database.prepare("UPDATE users SET account_status='disabled' WHERE email='disabled-worker@example.test'").run();
    assert.equal(await claimNextJob(database), undefined);
    assert.equal((await database.prepare('SELECT status FROM processing_jobs WHERE item_id=?').get(item.id) as { status: string }).status, 'queued');
  });
});

test('import parser claim and acceptance stop when the owner is disabled', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'disabled-import@example.test', 'disabled_import');
    const bytes = Buffer.from('url,title\nhttps://www.pinterest.com/pin/1234567/,Pin\n');
    const created = await fetch(`${baseUrl}/api/imports`, {
      method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'text/csv', size: bytes.length, chunks: 1 }] }),
    });
    assert.equal(created.status, 201);
    const manifest = await created.json() as { importId: string };
    const row = await database.prepare('SELECT owner_id FROM imports WHERE id=?').get(manifest.importId) as { owner_id: string };
    await database.prepare("UPDATE imports SET status='staged' WHERE id=?").run(manifest.importId);
    await database.prepare("UPDATE users SET account_status='disabled' WHERE id=?").run(row.owner_id);

    const repository = createImportRepository(database);
    assert.equal(await repository.claimForParsing(row.owner_id, manifest.importId), null);
    await database.prepare("UPDATE imports SET status='parsing',lease_token='stale-lease' WHERE id=?").run(manifest.importId);
    await assert.rejects(repository.accept(row.owner_id, manifest.importId, 'stale-lease', [], []), /account_inactive/);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM import_entries WHERE import_id=?').get(manifest.importId) as { count: number }).count, 0);
  });
});
