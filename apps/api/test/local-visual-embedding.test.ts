import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalVisualEmbedding, normalizeVisualEmbedding, parseLocalVisualEmbedding } from '../src/ai/local-visual-embedding.js';

test('local visual embedding accepts the source aliases and bounds vector shape', () => {
  assert.deepEqual(parseLocalVisualEmbedding(JSON.stringify({ visualEmbedding: [0.25, -0.5], model: 'clip-small' }), 'fallback'), {
    model: 'clip-small', embedding: [0.25, -0.5],
  });
  assert.deepEqual(parseLocalVisualEmbedding('[1,0]', 'configured-model'), { model: 'configured-model', embedding: [1, 0] });
  assert.equal(normalizeVisualEmbedding([]), null);
  assert.equal(normalizeVisualEmbedding([0, 0]), null);
  assert.equal(normalizeVisualEmbedding([1, Number.NaN]), null);
  assert.equal(normalizeVisualEmbedding(Array(2_049).fill(1)), null);
  assert.equal(parseLocalVisualEmbedding('not json', 'model'), null);
  assert.equal(parseLocalVisualEmbedding(JSON.stringify(Array(90_000).fill('x')), 'model'), null);
});

test('local visual embedding calls a fixed executable argument without shell interpolation', async () => {
  let call: { executable: string; args: string[]; timeoutMs: number; maxBuffer: number } | undefined;
  const extract = createLocalVisualEmbedding({ executable: 'local-wrapper', model: 'clip-v1', timeoutMs: 2_000,
    runner: async (executable, args, options) => {
      call = { executable, args, timeoutMs: options.timeoutMs, maxBuffer: options.maxBuffer };
      return '[0.4,0.8]';
    } });
  const result = await extract({ path: 'C:\\private\\photo.jpg', mime: 'image/jpeg', byteSize: 100 });
  assert.deepEqual(call, { executable: 'local-wrapper', args: ['C:\\private\\photo.jpg'], timeoutMs: 2_000, maxBuffer: 256 * 1024 });
  assert.deepEqual(result, { model: 'clip-v1', embedding: [0.4, 0.8] });
  await assert.rejects(() => extract({ path: 'bad', mime: 'image/jpeg', byteSize: 5 * 1024 * 1024 + 1 }), /local_visual_invalid_image/);
});

test('local visual embedding rejects a wrapper-reported model that differs from configured provenance', async () => {
  const extract = createLocalVisualEmbedding({ executable: 'wrapper', model: 'configured-v1', timeoutMs: 1_000,
    runner: async () => JSON.stringify({ embedding: [1, 0], model: 'unexpected-v2' }) });
  await assert.rejects(() => extract({ path: 'image.png', mime: 'image/png', byteSize: 20 }), /local_visual_model_mismatch/);
});
