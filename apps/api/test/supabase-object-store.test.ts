import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseObjectStore } from '../src/storage/supabase-object-store.js';

test('Supabase storage creates a bucket when Storage reports NoSuchBucket with HTTP 400', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return requests.length === 1
      ? Response.json({ code: 'NoSuchBucket', message: 'Bucket not found' }, { status: 400 })
      : Response.json({ name: 'rembr-assets' }, { status: 200 });
  };

  try {
    await new SupabaseObjectStore('https://example.supabase.co', 'server-key', 'rembr-assets').initialize();
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.method, 'GET');
    assert.equal(requests[1]?.method, 'POST');
    assert.deepEqual(JSON.parse(requests[1]?.body ?? '{}'), {
      id: 'rembr-assets',
      name: 'rembr-assets',
      public: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Supabase storage does not create a bucket for unrelated HTTP 400 errors', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json({ code: 'InvalidRequest', message: 'Invalid request' }, { status: 400 });
  };

  try {
    await assert.rejects(
      new SupabaseObjectStore('https://example.supabase.co', 'server-key', 'rembr-assets').initialize(),
      /supabase_storage_bucket_check_400/,
    );
    assert.equal(requestCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
