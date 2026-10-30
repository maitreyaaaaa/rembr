import { randomUUID } from 'node:crypto';

const META_API_BASE = 'https://api.meta.ai/v1';
export const MUSE_SPARK_MODEL = 'muse-spark-1.3';
export const MUSE_VOICE_MODEL = 'muse-voice-transcribe-1.0';
export const MAX_INLINE_IMAGE_GROUP_BYTES = 34 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 10 * 60;
export const MAX_AUDIO_BODY_BYTES = 32 * 1024 * 1024;
export const MAX_OUTPUT_TOKENS = 700;
const DEFAULT_TIMEOUT_MS = 90_000;

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
export interface ImageInput { bytes: Uint8Array; mime: ImageMime }
export interface ModelTextResult { text: string; inputTokens: number; outputTokens: number }
export interface TranscriptionResult { transcript: string; audioDurationMs: number; sessionId: string }
export interface MetaJsonSchema { name: string; schema: Record<string, unknown> }

function structuredOutput(schema?: MetaJsonSchema) {
  return schema ? { text: { format: { type: 'json_schema', name: schema.name, schema: schema.schema, strict: true } } } : {};
}

export type MetaFailureCode = 'not_configured' | 'invalid_input' | 'rate_limited' | 'unauthorized'
  | 'provider_rejected' | 'provider_unavailable' | 'invalid_response' | 'outcome_unknown';

export class MetaApiError extends Error {
  constructor(
    readonly code: MetaFailureCode,
    message: string,
    readonly options: { status?: number; retryable: boolean; outcomeUnknown: boolean } = { retryable: false, outcomeUnknown: false },
  ) {
    super(message);
    this.name = 'MetaApiError';
  }

  get status(): number | undefined { return this.options.status; }
  get retryable(): boolean { return this.options.retryable; }
  get outcomeUnknown(): boolean { return this.options.outcomeUnknown; }
}

export interface MetaModelClientOptions {
  apiKey: string | null | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function requireKey(apiKey: string | null | undefined): string {
  const key = apiKey?.trim();
  if (!key) throw new MetaApiError('not_configured', 'Meta model analysis is not configured.', { retryable: false, outcomeUnknown: false });
  return key;
}

function validImageMime(mime: string): mime is ImageMime {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif';
}

export function groupImageInputs(images: ImageInput[], maxBytes = MAX_INLINE_IMAGE_GROUP_BYTES): ImageInput[][] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_INLINE_IMAGE_GROUP_BYTES) {
    throw new MetaApiError('invalid_input', 'The image request size limit is invalid.');
  }
  const groups: ImageInput[][] = [];
  let current: ImageInput[] = [];
  let currentBytes = 0;
  for (const image of images) {
    if (!validImageMime(image.mime) || image.bytes.byteLength < 1 || image.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new MetaApiError('invalid_input', 'An image is empty, unsupported, or exceeds 5 MiB.');
    }
    if (image.bytes.byteLength > maxBytes) throw new MetaApiError('invalid_input', 'An image exceeds the request size limit.');
    if (current.length && currentBytes + image.bytes.byteLength > maxBytes) {
      groups.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(image);
    currentBytes += image.bytes.byteLength;
  }
  if (current.length) groups.push(current);
  return groups;
}

function dataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function responseText(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as Record<string, unknown>;
  if (typeof response.output_text === 'string') return response.output_text;
  if (!Array.isArray(response.output)) return null;
  const pieces: string[] = [];
  for (const item of response.output) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Record<string, unknown>;
    if (block.type !== 'message' || !Array.isArray(block.content)) continue;
    for (const content of block.content) {
      if (!content || typeof content !== 'object') continue;
      const text = content as Record<string, unknown>;
      if (text.type === 'output_text' && typeof text.text === 'string') pieces.push(text.text);
    }
  }
  return pieces.length ? pieces.join('\n').trim() : null;
}

function tokenUsage(value: unknown): { inputTokens: number; outputTokens: number } | null {
  if (!value || typeof value !== 'object') return null;
  const usage = (value as Record<string, unknown>).usage;
  if (!usage || typeof usage !== 'object') return null;
  const raw = usage as Record<string, unknown>;
  const input = raw.input_tokens;
  const output = raw.output_tokens;
  if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || Number(input) < 0 || Number(output) < 0) return null;
  return { inputTokens: Number(input), outputTokens: Number(output) };
}

function countedTokens(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const count = (value as Record<string, unknown>).input_tokens;
  return Number.isSafeInteger(count) && Number(count) >= 0 ? Number(count) : null;
}

function transcription(value: unknown): TranscriptionResult | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (typeof body.transcript !== 'string' || !Number.isSafeInteger(body.audioDurationMs) || typeof body.sessionId !== 'string') return null;
  return { transcript: body.transcript, audioDurationMs: Number(body.audioDurationMs), sessionId: body.sessionId };
}

async function parseErrorResponse(response: Response): Promise<MetaApiError> {
  if (response.status === 429) {
    return new MetaApiError('rate_limited', 'Meta rate limit reached.', { status: 429, retryable: true, outcomeUnknown: false });
  }
  if (response.status === 401 || response.status === 403) {
    return new MetaApiError('unauthorized', 'Meta rejected the configured credentials.', { status: response.status, retryable: false, outcomeUnknown: false });
  }
  if (response.status >= 500) {
    return new MetaApiError('provider_unavailable', 'Meta could not complete the request.', { status: response.status, retryable: false, outcomeUnknown: true });
  }
  return new MetaApiError('provider_rejected', 'Meta rejected the analysis request.', { status: response.status, retryable: false, outcomeUnknown: false });
}

function networkError(error: unknown): MetaApiError {
  const timedOut = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
  return new MetaApiError(
    'outcome_unknown',
    timedOut ? 'Meta request timed out; its completion is unknown.' : 'Meta could not be reached; its completion is unknown.',
    { retryable: false, outcomeUnknown: true },
  );
}

function wavDurationIsValid(durationSeconds: number): boolean {
  return Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds <= MAX_AUDIO_SECONDS;
}

export function createMetaModelClient(options: MetaModelClientOptions) {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function postJson(path: string, body: unknown): Promise<unknown> {
    const key = requireKey(options.apiKey);
    let response: Response;
    try {
      response = await fetcher(`${META_API_BASE}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw networkError(error);
    }
    if (!response.ok) throw await parseErrorResponse(response);
    try { return await response.json() as unknown; }
    catch { throw new MetaApiError('invalid_response', 'Meta returned an invalid response.', { status: response.status, retryable: false, outcomeUnknown: true }); }
  }

  async function analyzeImages(prompt: string, images: ImageInput[], outputSchema?: MetaJsonSchema): Promise<ModelTextResult[]> {
    if (!prompt.trim() || !images.length) throw new MetaApiError('invalid_input', 'A prompt and at least one image are required.');
    const groups = groupImageInputs(images);
    const results: ModelTextResult[] = [];
    for (const group of groups) {
      const content = [
        { type: 'input_text', text: prompt.slice(0, 8_000) },
        ...group.map((image) => ({ type: 'input_image', image_url: dataUrl(image.bytes, image.mime) })),
      ];
      const body = {
        model: MUSE_SPARK_MODEL,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: [{ type: 'message', role: 'user', content }],
        ...structuredOutput(outputSchema),
      };
      if (Buffer.byteLength(JSON.stringify(body)) > 50 * 1024 * 1024) {
        throw new MetaApiError('invalid_input', 'The encoded image request exceeds 50 MiB.');
      }
      const raw = await postJson('/responses', body);
      const text = responseText(raw);
      const usage = tokenUsage(raw);
      if (text === null || usage === null) throw new MetaApiError('invalid_response', 'Meta returned an incomplete analysis response.', { retryable: false, outcomeUnknown: true });
      results.push({ text, ...usage });
    }
    return results;
  }

  async function countImageInputTokens(prompt: string, images: ImageInput[], outputSchema?: MetaJsonSchema): Promise<number[]> {
    if (!prompt.trim() || !images.length) throw new MetaApiError('invalid_input', 'A prompt and at least one image are required.');
    const groups = groupImageInputs(images);
    const counts: number[] = [];
    for (const group of groups) {
      const body = {
        model: MUSE_SPARK_MODEL,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: [{ type: 'message', role: 'user', content: [
          { type: 'input_text', text: prompt.slice(0, 8_000) },
          ...group.map((image) => ({ type: 'input_image', image_url: dataUrl(image.bytes, image.mime) })),
        ] }],
        ...structuredOutput(outputSchema),
      };
      if (Buffer.byteLength(JSON.stringify(body)) > 50 * 1024 * 1024) throw new MetaApiError('invalid_input', 'The encoded image request exceeds 50 MiB.');
      const count = countedTokens(await postJson('/responses/input_tokens', body));
      if (count === null) throw new MetaApiError('invalid_response', 'Meta returned an invalid input token count.', { retryable: false, outcomeUnknown: false });
      counts.push(count);
    }
    return counts;
  }

  async function analyzeVideo(prompt: string, bytes: Uint8Array, outputSchema?: MetaJsonSchema): Promise<ModelTextResult> {
    if (!prompt.trim() || bytes.byteLength < 1 || bytes.byteLength > MAX_VIDEO_BYTES) {
      throw new MetaApiError('invalid_input', 'The video is empty or exceeds 25 MiB.');
    }
    const body = {
      model: MUSE_SPARK_MODEL,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [{
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: prompt.slice(0, 8_000) },
          { type: 'input_video', video_url: dataUrl(bytes, 'video/mp4') },
        ],
      }],
      ...structuredOutput(outputSchema),
    };
    if (Buffer.byteLength(JSON.stringify(body)) > 50 * 1024 * 1024) {
      throw new MetaApiError('invalid_input', 'The encoded video request exceeds 50 MiB.');
    }
    const raw = await postJson('/responses', body);
    const text = responseText(raw);
    const usage = tokenUsage(raw);
    if (text === null || usage === null) throw new MetaApiError('invalid_response', 'Meta returned an incomplete analysis response.', { retryable: false, outcomeUnknown: true });
    return { text, ...usage };
  }

  async function countTextInputTokens(prompt: string, outputSchema?: MetaJsonSchema): Promise<number> {
    if (!prompt.trim()) throw new MetaApiError('invalid_input', 'A prompt is required.');
    const body = { model: MUSE_SPARK_MODEL, max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt.slice(0, 8_000) }] }],
      ...structuredOutput(outputSchema) };
    const count = countedTokens(await postJson('/responses/input_tokens', body));
    if (count === null) throw new MetaApiError('invalid_response', 'Meta returned an invalid input token count.', { retryable: false, outcomeUnknown: false });
    return count;
  }

  async function analyzeText(prompt: string, outputSchema?: MetaJsonSchema): Promise<ModelTextResult> {
    if (!prompt.trim()) throw new MetaApiError('invalid_input', 'A prompt is required.');
    const raw = await postJson('/responses', {
      model: MUSE_SPARK_MODEL,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt.slice(0, 8_000) }] }],
      ...structuredOutput(outputSchema),
    });
    const text = responseText(raw);
    const usage = tokenUsage(raw);
    if (text === null || usage === null) throw new MetaApiError('invalid_response', 'Meta returned an incomplete analysis response.', { retryable: false, outcomeUnknown: true });
    return { text, ...usage };
  }

  async function countVideoInputTokens(prompt: string, bytes: Uint8Array, outputSchema?: MetaJsonSchema): Promise<number> {
    if (!prompt.trim() || bytes.byteLength < 1 || bytes.byteLength > MAX_VIDEO_BYTES) {
      throw new MetaApiError('invalid_input', 'The video is empty or exceeds 25 MiB.');
    }
    const body = {
      model: MUSE_SPARK_MODEL,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [{ type: 'message', role: 'user', content: [
        { type: 'input_text', text: prompt.slice(0, 8_000) },
        { type: 'input_video', video_url: dataUrl(bytes, 'video/mp4') },
      ] }],
      ...structuredOutput(outputSchema),
    };
    if (Buffer.byteLength(JSON.stringify(body)) > 50 * 1024 * 1024) throw new MetaApiError('invalid_input', 'The encoded video request exceeds 50 MiB.');
    const count = countedTokens(await postJson('/responses/input_tokens', body));
    if (count === null) throw new MetaApiError('invalid_response', 'Meta returned an invalid input token count.', { retryable: false, outcomeUnknown: false });
    return count;
  }

  async function transcribeWav(bytes: Uint8Array, durationSeconds: number): Promise<TranscriptionResult> {
    if (!wavDurationIsValid(durationSeconds) || bytes.byteLength < 44 || bytes.byteLength > MAX_AUDIO_BODY_BYTES
      || Buffer.from(bytes.subarray(0, 4)).toString('ascii') !== 'RIFF'
      || Buffer.from(bytes.subarray(8, 12)).toString('ascii') !== 'WAVE') {
      throw new MetaApiError('invalid_input', 'Audio must be a WAV clip of at most 10 minutes and fit within 32 MiB.');
    }
    const key = requireKey(options.apiKey);
    const boundary = `rembr-meta-${randomUUID()}`;
    const requestPart = JSON.stringify({ model: MUSE_VOICE_MODEL, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${requestPart}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
      Buffer.from(bytes),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    if (body.byteLength > MAX_AUDIO_BODY_BYTES) throw new MetaApiError('invalid_input', 'The complete audio request exceeds 32 MiB.');
    let response: Response;
    try {
      response = await fetcher(`${META_API_BASE}/asr/transcribe`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, accept: 'application/json', 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw networkError(error);
    }
    if (!response.ok) throw await parseErrorResponse(response);
    try {
      const result = transcription(await response.json() as unknown);
      if (!result) throw new Error('invalid_transcription');
      return result;
    } catch {
      throw new MetaApiError('invalid_response', 'Meta returned an invalid transcription response.', { status: response.status, retryable: false, outcomeUnknown: true });
    }
  }

  return { analyzeImages, analyzeVideo, analyzeText, countTextInputTokens, countImageInputTokens, countVideoInputTokens, transcribeWav };
}
