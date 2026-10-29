import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LocalPrivateExportArtifactStorage, SupabasePrivateExportArtifactStorage } from '../src/storage/account-export-storage.js';

const owner = 'a-owner';
const exportId = '70e1ef2b-7a21-4c39-90e9-409a2d4801a2';
const lease = '80e1ef2b-7a21-4c39-90e9-409a2d4801a2';

test('local export storage writes private owner-namespaced artifacts and rejects cross-owner keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rembr-export-'));
  try {
    const store = new LocalPrivateExportArtifactStorage(root);
    await store.initialize();
    const key = await store.write(owner, exportId, lease, Buffer.from('private archive'));
    assert.match(key, /^account-exports\/[a-f0-9]{64}\//);
    assert.deepEqual(await store.read(owner, key), Buffer.from('private archive'));
    await assert.rejects(store.read('another-owner', key), /owner_mismatch/);
    await assert.rejects(store.read(owner, '../outside'), /owner_mismatch/);
    await store.remove(owner, key);
    await assert.rejects(readFile(join(root, ...key.split('/'))));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Supabase export adapter uses private namespaced object keys', async () => {
  const seen: string[] = [];
  const objects = {
    async initialize() {}, async write(key: string, _bytes: Buffer, mime: string) { seen.push(`write:${key}:${mime}`); },
    async read(key: string) { seen.push(`read:${key}`); return Buffer.from('zip'); },
    async remove(key: string) { seen.push(`remove:${key}`); },
  };
  const store = new SupabasePrivateExportArtifactStorage(objects);
  const key = await store.write(owner, exportId, lease, Buffer.from('zip'));
  assert.deepEqual(await store.read(owner, key), Buffer.from('zip'));
  await store.remove(owner, key);
  assert.match(seen[0]!, /^write:account-exports\/[a-f0-9]{64}\/.+\.zip:application\/zip$/);
  await assert.rejects(store.read('foreign', key), /owner_mismatch/);
});
