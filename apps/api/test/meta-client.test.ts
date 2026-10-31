import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMetaModelClient,
  groupImageInputs,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MetaApiError,
} from '../src/ai/meta-client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sparkResponse(text = 'A clear description.', inputTokens = 120, outputTokens = 18) {
  return { output_text: text, usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
}

function wavHeader(): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes.set(Buffer.from('RIFF'), 0);
  bytes.set(Buffer.from('WAVE'), 8);
  return bytes;
}

test('image grouping respects a byte bound and rejects media above the current per-image limit', () => {
  const groups = groupImageInputs([
    { mime: 'image/jpeg', bytes: new Uint8Array(7) },
    { mime: 'image/png', bytes: new Uint8Array(4) },
    { mime: 'image/webp', bytes: new Uint8Array(6) },
  ], 10);
  assert.deepEqual(groups.map((group) => group.reduce((sum, image) => sum + image.bytes.byteLength, 0)), [7, 10]);
  assert.throws(() => groupImageInputs([{ mime: 'image/jpeg', bytes: new Uint8Array(MAX_IMAGE_BYTES + 1) }]), MetaApiError);
  assert.throws(() => groupImageInputs([{ mime: 'image/svg+xml' as never, bytes: new Uint8Array(1) }]), MetaApiError);
});

test('image analysis uses Muse Spark Responses API, inline data URLs, output bounds, and usage reporting', async () => {
  let requestUrl = '';
  let requestBody: Record<string, unknown> | undefined;
  let authorization = '';
  const client = createMetaModelClient({ apiKey: 'secret-test-key', fetcher: async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get('authorization') ?? '';
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse(sparkResponse());
  } });

  const [result] = await client.analyzeImages('Describe the content.', [
    { mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) },
    { mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  ]);

  assert.equal(requestUrl, 'https://api.meta.ai/v1/responses');
  assert.equal(authorization, 'Bearer secret-test-key');
  assert.equal(requestBody?.model, 'muse-spark-1.3');
  assert.equal(requestBody?.max_output_tokens, 700);
  const input = requestBody?.input as Array<Record<string, unknown>>;
  const content = input[0]?.content as Array<Record<string, unknown>>;
  assert.equal(input[0]?.type, 'message');
  assert.equal(content[0]?.type, 'input_text');
  assert.match(String(content[1]?.image_url), /^data:image\/jpeg;base64,/);
  assert.match(String(content[2]?.image_url), /^data:image\/png;base64,/);
  assert.deepEqual(result, { text: 'A clear description.', inputTokens: 120, outputTokens: 18 });
});

test('incomplete Meta analysis errors identify missing safe response fields', async () => {
  const cases = [
    [{ output_text: 'READY' }, 'Meta analysis response is missing token usage.'],
    [{ usage: { input_tokens: 10, output_tokens: 2 } }, 'Meta analysis response is missing output text.'],
    [{}, 'Meta analysis response is missing output text and token usage.'],
  ] as const;
  for (const [body, expectedMessage] of cases) {
    const client = createMetaModelClient({ apiKey: 'test-key', fetcher: async () => jsonResponse(body) });
    await assert.rejects(client.analyzeText('Synthetic response parsing test.'), (error: unknown) => {
      assert.ok(error instanceof MetaApiError);
      assert.equal(error.code, 'invalid_response');
      assert.equal(error.outcomeUnknown, true);
      assert.equal(error.message, expectedMessage);
      return true;
    });
  }
});

test('input-token preflight uses the exact Responses payload and reports input_tokens', async () => {
  let requestUrl = '';
  let requestBody: Record<string, unknown> | undefined;
  const client = createMetaModelClient({ apiKey: 'test-key', fetcher: async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({ input_tokens: 321 });
  } });
  const count = await client.countImageInputTokens('Describe this.', [{ mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) }]);
  assert.equal(requestUrl, 'https://api.meta.ai/v1/responses/input_tokens');
  assert.equal(requestBody?.model, 'muse-spark-1.3');
  assert.deepEqual(count, [321]);
});

test('Responses API sends strict structured output schemas for analysis requests', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const client = createMetaModelClient({ apiKey: 'test-key', fetcher: async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return jsonResponse(requests.length === 1 ? { input_tokens: 10 } : sparkResponse('{"summary":"A concise summary."}', 10, 4));
  } });
  const outputSchema = {
    name: 'saved_item_summary',
    schema: { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string', maxLength: 1200 } } },
  };

  await client.countTextInputTokens('Summarize this saved item.', outputSchema);
  await client.analyzeText('Summarize this saved item.', outputSchema);

  const expectedFormat = { type: 'json_schema', name: outputSchema.name, schema: outputSchema.schema, strict: true };
  assert.deepEqual((requests[0]?.text as { format: unknown }).format, expectedFormat);
  assert.deepEqual((requests[1]?.text as { format: unknown }).format, expectedFormat);
});

test('image analysis groups large carousels into multiple requests', async () => {
  let calls = 0;
  const client = createMetaModelClient({ apiKey: 'test-key', fetcher: async () => { calls += 1; return jsonResponse(sparkResponse()); } });
  // Seven 5 MiB assets exceed the 34 MiB raw limit after base64 expansion is accounted for.
  const images = Array.from({ length: 7 }, () => ({ mime: 'image/jpeg' as const, bytes: new Uint8Array(MAX_IMAGE_BYTES) }));
  const results = await client.analyzeImages('Describe each image.', images);
  assert.equal(calls, 2);
  assert.equal(results.length, 2);
});

test('video analysis sends bounded MP4 as input_video to the Responses API', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = createMetaModelClient({ apiKey: 'test-key', fetcher: async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'A person speaks to camera.' }] }], usage: { input_tokens: 400, output_tokens: 12 } });
  } });
  const result = await client.analyzeVideo('Describe this reel.', Buffer.from('mp4-bytes'));
  const input = requestBody?.input as Array<Record<string, unknown>>;
  const content = input[0]?.content as Array<Record<string, unknown>>;
  assert.equal((content[1]?.type), 'input_video');
  assert.match(String(content[1]?.video_url), /^data:video\/mp4;base64,/);
  assert.equal(result.text, 'A person speaks to camera.');
  assert.equal(result.inputTokens, 400);
  await assert.rejects(client.analyzeVideo('x', new Uint8Array(MAX_VIDEO_BYTES + 1)), MetaApiError);
});

test('Voice Transcribe sends multipart WAV settings and parses transcript usage metadata', async () => {
  let requestUrl = '';
  let headers = new Headers();
  let body = '';
  const client = createMetaModelClient({ apiKey: 'test-key', fetcher: async (input, init) => {
    requestUrl = String(input);
    headers = new Headers(init?.headers);
    body = Buffer.from(init?.body as Uint8Array).toString('latin1');
    return jsonResponse({ transcript: 'hello there', audioDurationMs: 2_000, sessionId: 'session-1' });
  } });

  const result = await client.transcribeWav(wavHeader(), 2);

  assert.equal(requestUrl, 'https://api.meta.ai/v1/asr/transcribe');
  assert.match(headers.get('content-type') ?? '', /^multipart\/form-data; boundary=rembr-meta-/);
  assert.match(body, /"model":"muse-voice-transcribe-1\.0","audioEncoding":"WAV","mode":"PUSH_TO_TALK"/);
  assert.match(body, /name="audio"; filename="audio\.wav"/);
  assert.match(body, /Content-Type: audio\/wav/);
  assert.deepEqual(result, { transcript: 'hello there', audioDurationMs: 2_000, sessionId: 'session-1' });
});

test('client refuses missing key and rejects unsupported audio/duration before network access', async () => {
  let calls = 0;
  const client = createMetaModelClient({ apiKey: null, fetcher: async () => { calls += 1; return jsonResponse(sparkResponse()); } });
  await assert.rejects(client.analyzeVideo('describe', new Uint8Array(0)), { code: 'invalid_input' });
  await assert.rejects(client.transcribeWav(wavHeader(), 601), { code: 'invalid_input' });
  await assert.rejects(client.analyzeImages('describe', [{ mime: 'image/jpeg', bytes: Buffer.from('x') }]), { code: 'not_configured' });
  assert.equal(calls, 0);
});

test('HTTP failures are sanitized and only documented 429 is marked retryable', async () => {
  for (const [status, expectedCode, retryable, outcomeUnknown] of [
    [429, 'rate_limited', true, false],
    [401, 'unauthorized', false, false],
    [503, 'provider_unavailable', false, true],
  ] as const) {
    const client = createMetaModelClient({ apiKey: 'never-echo-this-secret', fetcher: async () => jsonResponse({ error: 'private provider text' }, status) });
    await assert.rejects(client.analyzeVideo('describe', Buffer.from('x')), (error: unknown) => {
      assert.ok(error instanceof MetaApiError);
      assert.equal(error.code, expectedCode);
      assert.equal(error.retryable, retryable);
      assert.equal(error.outcomeUnknown, outcomeUnknown);
      assert.equal(error.message.includes('private provider text'), false);
      assert.equal(error.message.includes('never-echo-this-secret'), false);
      return true;
    });
  }
});

test('network failure reports an unknown outcome without exposing the key or retrying automatically', async () => {
  let calls = 0;
  const client = createMetaModelClient({ apiKey: 'never-echo-this-secret', fetcher: async () => { calls += 1; throw new Error('socket failed'); } });
  await assert.rejects(client.analyzeVideo('describe', Buffer.from('x')), (error: unknown) => {
    assert.ok(error instanceof MetaApiError);
    assert.equal(error.code, 'outcome_unknown');
    assert.equal(error.retryable, false);
    assert.equal(error.outcomeUnknown, true);
    assert.equal(error.message.includes('socket failed'), false);
    assert.equal(error.message.includes('never-echo-this-secret'), false);
    return true;
  });
  assert.equal(calls, 1);
});
