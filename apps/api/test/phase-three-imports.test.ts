import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { createImportService } from '../src/imports/service.js';
import { LocalImportStorage } from '../src/imports/storage.js';
import { processNextJob } from '../src/worker/process-job.js';
import { CaptureError } from '../src/items/safe-fetch.js';

const password = 'correct-horse-battery-staple';
async function withApi(run: (baseUrl: string, database: ReturnType<typeof createTestDatabase>, importPath: string) => Promise<void>) {
  const database = createTestDatabase(); const root = await mkdtemp(join(tmpdir(), 'rembr-imports-')); const assets = join(root, 'assets'); const importPath = join(root, 'imports');
  const app = createApp(database, { assetDirectory: assets, importDirectory: importPath, validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database, importPath); }
  finally { server.closeAllConnections(); server.close(); database.close(); await rm(root, { recursive: true, force: true }); }
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
    assert.equal((database.prepare('SELECT count(*) AS count FROM imports').get() as { count: number }).count, 1);
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
    assert.equal((database.prepare('SELECT count(*) AS count FROM processing_jobs').get() as { count: number }).count, 1);
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
    assert.equal(duplicateDetail.import.new_count, 0);
    assert.equal(duplicateDetail.import.duplicate_count, 1);
    assert.equal((database.prepare('SELECT count(*) AS count FROM processing_jobs').get() as { count: number }).count, 1);
    const storedFile = database.prepare('SELECT storage_key FROM import_upload_files WHERE import_id=?').get(manifest.importId) as { storage_key: string };
    await assert.rejects(readFile(join(importPath, `${storedFile.storage_key}.upload`)));
  });
});

test('Phase 3 import status and chunk writes are owner scoped and bounded', async () => {
  await withApi(async (baseUrl) => {
    const owner = await register(baseUrl, 'owner@example.test', 'owner_01');
    const other = await register(baseUrl, 'other@example.test', 'other_01');
    const rejected = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'image/png', size: 10, chunks: 1 }] }) });
    assert.equal(rejected.status, 400);
    const bytes = Buffer.from('url,title\nhttps://www.pinterest.com/pin/123456/,pin\n');
    const created = await fetch(`${baseUrl}/api/imports`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'pins.csv', mime: 'text/csv', size: bytes.length, chunks: 1 }] }) });
    const manifest = await created.json() as { importId: string; files: Array<{ fileId: string }> };
    assert.equal((await fetch(`${baseUrl}/api/imports/${manifest.importId}`, { headers: { Cookie: other } })).status, 404);
    const wrong = await fetch(`${baseUrl}/api/imports/${manifest.importId}/files/${manifest.files[0]!.fileId}/chunks/0`, { method: 'PUT', headers: { Cookie: other, 'Content-Type': 'application/octet-stream' }, body: bytes });
    assert.equal(wrong.status, 404);
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

test('reprocess keeps the last good artifact and eligible failure retry creates a new generation', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'reprocess@example.test', 'reprocess_1');
    const capture = await fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/reprocess' }) });
    const item = (await capture.json() as { item: { id: string } }).item;
    assert.ok(await processNextJob(database, async () => ({ finalUrl: 'https://example.com/reprocess', contentType: 'text/html', html: '<main>last good version</main>' })));
    const artifact = database.prepare('SELECT text_content FROM extracted_artifacts WHERE item_id=?').get(item.id) as { text_content: string };
    assert.match(artifact.text_content, /last good version/);
    const reprocess = await fetch(`${baseUrl}/api/items/${item.id}/job/reprocess`, { method: 'POST', headers: { Cookie: owner } });
    assert.equal(reprocess.status, 200);
    assert.equal((database.prepare('SELECT text_content FROM extracted_artifacts WHERE item_id=?').get(item.id) as { text_content: string }).text_content, artifact.text_content);
    assert.ok(await processNextJob(database, async () => { throw new CaptureError('page_unavailable', 'Temporary failure'); }));
    database.prepare(`UPDATE processing_jobs SET status='failed',attempts=max_attempts,error_code='fetch_failed' WHERE item_id=?`).run(item.id);
    const retry = await fetch(`${baseUrl}/api/items/${item.id}/job/retry`, { method: 'POST', headers: { Cookie: owner } });
    assert.equal(retry.status, 200);
    const job = (await retry.json() as { job: { generation: number; status: string } }).job;
    assert.equal(job.generation, 3);
    assert.equal(job.status, 'queued');
    assert.equal((database.prepare('SELECT count(*) AS count FROM job_attempts WHERE job_id=(SELECT id FROM processing_jobs WHERE item_id=?)').get(item.id) as { count: number }).count, 2);
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
    assert.equal((database.prepare('SELECT count(*) AS count FROM extracted_artifacts WHERE item_id=?').get(item.id) as { count: number }).count, 0);
    assert.equal((database.prepare('SELECT status FROM processing_jobs WHERE item_id=?').get(item.id) as { status: string }).status, 'cancelled');
  });
});
