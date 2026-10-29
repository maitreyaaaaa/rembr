import type { EmbeddingPurpose, EmbeddingProvider, EmbeddingVector } from './semantic-embeddings.js';
import { OWNER_WORK_LEASE_TTL_MS } from '../account/owner-lifecycle.js';

export const OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const OPENROUTER_EMBEDDING_DIMENSIONS = 1_536;
const OPENROUTER_RESPONSE_MODEL = 'text-embedding-3-small';
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const DEFAULT_TIMEOUT_MS = 15_000;

export class OpenRouterEmbeddingError extends Error {
  constructor(message: string, readonly outcomeUnknown = true) {
    super(message);
    this.name = 'OpenRouterEmbeddingError';
  }
}

interface OpenRouterEmbeddingResponse {
  model: string;
  data: Array<{ index: number; embedding: unknown }>;
  usage: { prompt_tokens: unknown };
}

function parseEmbeddingResponse(value: unknown): EmbeddingVector {
  if (!value || typeof value !== 'object') throw new OpenRouterEmbeddingError('OpenRouter returned an invalid embedding response.');
  const response = value as Partial<OpenRouterEmbeddingResponse>;
  // OpenRouter normalizes the returned model name by removing the provider prefix.
  if ((response.model !== OPENROUTER_EMBEDDING_MODEL && response.model !== OPENROUTER_RESPONSE_MODEL)
    || !Array.isArray(response.data) || response.data.length !== 1) {
    throw new OpenRouterEmbeddingError('OpenRouter returned an unexpected model or embedding count.');
  }
  const inputTokens = response.usage?.prompt_tokens;
  if (!Number.isSafeInteger(inputTokens) || (inputTokens as number) < 0) {
    throw new OpenRouterEmbeddingError('OpenRouter returned invalid token usage.');
  }
  const entry: unknown = response.data[0];
  if (!entry || typeof entry !== 'object' || (entry as { index?: unknown }).index !== 0) {
    throw new OpenRouterEmbeddingError('OpenRouter returned an invalid embedding index.');
  }
  const values = (entry as { embedding?: unknown }).embedding;
  if (!Array.isArray(values) || values.length !== OPENROUTER_EMBEDDING_DIMENSIONS
    || values.some((number) => typeof number !== 'number' || !Number.isFinite(number))
    || values.every((number) => number === 0)) {
    throw new OpenRouterEmbeddingError('OpenRouter returned an invalid embedding vector.');
  }
  return { model: OPENROUTER_EMBEDDING_MODEL, values: values as number[], inputTokens: inputTokens as number };
}

/** Server-side OpenRouter adapter. It never includes saved text or provider response bodies in errors. */
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly model = OPENROUTER_EMBEDDING_MODEL;
  readonly dimensions = OPENROUTER_EMBEDDING_DIMENSIONS;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(apiKey: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) throw new OpenRouterEmbeddingError('OpenRouter embeddings are not configured.', false);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000 || timeoutMs >= OWNER_WORK_LEASE_TTL_MS) {
      throw new OpenRouterEmbeddingError('OpenRouter embedding timeout must be between 1000 and 60000 milliseconds.');
    }
    this.apiKey = normalizedKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = timeoutMs;
  }

  async embed(text: string, _purpose: EmbeddingPurpose, signal?: AbortSignal): Promise<EmbeddingVector> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      const response = await this.fetchImpl(OPENROUTER_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENROUTER_EMBEDDING_MODEL,
          input: text,
          dimensions: OPENROUTER_EMBEDDING_DIMENSIONS,
          encoding_format: 'float',
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const rejectedWithoutUsage = response.status >= 400 && response.status < 500;
        throw new OpenRouterEmbeddingError(`OpenRouter embedding request failed (HTTP ${response.status}).`, !rejectedWithoutUsage);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new OpenRouterEmbeddingError('OpenRouter returned an unreadable embedding response.');
      }
      return parseEmbeddingResponse(payload);
    } catch (cause) {
      if (cause instanceof OpenRouterEmbeddingError) throw cause;
      if (controller.signal.aborted) throw new OpenRouterEmbeddingError('OpenRouter embedding request timed out.');
      throw new OpenRouterEmbeddingError('OpenRouter embedding request could not be completed.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }
}

export function createOpenRouterEmbeddingProvider(apiKey: string, options?: ConstructorParameters<typeof OpenRouterEmbeddingProvider>[1]): OpenRouterEmbeddingProvider {
  return new OpenRouterEmbeddingProvider(apiKey, options);
}
