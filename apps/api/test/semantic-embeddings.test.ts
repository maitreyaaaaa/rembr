import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSemanticEmbeddingService,
  MAX_SEMANTIC_DOCUMENTS_PER_BATCH,
  MAX_SEMANTIC_QUERY_CHARS,
  type EmbeddingProvider,
  type EmbeddingPurpose,
  type EmbeddingVector,
  type SemanticEmbeddingRecord,
  type SemanticEmbeddingRepository,
  type SemanticSearchHit,
} from '../src/library/semantic-embeddings.js';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

class FakeProvider implements EmbeddingProvider {
  readonly model = 'fake-semantic-v1';
  readonly dimensions = 2;
  calls: Array<{ text: string; purpose: EmbeddingPurpose }> = [];
  nextResult?: EmbeddingVector;

  async embed(text: string, purpose: EmbeddingPurpose): Promise<EmbeddingVector> {
    this.calls.push({ text, purpose });
    return this.nextResult ?? { model: this.model, values: purpose === 'query' ? [1, 0] : [0, 1] };
  }
}

class FakeRepository implements SemanticEmbeddingRepository {
  writes: SemanticEmbeddingRecord[] = [];
  hits: readonly SemanticSearchHit[] = [];
  searchInput?: Parameters<SemanticEmbeddingRepository['searchOwnerEmbeddings']>[0];

  async upsertOwnerEmbedding(record: SemanticEmbeddingRecord): Promise<void> {
    this.writes.push(record);
  }

  async searchOwnerEmbeddings(input: Parameters<SemanticEmbeddingRepository['searchOwnerEmbeddings']>[0]): Promise<readonly SemanticSearchHit[]> {
    this.searchInput = input;
    return this.hits;
  }
}

function hit(itemId: string, similarity: number, overrides: Partial<SemanticSearchHit> = {}): SemanticSearchHit {
  return { ownerId: 'owner-a', itemId, contentHash: hashA, sourceContentHash: hashA, model: 'fake-semantic-v1', similarity, ...overrides };
}

test('indexes bounded documents with owner, model, and content hash without persisting source text', async () => {
  const provider = new FakeProvider();
  const repository = new FakeRepository();
  const service = createSemanticEmbeddingService({ provider, repository });

  const count = await service.indexDocuments('owner-a', [
    { itemId: 'item-1', contentHash: hashA, text: '  Private source excerpt.  ' },
    { itemId: 'item-2', contentHash: hashB, text: 'Second source excerpt.' },
  ]);

  assert.equal(count, 2);
  assert.deepEqual(provider.calls.map(({ purpose }) => purpose), ['document', 'document']);
  assert.deepEqual(repository.writes.map(({ ownerId, itemId, contentHash, model, vector }) => ({ ownerId, itemId, contentHash, model, vector })), [
    { ownerId: 'owner-a', itemId: 'item-1', contentHash: hashA, model: provider.model, vector: [0, 1] },
    { ownerId: 'owner-a', itemId: 'item-2', contentHash: hashB, model: provider.model, vector: [0, 1] },
  ]);
  assert.equal('text' in repository.writes[0]!, false);
});

test('search passes owner scope and validated query vectors and sorts deterministically', async () => {
  const provider = new FakeProvider();
  const repository = new FakeRepository();
  repository.hits = [hit('item-z', 0.82), hit('item-b', 0.91), hit('item-a', 0.91), hit('item-low', 0.41)];
  const service = createSemanticEmbeddingService({ provider, repository });

  const results = await service.search('owner-a', '  a query  ', { limit: 4, minimumSimilarity: 0.5 });

  assert.deepEqual(results.map(({ itemId }) => itemId), ['item-a', 'item-b', 'item-z']);
  assert.equal(provider.calls[0]?.purpose, 'query');
  assert.deepEqual(repository.searchInput, { ownerId: 'owner-a', model: provider.model, vector: [1, 0], limit: 4 });
});

test('drops stale vectors whose indexed content hash no longer matches the current source', async () => {
  const provider = new FakeProvider();
  const repository = new FakeRepository();
  repository.hits = [hit('item-current', 0.88), hit('item-stale', 0.99, { sourceContentHash: hashB })];
  const service = createSemanticEmbeddingService({ provider, repository });

  const results = await service.search('owner-a', 'query');

  assert.deepEqual(results.map(({ itemId }) => itemId), ['item-current']);
});

test('rejects invalid vectors, wrong model, and dimensions before persistence or search', async () => {
  for (const invalid of [
    { model: 'other-model', values: [0, 1] },
    { model: 'fake-semantic-v1', values: [1] },
    { model: 'fake-semantic-v1', values: [Number.POSITIVE_INFINITY, 0] },
    { model: 'fake-semantic-v1', values: [0, 0] },
  ]) {
    const provider = new FakeProvider();
    provider.nextResult = invalid;
    const repository = new FakeRepository();
    const service = createSemanticEmbeddingService({ provider, repository });
    await assert.rejects(service.indexDocuments('owner-a', [{ itemId: 'item-1', contentHash: hashA, text: 'document' }]), /Embedding/);
    assert.equal(repository.writes.length, 0);
    await assert.rejects(service.search('owner-a', 'query'), /Embedding/);
    assert.equal(repository.searchInput, undefined);
  }
});

test('prevalidates duplicate, oversized, empty and malformed batches before embedding', async () => {
  const provider = new FakeProvider();
  const repository = new FakeRepository();
  const service = createSemanticEmbeddingService({ provider, repository });
  const valid = { itemId: 'item-1', contentHash: hashA, text: 'first document' };

  await assert.rejects(service.indexDocuments('owner-a', [valid, valid]), /only once/);
  await assert.rejects(service.indexDocuments('owner-a', Array.from({ length: MAX_SEMANTIC_DOCUMENTS_PER_BATCH + 1 }, (_, index) => ({ ...valid, itemId: `item-${index}` }))), /limited to/);
  await assert.rejects(service.indexDocuments('owner-a', [{ ...valid, text: '  ' }]), /cannot be empty/);
  await assert.rejects(service.indexDocuments('owner-a', [{ ...valid, contentHash: 'not-a-hash' }]), /SHA-256/);
  await assert.rejects(service.indexDocuments(' ', [valid]), /ownerId/);

  assert.deepEqual(provider.calls, []);
  assert.deepEqual(repository.writes, []);
});

test('enforces query bounds, limits, thresholds, similarity integrity, and owner isolation', async () => {
  const provider = new FakeProvider();
  const repository = new FakeRepository();
  const service = createSemanticEmbeddingService({ provider, repository });

  await assert.rejects(service.search('owner-a', 'q'.repeat(MAX_SEMANTIC_QUERY_CHARS + 1)), /character bound/);
  await assert.rejects(service.search('owner-a', 'query', { limit: 0 }), /result limit/);
  await assert.rejects(service.search('owner-a', 'query', { minimumSimilarity: 1.1 }), /similarity/);
  assert.equal(repository.searchInput, undefined);

  repository.hits = [hit('foreign-item', 0.95, { ownerId: 'owner-b' })];
  await assert.rejects(service.search('owner-a', 'query'), /another owner/);
  repository.hits = [hit('wrong-model', 0.95, { model: 'another-model' })];
  await assert.rejects(service.search('owner-a', 'query'), /another embedding model/);
  repository.hits = [hit('bad-score', Number.NaN)];
  await assert.rejects(service.search('owner-a', 'query'), /finite cosine score/);
  repository.hits = [hit('duplicate', 0.95), hit('duplicate', 0.9)];
  await assert.rejects(service.search('owner-a', 'query'), /duplicate item/);
});

test('rejects unsafe provider dimension configuration at service construction', () => {
  assert.throws(() => createSemanticEmbeddingService({
    provider: { model: 'fake', dimensions: 5_000, embed: async () => ({ model: 'fake', values: [] }) },
    repository: new FakeRepository(),
  }), /dimensions/);
});
