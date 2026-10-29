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
    async write(ownerId, exportId, leaseToken, bytes) {
      const key = `${ownerId}/${exportId}/${leaseToken}.zip`;
      artifacts.set(key, Buffer.from(bytes));
      return key;
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
    await seedItem(database, 'item-a', 'owner-a', 'A only');
    await seedItem(database, 'item-b', 'owner-b', 'B private');
    await database.prepare(`INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)`)
      .run('session-a', 'owner-a', 'a'.repeat(64), '2027-01-01T00:00:00.000Z', start.toISOString());

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
    const manifest = await archive.file('manifest.json')!.async('string');
    assert.match(library, /A only/);
    assert.doesNotMatch(library, /B private/);
    assert.match(account, /a@example\.test/);
    assert.doesNotMatch(account, /secret-password-hash/);
    assert.doesNotMatch(account, /token_hash/);
    assert.doesNotMatch(manifest, /secret-password-hash|a{64}/);
    assert.match(account, /2027-01-01T00:00:00.000Z/);
    assert.match(manifest, /Session credentials and token hashes are excluded/);
    assert.match(manifest, /outside Rembr storage/);
    assert.ok(archive.file('files/asset/0001-private.txt'));
    assert.ok(archive.file('files/import/0002-private.txt'));
    assert.ok(archive.file('files/media/0003-private.txt'));
    assert.equal(await service.getStatus('owner-b', otherExport.id).then((status) => status?.status), 'queued');
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
    storage.write = async (ownerId, exportId, leaseToken, bytes) => {
      const key = await write(ownerId, exportId, leaseToken, bytes);
      await database.transaction(async () => {
        await database.prepare("UPDATE users SET account_status='disabled' WHERE id=?").run(ownerId);
        await database.prepare("UPDATE account_data_exports SET status='cancelled',lease_token=NULL,lease_expires_at=NULL WHERE id=?").run(exportId);
      })();
      return key;
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
