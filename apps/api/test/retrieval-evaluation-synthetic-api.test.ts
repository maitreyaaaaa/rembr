import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';

const origin = 'http://127.0.0.1:5173';

async function register(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'synthetic-eval@example.test', password: 'correct-horse-battery-staple' }),
  });
  assert.equal(response.status, 201);
  return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
}

async function setProfile(baseUrl: string, cookie: string) {
  const response = await fetch(`${baseUrl}/api/profile`, {
    method: 'PATCH',
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'synthetic_eval' }),
  });
  assert.equal(response.status, 200);
}

async function createNote(baseUrl: string, cookie: string, title: string, body: string): Promise<string> {
  const form = new FormData();
  form.set('title', title);
  form.set('body', body);
  const response = await fetch(`${baseUrl}/api/notes`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  assert.equal(response.status, 201);
  return (await response.json() as { item: { id: string } }).item.id;
}

function runEvaluationCli(apiUrl: string, cookie: string, datasetPath: string, apiRoot: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/evaluate-search-relevance.ts', datasetPath], {
      cwd: apiRoot,
      env: { ...process.env, INIT_CWD: apiRoot, REMBR_EVAL_API_URL: apiUrl, REMBR_EVAL_SESSION_COOKIE: cookie },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill(), 30_000);
    child.once('error', rejectResult);
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolveResult({ code, stdout, stderr });
    });
  });
}

test('synthetic multi-query qrels run through the owner-scoped API and evaluation CLI', async () => {
  const database = await createTestDatabase();
  const assetsPath = await mkdtemp(join(tmpdir(), 'rembr-search-eval-assets-'));
  const app = createApp(database, {
    assetDirectory: assetsPath,
    validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'rembr-search-qrels-'));
  const datasetPath = join(temporaryRoot, 'synthetic-qrels.json');
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const cookie = await register(baseUrl);
    await setProfile(baseUrl, cookie);

    const fixture = [
      { id: 'forestTitle', title: 'Forest restoration', body: 'A focused guide to restoring native forests.' },
      { id: 'forestBody', title: 'Woodland field notes', body: 'Forest restoration takes patient habitat work.' },
      { id: 'recipeTitle', title: 'Pasta sauce recipe', body: 'Tomato, basil, and olive oil.' },
      { id: 'recipeBody', title: 'Weeknight cooking notes', body: 'This pasta sauce recipe uses ripe tomatoes.' },
      { id: 'securityTitle', title: 'Security audit', body: 'A practical review checklist for application security.' },
      { id: 'securityBody', title: 'Release review notes', body: 'The security audit should check permissions and logging.' },
      { id: 'watercolorTitle', title: 'Beginner watercolor', body: 'A first set of watercolor exercises.' },
      { id: 'watercolorBody', title: 'Painting practice', body: 'Beginner watercolor studies with simple washes.' },
      { id: 'unrelated', title: 'City travel journal', body: 'Museum visits and train connections.' },
    ] as const;
    const ids: Record<string, string> = {};
    for (const item of fixture) ids[item.id] = await createNote(baseUrl, cookie, item.title, item.body);

    const dataset = {
      schemaVersion: 1,
      judgmentSource: 'synthetic',
      description: 'Nine synthetic notes and four hand-authored sanity queries; not a representative library.',
      queries: [
        { id: 'q-forest', query: 'forest restoration', judgments: [{ itemId: ids.forestTitle!, grade: 3 }, { itemId: ids.forestBody!, grade: 1 }, { itemId: ids.unrelated!, grade: 0 }] },
        { id: 'q-recipe', query: 'pasta sauce recipe', judgments: [{ itemId: ids.recipeTitle!, grade: 3 }, { itemId: ids.recipeBody!, grade: 1 }, { itemId: ids.unrelated!, grade: 0 }] },
        { id: 'q-security', query: 'security audit', judgments: [{ itemId: ids.securityTitle!, grade: 3 }, { itemId: ids.securityBody!, grade: 1 }, { itemId: ids.unrelated!, grade: 0 }] },
        { id: 'q-watercolor', query: 'beginner watercolor', judgments: [{ itemId: ids.watercolorTitle!, grade: 3 }, { itemId: ids.watercolorBody!, grade: 1 }, { itemId: ids.unrelated!, grade: 0 }] },
      ],
    };
    await writeFile(datasetPath, JSON.stringify(dataset), 'utf8');

    const result = await runEvaluationCli(baseUrl, cookie, datasetPath, apiRoot);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /Synthetic judgments are sanity checks only/);
    const report = JSON.parse(result.stdout) as {
      judgmentSource: string;
      evaluatedQueries: number;
      macroAverage: { mrrAt10: number; ndcgAt10: number; recallAt10: number };
      perQuery: Array<{ mrrAt10: number; ndcgAt10: number; recallAt10: number }>;
    };
    assert.equal(report.judgmentSource, 'synthetic');
    assert.equal(report.evaluatedQueries, 4);
    assert.deepEqual(report.perQuery.map(({ mrrAt10, ndcgAt10, recallAt10 }) => ({ mrrAt10, ndcgAt10, recallAt10 })),
      Array.from({ length: 4 }, () => ({ mrrAt10: 1, ndcgAt10: 1, recallAt10: 1 })));
    assert.deepEqual(report.macroAverage, { mrrAt10: 1, ndcgAt10: 1, recallAt10: 1 });
    assert.doesNotMatch(result.stdout, /forest restoration|pasta sauce recipe|security audit|beginner watercolor|q-forest/);
    assert.doesNotMatch(result.stdout, new RegExp(Object.values(ids).join('|')));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await database.close();
    await Promise.all([
      rm(assetsPath, { recursive: true, force: true }),
      rm(temporaryRoot, { recursive: true, force: true }),
    ]);
  }
});
