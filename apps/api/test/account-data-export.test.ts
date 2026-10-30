import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { test } from 'node:test';
import { createTestDatabase } from '../src/db/database.js';
import {
  createAccountDataExportService,
  type OwnerScopedPrivateFileSource,
  type PrivateExportArtifactStorage,
  type PrivateExportFileReference,
} from '../src/account/data-export-service.js';
import { withOwnerWorkLease } from '../src/account/owner-lifecycle.js';

const start = new Date('2026-10-30T12:00:00.000Z');

async function seedUser(database: Awaited<ReturnType<typeof createTestDatabase>>, id: string, email: string) {
  await database.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)')
    .run(id, email, `secret-password-hash-${id}`, start.toISOString());
}

async function seedItem(database: Awaited<ReturnType<typeof createTestDatabase>>, id: string, ownerId: string, title: string) {
  await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, ownerId, `https://${id}.example/`, `https://${id}.example/`, title, 'ready', start.toISOString(), start.toISOString());
}

function fakeStorage(): PrivateExportArtifactStorage & { artifacts: Map<string, Buffer>; removals: string[] } {
  const artifacts = new Map<string, Buffer>();
  const removals: string[] = [];
  return {
    artifacts,
    removals,
    keyForAttempt(ownerId, exportId, leaseToken) {
      return `${ownerId}/${exportId}/${leaseToken}.zip`;
    },
    async write(ownerId, key, bytes) {
      if (!key.startsWith(`${ownerId}/`)) throw new Error('wrong_owner');
      artifacts.set(key, Buffer.from(bytes));
    },
    async read(ownerId, key) {
      if (!key.startsWith(`${ownerId}/`)) throw new Error('wrong_owner');
      const bytes = artifacts.get(key);
      if (!bytes) throw new Error('missing_artifact');
      return Buffer.from(bytes);
    },
    async remove(ownerId, key) {
      if (!key.startsWith(`${ownerId}/`)) throw new Error('wrong_owner');
      removals.push(key);
      artifacts.delete(key);
    },
  };
}

function fakeFileSource(initial: PrivateExportFileReference[] = []) {
  const calls: string[] = [];
  let references = initial;
  const source: OwnerScopedPrivateFileSource = {
    async listForOwner(ownerId, limit) {
      calls.push(`list:${ownerId}`);
      return references.filter((reference) => reference.ownerId === ownerId).slice(0, limit);
    },
    async readForOwner(ownerId, reference) {
      calls.push(`read:${ownerId}:${reference.key}`);
      if (reference.ownerId !== ownerId) throw new Error('wrong_owner');
      return Buffer.from('private-file');
    },
  };
  return { source, calls, setReferences(value: PrivateExportFileReference[]) { references = value; } };
}

function fileReference(ownerId: string, key: string, byteSize = Buffer.byteLength('private-file')): PrivateExportFileReference {
  return { ownerId, kind: 'asset', key, fileName: '../private.txt', contentType: 'text/plain', byteSize };
}

test('personal export packages only the requested owner and excludes password and session credentials', async () => {
  const database = await createTestDatabase();
  const storage = fakeStorage();
  const files = fakeFileSource([
    fileReference('owner-a', 'asset-a'),
    { ...fileReference('owner-a', 'import-a'), kind: 'import' },
    { ...fileReference('owner-a', 'media-a'), kind: 'media' },
    fileReference('owner-b', 'asset-b'),
  ]);
  try {
    await seedUser(database, 'owner-a', 'a@example.test');
    await seedUser(database, 'owner-b', 'b@example.test');
    await seedUser(database, 'admin-granter', 'granting-admin@example.test');
    await seedItem(database, 'item-a', 'owner-a', 'A only');
    await seedItem(database, 'item-b', 'owner-b', 'B private');
    await database.prepare(`INSERT INTO imports
      (id,owner_id,request_id,idempotency_key,source,status,lease_token,lease_expires_at,created_at,updated_at)
      VALUES ('export-import','owner-a','export-request','export-idempotency','instagram','processing','private-import-lease-token','2099-01-01T00:00:00.000Z',?,?)`)
      .run(start.toISOString(), start.toISOString());
    await database.prepare(`INSERT INTO processing_jobs
      (id,owner_id,item_id,import_id,correlation_id,status,attempts,available_at,lease_token,lease_expires_at,heartbeat_at,created_at,updated_at)
      VALUES ('export-processing-job','owner-a','item-a','export-import','export-correlation','processing',1,?,'private-job-lease-token',?,? ,?,?)`)
      .run(start.toISOString(), '2099-01-02T00:00:00.000Z', '2099-01-03T00:00:00.000Z', start.toISOString(), start.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_jobs
      (id,owner_id,import_id,item_id,status,available_at,lease_token,lease_expires_at,created_at,updated_at)
      VALUES ('export-ai-job','owner-a','export-import','item-a','processing',?,'private-ai-lease-token','2099-01-04T00:00:00.000Z',?,?)`)
      .run(start.toISOString(), start.toISOString(), start.toISOString());
    await database.prepare(`INSERT INTO visual_item_embeddings(owner_id,item_id,model,content_hash,embedding,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).run('owner-a', 'item-a', 'local-visual-test', 'd'.repeat(64), [0.125, 0.875], start.toISOString(), start.toISOString());
    await database.prepare('INSERT INTO admin_roles (user_id,role,granted_by,created_at) VALUES (?,?,?,?)')
      .run('owner-a', 'admin', 'admin-granter', start.toISOString());
    await database.prepare(`INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)`)
      .run('session-a', 'owner-a', 'a'.repeat(64), '2027-01-01T00:00:00.000Z', start.toISOString());
    await database.prepare(`INSERT INTO account_deletion_requests
      (id,owner_id,owner_hash,status,export_confirmed,requested_at,available_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run('deletion-a', 'owner-a', 'c'.repeat(64), 'pending_approval', true,
      start.toISOString(), start.toISOString(), start.toISOString(), start.toISOString());
    await database.prepare(`INSERT INTO account_deletion_steps
      (id,request_id,step_key,status,attempt_count,updated_at,progress_cursor)
      VALUES (?,?,?,?,?,?,?)`).run('deletion-step-a', 'deletion-a', 'remove_storage', 'completed', 1,
      start.toISOString(), JSON.stringify({ assets: 'secret-storage-key-marker' }));

    const service = createAccountDataExportService(database, storage, files.source);
    const ownerExport = await service.request('owner-a', true, start);
    const otherExport = await service.request('owner-b', false, new Date(start.getTime() + 1));
    assert.equal(await service.getStatus('owner-b', ownerExport.id), null);
    assert.equal(await service.getDownload('owner-b', ownerExport.id), null);

    const claim = await service.claimNext(start);
    assert.equal(claim?.ownerId, 'owner-a');
    const ready = await service.processClaim(claim!, start);
    assert.equal(ready?.id, ownerExport.id);
    assert.equal(ready?.status, 'ready');
    assert.equal(await service.getStatus('owner-b', otherExport.id).then((status) => status?.status), 'queued');
    assert.deepEqual(files.calls, ['list:owner-a', 'read:owner-a:asset-a', 'read:owner-a:import-a', 'read:owner-a:media-a']);

    const download = await service.getDownload('owner-a', ownerExport.id, new Date(start.getTime() + 2));
    assert.ok(download);
    assert.equal(download.contentType, 'application/zip');
    const archive = await JSZip.loadAsync(download.bytes);
    const library = await archive.file('data/saved_library.json')!.async('string');
    const account = await archive.file('data/account.json')!.async('string');
    const privacyRequests = await archive.file('data/privacy_requests.json')!.async('string');
    const productActivity = await archive.file('data/product_activity.json')!.async('string');
    const importProcessing = await archive.file('data/imports_and_processing.json')!.async('string');
    const manifest = await archive.file('manifest.json')!.async('string');
    assert.match(library, /A only/);
    assert.doesNotMatch(library, /B private/);
    assert.match(account, /a@example\.test/);
    assert.doesNotMatch(account, /secret-password-hash/);
    assert.doesNotMatch(account, /token_hash/);
    assert.doesNotMatch(manifest, /secret-password-hash|a{64}/);
    assert.match(account, /2027-01-01T00:00:00.000Z/);
    assert.match(account, /"role": "admin"/);
    assert.doesNotMatch(account, /admin-granter|granted_by|user_id/);
    assert.match(privacyRequests, /pending_approval/);
    assert.match(productActivity, /data_export_requested/);
    assert.doesNotMatch(productActivity, /owner-b|b@example\.test/);
    assert.doesNotMatch(importProcessing, /private-import-lease-token|private-job-lease-token|private-ai-lease-token/);
    assert.doesNotMatch(importProcessing, /lease_expires_at|heartbeat_at|2099-01-0[1-4]T00:00:00\.000Z/);
    assert.doesNotMatch(privacyRequests, /secret-storage-key-marker|progress_cursor/);
    assert.match(manifest, /Session credentials and token hashes are excluded/);
    assert.match(manifest, /local visual vectors are operational similarity indexes and are excluded/);
    assert.doesNotMatch(manifest + library, /local-visual-test|0\.125|0\.875/);
    assert.match(manifest, /outside Rembr storage/);
    assert.ok(archive.file('files/asset/0001-private.txt'));
    assert.ok(archive.file('files/import/0002-private.txt'));
    assert.ok(archive.file('files/media/0003-private.txt'));
    assert.equal(await service.getStatus('owner-b', otherExport.id).then((status) => status?.status), 'queued');
  } finally {
    await database.close();
  }
});

test('an unavailable export artifact records a bounded failure activity event', async () => {
  const database = await createTestDatabase();
  const storage = fakeStorage();
  storage.read = async () => { throw new Error('private storage failure'); };
  try {
    await seedUser(database, 'owner-a', 'a@example.test');
    const service = createAccountDataExportService(database, storage, fakeFileSource().source);
    const requested = await service.request('owner-a', false, start);
    const claim = await service.claimNext(start);
    assert.ok(claim);
    assert.equal((await service.processClaim(claim, start))?.status, 'ready');
    assert.equal(await service.getDownload('owner-a', requested.id, new Date(start.getTime() + 1)), null);
    assert.equal((await service.getStatus('owner-a', requested.id))?.errorCode, 'artifact_unavailable');
    const eventTypes = (await database.prepare(`SELECT event_type FROM account_activity_events`).all() as Array<{ event_type: string }>)
      .map(({ event_type }) => event_type).sort();
    assert.deepEqual(eventTypes, ['data_export_failed', 'data_export_ready', 'data_export_requested']);
  } finally {
    await database.close();
  }
});

test('file bounds fail closed, failed exports can be retried once per attempt, and ready artifacts expire', async () => {
  const database = await createTestDatabase();
  const storage = fakeStorage();
  const files = fakeFileSource([fileReference('owner-a', 'asset-a'), fileReference('owner-a', 'asset-b')]);
  const service = createAccountDataExportService(database, storage, files.source, {
    limits: { maxFiles: 1, maxSingleFileBytes: 20, maxTotalFileBytes: 30 },
  });
  try {
    await seedUser(database, 'owner-a', 'a@example.test');
    const requested = await service.request('owner-a', true, start);
    let claim = await service.claimNext(start);
    assert.ok(claim);
    let status = await service.processClaim(claim, start);
    assert.equal(status?.status, 'failed');
    assert.equal(status?.errorCode, 'file_count_limit_exceeded');
    assert.equal(storage.artifacts.size, 0);

    assert.equal((await service.retry('owner-a', requested.id, new Date(start.getTime() + 1)))?.status, 'queued');
    files.setReferences([fileReference('owner-a', 'asset-a', 21)]);
    claim = await service.claimNext(new Date(start.getTime() + 2));
    assert.ok(claim);
    status = await service.processClaim(claim, new Date(start.getTime() + 2));
    assert.equal(status?.status, 'failed');
    assert.equal(status?.errorCode, 'invalid_file_reference');

    assert.equal((await service.retry('owner-a', requested.id, new Date(start.getTime() + 3)))?.status, 'queued');
    files.setReferences([fileReference('owner-a', 'asset-a')]);
    claim = await service.claimNext(new Date(start.getTime() + 4));
    assert.ok(claim);
    status = await service.processClaim(claim, new Date(start.getTime() + 4));
    assert.equal(status?.status, 'ready');
    assert.equal(status?.attemptCount, 3);
    assert.equal(await service.retry('owner-a', requested.id, new Date(start.getTime() + 5)), null);

    const eligible = await service.getDownload('owner-a', requested.id, new Date(start.getTime() + 5));
    assert.ok(eligible);
    const expiredAt = new Date(start.getTime() + 7 * 24 * 60 * 60_000 + 4);
    assert.equal(await service.getDownload('owner-a', requested.id, expiredAt), null);
    assert.equal((await service.getStatus('owner-a', requested.id, expiredAt))?.status, 'expired');
    assert.equal(storage.artifacts.size, 0);
    assert.equal(storage.removals.length, 1);
  } finally {
    await database.close();
  }
});

test('atomic claims never hand the same queued export to concurrent workers and fences stale leases', async () => {
  const database = await createTestDatabase();
  const storage = fakeStorage();
  const files = fakeFileSource();
  try {
    await seedUser(database, 'owner-a', 'a@example.test');
    await seedUser(database, 'owner-b', 'b@example.test');
    const service = createAccountDataExportService(database, storage, files.source);
    const first = await service.request('owner-a', false, start);
    const second = await service.request('owner-b', false, new Date(start.getTime() + 1));
    const claims = await Promise.all([service.claimNext(start), service.claimNext(start)]);
    assert.ok(claims[0]);
    assert.ok(claims[1]);
    assert.notEqual(claims[0]!.id, claims[1]!.id);
    assert.deepEqual(new Set(claims.map((claim) => claim!.id)), new Set([first.id, second.id]));
    assert.equal(await service.claimNext(start), null);

    const staleAt = new Date(start.getTime() + 15 * 60_000 + 1);
    const reclaimed = await service.claimNext(staleAt);
    assert.ok(reclaimed);
    assert.ok(claims.some((claim) => claim?.id === reclaimed.id && claim.leaseToken !== reclaimed.leaseToken));
    const staleResult = await service.processClaim(claims.find((claim) => claim?.id === reclaimed.id)!, staleAt);
    assert.equal(staleResult?.status, 'processing');
  } finally {
    await database.close();
  }
});

test('export claims skip disabled owners and remove an archive when freezing wins finalization', async () => {
  const database = await createTestDatabase();
  const storage = fakeStorage();
  const files = fakeFileSource();
  try {
    await seedUser(database, 'owner-frozen', 'frozen@example.test');
    const service = createAccountDataExportService(database, storage, files.source);
    const requested = await service.request('owner-frozen', false, start);
    await database.prepare("UPDATE users SET account_status='disabled' WHERE id='owner-frozen'").run();
    assert.equal(await service.claimNext(start), null);

    await database.prepare("UPDATE users SET account_status='active' WHERE id='owner-frozen'").run();
    const claim = await service.claimNext(start);
    assert.ok(claim);
    const write = storage.write.bind(storage);
    storage.write = async (ownerId, key, bytes) => {
      await write(ownerId, key, bytes);
      await database.transaction(async () => {
        await database.prepare("UPDATE users SET account_status='disabled' WHERE id=?").run(ownerId);
        await database.prepare("UPDATE account_data_exports SET status='cancelled',lease_token=NULL,lease_expires_at=NULL WHERE id=?").run(claim.id);
      })();
    };
    const result = await service.processClaim(claim, start);
    assert.equal(result?.status, 'cancelled');
    assert.equal(storage.artifacts.size, 0);
    assert.equal(storage.removals.length, 1);
    assert.equal((await service.getStatus('owner-frozen', requested.id))?.status, 'cancelled');
  } finally {
    await database.close();
  }
});

test('an export claimed before account freeze is cancelled before its artifact write starts', async () => {
  const database = await createTestDatabase();
  const storage = fakeStorage();
  try {
    await seedUser(database, 'owner-freeze-before-write', 'freeze-before-write@example.test');
    const service = createAccountDataExportService(database, storage, fakeFileSource().source);
    const requested = await service.request('owner-freeze-before-write', false, start);
    const claim = await service.claimNext(start);
    assert.ok(claim);
    await database.prepare("UPDATE users SET account_status='disabled' WHERE id=?").run('owner-freeze-before-write');

    const cancelled = await service.processClaim(claim, start);
    assert.equal(cancelled?.status, 'cancelled');
    assert.equal(cancelled?.errorCode, 'account_inactive');
    assert.equal(storage.artifacts.size, 0);
    assert.equal((await service.getStatus('owner-freeze-before-write', requested.id))?.status, 'cancelled');
  } finally {
    await database.close();
  }
});

test('reclaimed export removes the durable staged artifact from the prior attempt before retrying', async () => {
  const database = await createTestDatabase();
  const storage = fakeStorage();
  try {
    await seedUser(database, 'owner-reclaim', 'reclaim@example.test');
    const service = createAccountDataExportService(database, storage, fakeFileSource().source);
    const requested = await service.request('owner-reclaim', false, start);
    const firstClaim = await service.claimNext(start);
    assert.ok(firstClaim);
    const stagedKey = storage.keyForAttempt('owner-reclaim', requested.id, firstClaim.leaseToken);
    storage.artifacts.set(stagedKey, Buffer.from('orphan from a crashed worker'));
    await database.prepare('UPDATE account_data_exports SET artifact_key=? WHERE id=?').run(stagedKey, requested.id);

    const reclaimed = await service.claimNext(new Date(start.getTime() + 15 * 60_000 + 1));
    assert.ok(reclaimed);
    assert.notEqual(reclaimed.leaseToken, firstClaim.leaseToken);
    const ready = await service.processClaim(reclaimed, new Date(start.getTime() + 15 * 60_000 + 1));
    assert.equal(ready?.status, 'ready');
    assert.equal(storage.artifacts.has(stagedKey), false);
    assert.ok(storage.removals.includes(stagedKey));
    const row = await database.prepare('SELECT artifact_key FROM account_data_exports WHERE id=?').get(requested.id) as { artifact_key: string };
    assert.ok(row.artifact_key);
    assert.notEqual(row.artifact_key, stagedKey);
  } finally {
    await database.close();
  }
});

test('owner work lease heartbeats extend active writes and fail closed when the lease disappears', async () => {
  const database = await createTestDatabase();
  try {
    await seedUser(database, 'owner-heartbeat', 'heartbeat@example.test');
    let initialExpiry = '';
    let renewedExpiry = '';
    const operation = withOwnerWorkLease(database, 'owner-heartbeat', 'export_write', async (signal) => {
      const initial = await database.prepare('SELECT expires_at FROM account_owner_work_leases WHERE owner_id=?').get('owner-heartbeat') as { expires_at: string };
      initialExpiry = initial.expires_at;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const renewed = await database.prepare('SELECT expires_at FROM account_owner_work_leases WHERE owner_id=?').get('owner-heartbeat') as { expires_at: string };
      renewedExpiry = renewed.expires_at;
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }, new Date(), 5);
    await new Promise((resolve) => setTimeout(resolve, 45));
    await database.prepare('DELETE FROM account_owner_work_leases WHERE owner_id=?').run('owner-heartbeat');
    await assert.rejects(operation, /work_lease_lost/);
    assert.ok(Date.parse(renewedExpiry) > Date.parse(initialExpiry));
  } finally {
    await database.close();
  }
});
