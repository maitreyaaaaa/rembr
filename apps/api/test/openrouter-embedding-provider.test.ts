import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOpenRouterEmbeddingProvider,
  OpenRouterEmbeddingProvider,
  OPENROUTER_EMBEDDING_DIMENSIONS,
  OPENROUTER_EMBEDDING_MODEL,
  OpenRouterEmbeddingError,
} from '../src/library/openrouter-embedding-provider.js';

function response(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), { status: 200, ...init });
}

function vector(values: number[] = Array.from({ length: OPENROUTER_EMBEDDING_DIMENSIONS }, (_, index) => index === 0 ? 1 : 0)) {
  return { model: OPENROUTER_EMBEDDING_MODEL, data: [{ index: 0, embedding: values }], usage: { prompt_tokens: 12, total_tokens: 12 } };
}

test('sends the selected model to the fixed OpenRouter embeddings endpoint and parses its vector', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const provider = createOpenRouterEmbeddingProvider('server-secret', {
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return response(vector());
    },
  });

  const result = await provider.embed('private saved text', 'document');

  assert.equal(requestUrl, 'https://openrouter.ai/api/v1/embeddings');
  assert.equal(new Headers(requestInit?.headers).get('authorization'), 'Bearer server-secret');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    model: OPENROUTER_EMBEDDING_MODEL, input: 'private saved text',
    dimensions: OPENROUTER_EMBEDDING_DIMENSIONS, encoding_format: 'float',
  });
  assert.equal(provider.dimensions, OPENROUTER_EMBEDDING_DIMENSIONS);
  assert.equal(result.model, OPENROUTER_EMBEDDING_MODEL);
  assert.equal(result.values.length, OPENROUTER_EMBEDDING_DIMENSIONS);
  assert.equal(result.inputTokens, 12);
});

test('accepts OpenRouter’s provider-normalized response model name', async () => {
  const provider = new OpenRouterEmbeddingProvider('secret-key', {
    fetchImpl: async () => response({ ...vector(), model: 'text-embedding-3-small' }),
  });
  const result = await provider.embed('synthetic query', 'query');
  assert.equal(result.model, OPENROUTER_EMBEDDING_MODEL);
});

test('requires a server-side key and rejects unexpected provider response models', async () => {
  assert.throws(() => createOpenRouterEmbeddingProvider('  '), OpenRouterEmbeddingError);
  const provider = createOpenRouterEmbeddingProvider('server-secret', {
    fetchImpl: async () => response({ ...vector(), model: 'another/model' }),
  });
  await assert.rejects(provider.embed('query', 'query'), /unexpected model/);
});

test('rejects malformed, non-finite and wrong-dimension vectors', async () => {
  const invalidResponses = [
    { model: OPENROUTER_EMBEDDING_MODEL, data: [] },
    { model: OPENROUTER_EMBEDDING_MODEL, data: [{ index: 0, embedding: [0, 1] }] },
    vector(Array.from({ length: OPENROUTER_EMBEDDING_DIMENSIONS }, (_, index) => index === 0 ? Number.NaN : 0)),
    vector(Array.from({ length: OPENROUTER_EMBEDDING_DIMENSIONS }, () => 0)),
  ];
  for (const payload of invalidResponses) {
    const provider = createOpenRouterEmbeddingProvider('server-secret', { fetchImpl: async () => response(payload) });
    await assert.rejects(provider.embed('query', 'query'), /invalid|unexpected/);
  }
});

test('sanitizes provider error bodies so they cannot leak source text or credentials', async () => {
  const provider = createOpenRouterEmbeddingProvider('server-secret', {
    fetchImpl: async () => new Response('private saved text server-secret', { status: 429 }),
  });
  await assert.rejects(provider.embed('private saved text', 'document'), (cause: unknown) => {
    assert.ok(cause instanceof OpenRouterEmbeddingError);
    assert.match(cause.message, /HTTP 429/);
    assert.doesNotMatch(cause.message, /private saved text|server-secret/);
    return true;
  });
});

test('turns request timeouts into a bounded sanitized error', async () => {
  const provider = createOpenRouterEmbeddingProvider('server-secret', {
    timeoutMs: 1_000,
    fetchImpl: async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('request included secret text')), { once: true });
    }),
  });
  await assert.rejects(provider.embed('private saved text', 'query'), (cause: unknown) => {
    assert.ok(cause instanceof OpenRouterEmbeddingError);
    assert.equal(cause.message, 'OpenRouter embedding request timed out.');
    return true;
  });
});
