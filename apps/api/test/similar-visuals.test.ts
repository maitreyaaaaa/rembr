import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cosineSimilarity, findSimilarVisuals } from '../src/library/similar-visuals.js';

test('similar saves rank same-model visual vectors and keep results bounded and sanitized', () => {
  const items = [
    { id: 'source', title: 'Blue ceramic vase', hasImage: true, createdAt: '2026-10-01' },
    { id: 'vector', title: 'A different title', hasImage: true, createdAt: '2026-10-02' },
    { id: 'different-model', title: 'Another image', hasImage: true, createdAt: '2026-10-03' },
    { id: 'text', title: 'Blue ceramic vase', visualDescription: 'blue ceramic vase by a window', hasImage: true, createdAt: '2026-10-04' },
  ];
  const ranked = findSimilarVisuals(items, 'source', [
    { itemId: 'source', model: 'clip-v1', embedding: [1, 0] },
    { itemId: 'vector', model: 'clip-v1', embedding: [0.99, 0.01] },
    { itemId: 'different-model', model: 'siglip-v2', embedding: [1, 0] },
  ], 20);
  assert.equal(ranked[0]?.itemId, 'vector');
  assert.ok(ranked.find((entry) => entry.itemId === 'text'));
  assert.equal(ranked.some((entry) => entry.itemId === 'different-model'), false);
  assert.ok(ranked.every((entry) => entry.similarity.score <= 1));
  assert.equal('embedding' in ranked[0]!, false);
  assert.equal(findSimilarVisuals(items, 'source', [], 0).length <= 8, true);
});

test('cosine similarity returns zero for dimension mismatch and zero vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
});
