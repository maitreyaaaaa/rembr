import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';
import { createTestDatabase } from '../src/db/database.js';
import { LOCAL_VISUAL_DISCLOSURE_VERSION } from '../src/ai/preferences.js';
import { processNextVisualEmbeddingJob, queueVisualEmbeddingForItem } from '../src/ai/visual-embedding-worker.js';
import { createAiPreferenceRepository } from '../src/ai/preferences.js';
import type { MediaStorage } from '../src/media/storage.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCh4AAAAASUVORK5CYII=', 'base64');
const start = new Date('2026-10-30T12:00:00.000Z');

async function seed(database: Awaited<ReturnType<typeof createTestDatabase>>, ownerId: string, itemId: string) {
  await database.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)')
    .run(ownerId, `${ownerId}@example.test`, 'hashed', start.toISOString());
  await database.prepare(`INSERT INTO saved_items(id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
    VALUES(?,?,?,?,?,'ready',?,?)`).run(itemId, ownerId, `https://example.org/${itemId}`, `https://example.org/${itemId}`, 'Local image', start.toISOString(), start.toISOString());
  await database.prepare(`INSERT INTO ai_analysis_preferences(owner_id,enabled,updated_at,local_visual_enabled,local_visual_consent_version,local_visual_consented_at)
    VALUES(?,FALSE,?,TRUE,?,?)`).run(ownerId, start.toISOString(), LOCAL_VISUAL_DISCLOSURE_VERSION, start.toISOString());
  const sha256 = createHash('sha256').update(png).digest('hex');
  await database.prepare(`INSERT INTO media_artifacts(id,owner_id,item_id,generation,source_url,storage_key,detected_mime,byte_size,sha256,status,active,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,'ready',1,?)`).run('visual-media', ownerId, itemId, 1, 'https://example.org/image.png', '00000000-0000-4000-8000-000000000002.media', 'image/png', png.length, sha256, start.toISOString());
  return sha256;
}

function storage(): MediaStorage {
  return {
    initialize: async () => undefined,
    write: async () => { throw new Error('not_used'); },
    read: async () => Buffer.from(png),
    remove: async () => undefined,
    removeUnknown: async () => undefined,
  };
}

test('local visual worker indexes only bounded validated private media and persists owner-scoped vectors', async () => {
  const database = await createTestDatabase();
  try {
    await seed(database, 'visual-worker-owner', 'visual-worker-item');
    assert.equal(await queueVisualEmbeddingForItem(database, 'visual-worker-owner', 'visual-worker-item', start), true);
    let called = 0;
    const jobId = await processNextVisualEmbeddingJob(database, storage(), async (image, signal) => {
      called += 1;
      assert.equal(image.mime, 'image/png');
      assert.equal(image.byteSize, png.length);
      assert.equal(signal?.aborted, false);
      assert.equal((await stat(image.path)).isFile(), true);
      assert.deepEqual(await readFile(image.path), png);
      return { model: 'clip-v1', embedding: [3, 4] };
    }, 'clip-v1', start);
    assert.equal(jobId, 'visual-worker-owner:visual-worker-item');
    assert.equal(called, 1);
    const row = await database.prepare('SELECT model,content_hash,embedding FROM visual_item_embeddings WHERE owner_id=? AND item_id=?')
      .get('visual-worker-owner', 'visual-worker-item') as { model: string; content_hash: string; embedding: number[] };
    assert.equal(row.model, 'clip-v1');
    assert.equal(row.content_hash.length, 64);
    assert.deepEqual(row.embedding.map((value) => Number(value.toFixed(3))), [0.6, 0.8]);
    assert.equal((await database.prepare("SELECT status FROM visual_embedding_jobs WHERE owner_id=? AND item_id=?")
      .get('visual-worker-owner', 'visual-worker-item') as { status: string }).status, 'completed');
  } finally { await database.close(); }
});

test('local visual worker does not save a vector if consent is revoked during extraction', async () => {
  const database = await createTestDatabase();
  try {
    await seed(database, 'visual-revoke-owner', 'visual-revoke-item');
    await queueVisualEmbeddingForItem(database, 'visual-revoke-owner', 'visual-revoke-item', start);
    let started!: () => void;
    let wasAborted = false;
    const extractionStarted = new Promise<void>((resolve) => { started = resolve; });
    const processing = processNextVisualEmbeddingJob(database, storage(), async (_image, signal) => await new Promise((resolve, reject) => {
      started();
      signal?.addEventListener('abort', () => { wasAborted = true; reject(signal.reason); }, { once: true });
    }), 'clip-v1', start);
    await extractionStarted;
    await createAiPreferenceRepository(database).setLocalVisual('visual-revoke-owner', false);
    await processing;
    assert.equal(wasAborted, true);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM visual_item_embeddings WHERE owner_id=?')
      .get('visual-revoke-owner') as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT status FROM visual_embedding_jobs WHERE owner_id=?')
      .get('visual-revoke-owner') as { status: string }).status, 'cancelled');
  } finally { await database.close(); }
});
