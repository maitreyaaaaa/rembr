/**
 * Provider-neutral boundary for a future semantic retrieval implementation.
 * This module has no provider adapter, HTTP route, or database adapter yet.
 */

export const MAX_EMBEDDING_DIMENSIONS = 4_096;
export const MAX_SEMANTIC_QUERY_CHARS = 1_200;
export const MAX_SEMANTIC_DOCUMENT_CHARS = 12_000;
export const MAX_SEMANTIC_DOCUMENTS_PER_BATCH = 16;
export const MAX_SEMANTIC_RESULTS = 50;

export type EmbeddingPurpose = 'query' | 'document';

export interface EmbeddingVector {
  model: string;
  values: readonly number[];
  /** Provider-reported input tokens used to reserve and settle shared AI spend. */
  inputTokens?: number;
}

/** Adapter contract only; callers must still handle credentials, timeouts, and spend. */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(text: string, purpose: EmbeddingPurpose): Promise<EmbeddingVector>;
}

export interface SemanticDocumentInput {
  itemId: string;
  contentHash: string;
  text: string;
}

export interface SemanticEmbeddingRecord {
  ownerId: string;
  itemId: string;
  contentHash: string;
  model: string;
  vector: readonly number[];
}

export interface SemanticSearchHit {
  ownerId: string;
  itemId: string;
  contentHash: string;
  /** Current hash of the owner's source text; null means the item has no indexable source. */
  sourceContentHash: string | null;
  model: string;
  similarity: number;
}

/**
 * Implementations must scope both writes and similarity queries by ownerId,
 * join the current source item to each candidate, and report its current hash.
 * The service verifies ownership/model and drops stale-vector matches.
 */
export interface SemanticEmbeddingRepository {
  upsertOwnerEmbedding(record: SemanticEmbeddingRecord): Promise<void>;
  searchOwnerEmbeddings(input: {
    ownerId: string;
    model: string;
    vector: readonly number[];
    limit: number;
  }): Promise<readonly SemanticSearchHit[]>;
}

export interface SemanticSearchResult {
  itemId: string;
  contentHash: string;
  similarity: number;
}

export interface SemanticSearchOptions {
  limit?: number;
  minimumSimilarity?: number;
}

export class SemanticEmbeddingContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SemanticEmbeddingContractError';
  }
}

function requiredId(value: string, label: string): string {
  const id = value.trim();
  if (!id || id.length > 160) throw new SemanticEmbeddingContractError(`${label} must contain 1 to 160 characters.`);
  return id;
}

function boundedText(value: string, maxCharacters: number, label: string): string {
  const text = value.trim();
  if (!text) throw new SemanticEmbeddingContractError(`${label} cannot be empty.`);
  if (text.length > maxCharacters) throw new SemanticEmbeddingContractError(`${label} exceeds the ${maxCharacters}-character bound.`);
  return text;
}

function validContentHash(value: string): string {
  if (!/^[a-f\d]{64}$/i.test(value)) throw new SemanticEmbeddingContractError('contentHash must be a SHA-256 hex digest.');
  return value.toLowerCase();
}

function validateProvider(provider: EmbeddingProvider): void {
  if (!provider.model.trim() || provider.model.length > 160) throw new SemanticEmbeddingContractError('Embedding model must contain 1 to 160 characters.');
  if (!Number.isInteger(provider.dimensions) || provider.dimensions < 1 || provider.dimensions > MAX_EMBEDDING_DIMENSIONS) {
    throw new SemanticEmbeddingContractError(`Embedding dimensions must be between 1 and ${MAX_EMBEDDING_DIMENSIONS}.`);
  }
}

export function validateEmbeddingVector(result: EmbeddingVector, expectedModel: string, expectedDimensions: number): number[] {
  if (!result || result.model !== expectedModel || !Array.isArray(result.values) || result.values.length !== expectedDimensions) {
    throw new SemanticEmbeddingContractError('Embedding response model or dimensions do not match the configured provider.');
  }
  const vector = [...result.values];
  if (vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new SemanticEmbeddingContractError('Embedding values must all be finite numbers.');
  }
  if (vector.every((value) => value === 0)) throw new SemanticEmbeddingContractError('Embedding vector cannot be all zeroes.');
  return vector;
}

function resultLimit(limit: number | undefined): number {
  const value = limit ?? 20;
  if (!Number.isInteger(value) || value < 1 || value > MAX_SEMANTIC_RESULTS) {
    throw new SemanticEmbeddingContractError(`Semantic result limit must be between 1 and ${MAX_SEMANTIC_RESULTS}.`);
  }
  return value;
}

function similarityThreshold(value: number | undefined): number {
  const threshold = value ?? 0;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new SemanticEmbeddingContractError('Minimum similarity must be between 0 and 1.');
  }
  return threshold;
}

export function createSemanticEmbeddingService(input: {
  provider: EmbeddingProvider;
  repository: SemanticEmbeddingRepository;
}) {
  const { provider, repository } = input;
  validateProvider(provider);

  return {
    async indexDocuments(ownerIdInput: string, documents: readonly SemanticDocumentInput[]): Promise<number> {
      const ownerId = requiredId(ownerIdInput, 'ownerId');
      if (documents.length > MAX_SEMANTIC_DOCUMENTS_PER_BATCH) {
        throw new SemanticEmbeddingContractError(`A semantic indexing batch is limited to ${MAX_SEMANTIC_DOCUMENTS_PER_BATCH} documents.`);
      }
      const seen = new Set<string>();
      const validatedDocuments: Array<{ itemId: string; contentHash: string; text: string }> = [];
      for (const document of documents) {
        const itemId = requiredId(document.itemId, 'itemId');
        if (seen.has(itemId)) throw new SemanticEmbeddingContractError('An item may appear only once per semantic indexing batch.');
        seen.add(itemId);
        const text = boundedText(document.text, MAX_SEMANTIC_DOCUMENT_CHARS, 'Document text');
        const contentHash = validContentHash(document.contentHash);
        validatedDocuments.push({ itemId, contentHash, text });
      }
      for (const document of validatedDocuments) {
        const result = await provider.embed(document.text, 'document');
        const vector = validateEmbeddingVector(result, provider.model, provider.dimensions);
        await repository.upsertOwnerEmbedding({
          ownerId, itemId: document.itemId, contentHash: document.contentHash, model: provider.model, vector,
        });
      }
      return documents.length;
    },

    async search(ownerIdInput: string, queryInput: string, options: SemanticSearchOptions = {}): Promise<SemanticSearchResult[]> {
      const ownerId = requiredId(ownerIdInput, 'ownerId');
      const query = boundedText(queryInput, MAX_SEMANTIC_QUERY_CHARS, 'Query');
      const limit = resultLimit(options.limit);
      const minimumSimilarity = similarityThreshold(options.minimumSimilarity);
      const result = await provider.embed(query, 'query');
      const vector = validateEmbeddingVector(result, provider.model, provider.dimensions);
      const matches = await repository.searchOwnerEmbeddings({ ownerId, model: provider.model, vector, limit });
      if (matches.length > limit) throw new SemanticEmbeddingContractError('Semantic repository returned more results than requested.');

      const itemIds = new Set<string>();
      const ranked: SemanticSearchResult[] = [];
      for (const match of matches) {
        if (match.ownerId !== ownerId) throw new SemanticEmbeddingContractError('Semantic repository returned a result for another owner.');
        if (match.model !== provider.model) throw new SemanticEmbeddingContractError('Semantic repository returned a result from another embedding model.');
        const itemId = requiredId(match.itemId, 'itemId');
        const contentHash = validContentHash(match.contentHash);
        const sourceContentHash = match.sourceContentHash === null ? null : validContentHash(match.sourceContentHash);
        if (!Number.isFinite(match.similarity) || match.similarity < -1 || match.similarity > 1) {
          throw new SemanticEmbeddingContractError('Semantic similarity must be a finite cosine score from -1 to 1.');
        }
        if (itemIds.has(itemId)) throw new SemanticEmbeddingContractError('Semantic repository returned duplicate item results.');
        itemIds.add(itemId);
        if (sourceContentHash !== contentHash) continue;
        if (match.similarity >= minimumSimilarity) ranked.push({ itemId, contentHash, similarity: match.similarity });
      }
      return ranked.sort((a, b) => b.similarity - a.similarity || a.itemId.localeCompare(b.itemId));
    },
  };
}
