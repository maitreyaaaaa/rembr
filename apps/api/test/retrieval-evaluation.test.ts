import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRetrievalMetrics } from '../src/library/retrieval-evaluation.js';
import { parseRetrievalEvaluationDataset } from '../src/library/retrieval-evaluation-dataset.js';
import { createPublicEvaluationReport, normalizeEvaluationApiUrl } from '../src/library/retrieval-evaluation-runner.js';

test('calculates MRR, nDCG, and recall for a graded ranking', () => {
  const metrics = calculateRetrievalMetrics(['a', 'b', 'c', 'd'], [
    { itemId: 'b', grade: 3 }, { itemId: 'd', grade: 1 }, { itemId: 'missing', grade: 2 },
  ], 3);
  assert.equal(metrics.reciprocalRankAtK, 0.5);
  assert.ok(metrics.ndcgAtK > 0 && metrics.ndcgAtK < 1);
  assert.equal(metrics.recallAtK, 1 / 3);
});

test('returns zero metrics when no judged relevant item is retrieved', () => {
  assert.deepEqual(calculateRetrievalMetrics(['a', 'b'], [{ itemId: 'c', grade: 2 }]), {
    reciprocalRankAtK: 0, ndcgAtK: 0, recallAtK: 0,
  });
});

test('rejects invalid cutoffs and duplicate judgments', () => {
  assert.throws(() => calculateRetrievalMetrics([], [], 0), /positive integer/);
  assert.throws(() => calculateRetrievalMetrics([], [
    { itemId: 'a', grade: 1 }, { itemId: 'a', grade: 2 },
  ]), /one relevance judgment/);
});

test('accepts explicit synthetic relevance data and rejects unlabeled or duplicate judgments', () => {
  const sample = {
    schemaVersion: 1,
    judgmentSource: 'synthetic',
    description: 'Synthetic fixture, not representative.',
    queries: [{ id: 'q1', query: 'design system', judgments: [{ itemId: '7b2f6db0-6936-48de-b809-090b22079031', grade: 3 }] }],
  };
  assert.equal(parseRetrievalEvaluationDataset(sample).judgmentSource, 'synthetic');
  assert.throws(() => parseRetrievalEvaluationDataset({ ...sample, judgmentSource: 'unknown' }), /judgmentSource/);
  assert.throws(() => parseRetrievalEvaluationDataset({ ...sample, queries: [{ ...sample.queries[0], judgments: [{ itemId: '7b2f6db0-6936-48de-b809-090b22079031', grade: 0 }] }] }), /positive relevance grade/);
});

test('remote evaluation requires HTTPS; loopback remains available over HTTP', () => {
  assert.equal(normalizeEvaluationApiUrl('http://127.0.0.1:4000', false).pathname, '/api/items');
  assert.throws(() => normalizeEvaluationApiUrl('https://staging.example.test', false), /allow-remote/);
  assert.throws(() => normalizeEvaluationApiUrl('http://staging.example.test', true), /requires HTTPS/);
  assert.equal(normalizeEvaluationApiUrl('https://staging.example.test', true).protocol, 'https:');
});

test('public reports omit query text, user labels, and item identifiers', () => {
  const report = createPublicEvaluationReport('human-reviewed', [{
    judgedItems: 3, retrievedItems: 6, truncated: false,
    reciprocalRankAtK: 0.5, ndcgAtK: 0.7, recallAtK: 0.4,
  }]);
  const rendered = JSON.stringify(report);
  assert.doesNotMatch(rendered, /do-not-emit-this-query|7b2f6db0-6936-48de-b809-090b22079031/);
  assert.equal('description' in report, false);
  assert.equal('queryId' in report.perQuery[0]!, false);
  assert.deepEqual(report.perQuery[0], {
    queryIndex: 1, judgedItems: 3, retrievedItems: 6, truncated: false,
    mrrAt10: 0.5, ndcgAt10: 0.7, recallAt10: 0.4,
  });
});
