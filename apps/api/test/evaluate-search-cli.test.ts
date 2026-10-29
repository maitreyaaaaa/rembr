import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('search evaluation CLI pages a localhost API and omits private dataset text from its report', async () => {
  const irrelevantId = '11111111-1111-4111-8111-111111111111';
  const relevantId = '22222222-2222-4222-8222-222222222222';
  const otherRelevantId = '33333333-3333-4333-8333-333333333333';
  let pageCount = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    assert.equal(url.pathname, '/api/items');
    assert.equal(url.searchParams.get('search'), 'private query sentinel');
    assert.equal(request.headers.cookie, 'local-session=mock');
    pageCount += 1;
    response.setHeader('content-type', 'application/json');
    if (url.searchParams.get('cursor')) {
      assert.equal(url.searchParams.get('cursor'), 'next-page');
      response.end(JSON.stringify({ items: [{ id: otherRelevantId }], nextCursor: null, hasMore: false }));
      return;
    }
    assert.equal(url.searchParams.get('limit'), '100');
    response.end(JSON.stringify({ items: [{ id: irrelevantId }, { id: relevantId }], nextCursor: 'next-page', hasMore: true }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'rembr-search-eval-'));
  const datasetPath = join(temporaryRoot, 'labels.json');
  const dataset = {
    schemaVersion: 1,
    judgmentSource: 'human-reviewed',
    description: 'private description sentinel',
    queries: [{
      id: 'private-query-id-sentinel',
      query: 'private query sentinel',
      judgments: [
        { itemId: irrelevantId, grade: 0 },
        { itemId: relevantId, grade: 3 },
        { itemId: otherRelevantId, grade: 1 },
      ],
    }],
  };
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await writeFile(datasetPath, JSON.stringify(dataset), 'utf8');
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveResult, rejectResult) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/evaluate-search-relevance.ts', datasetPath], {
        cwd: apiRoot,
        env: { ...process.env, INIT_CWD: apiRoot, REMBR_EVAL_API_URL: `http://127.0.0.1:${address.port}`, REMBR_EVAL_SESSION_COOKIE: 'local-session=mock' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
      const timer = setTimeout(() => child.kill(), 15_000);
      child.once('error', rejectResult);
      child.once('close', (code) => {
        clearTimeout(timer);
        resolveResult({ code, stdout, stderr });
      });
    });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout) as { judgmentSource: string; perQuery: Array<Record<string, unknown>> };
    assert.equal(pageCount, 2);
    assert.equal(report.judgmentSource, 'human-reviewed');
    assert.deepEqual(report.perQuery[0], {
      queryIndex: 1, judgedItems: 3, retrievedItems: 3, truncated: false,
      mrrAt10: 0.5, ndcgAt10: (7 / Math.log2(3) + 1 / Math.log2(4)) / (7 + 1 / Math.log2(3)), recallAt10: 1,
    });
    for (const privateValue of ['private query sentinel', 'private-query-id-sentinel', 'private description sentinel', irrelevantId, relevantId, otherRelevantId]) {
      assert.equal(result.stdout.includes(privateValue), false);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});
