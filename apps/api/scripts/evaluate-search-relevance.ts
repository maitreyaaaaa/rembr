import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calculateRetrievalMetrics } from '../src/library/retrieval-evaluation.js';
import { parseRetrievalEvaluationDataset, type RetrievalEvaluationDataset } from '../src/library/retrieval-evaluation-dataset.js';
import { createPublicEvaluationReport, normalizeEvaluationApiUrl } from '../src/library/retrieval-evaluation-runner.js';
type SearchPage = { items: Array<{ id: string }>; nextCursor: string | null; hasMore: boolean };
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

function usage(): never {
  throw new Error('Usage: npm --workspace @rembr/api run evaluate-search -- <dataset.json> [--allow-remote]');
}

async function search(url: URL, cookie: string, query: string): Promise<{ rankedItemIds: string[]; truncated: boolean }> {
  const rankedItemIds: string[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('search', query);
    requestUrl.searchParams.set('sort', 'relevance');
    requestUrl.searchParams.set('matchMode', 'terms');
    requestUrl.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) requestUrl.searchParams.set('cursor', cursor);
    const response = await fetch(requestUrl, { headers: { cookie }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Search API returned HTTP ${response.status}. Check the local server and evaluation session.`);
    const pageResult = await response.json() as SearchPage;
    if (!Array.isArray(pageResult.items) || typeof pageResult.hasMore !== 'boolean') throw new Error('Search API returned an invalid response.');
    rankedItemIds.push(...pageResult.items.map(({ id }) => id));
    if (!pageResult.hasMore) return { rankedItemIds, truncated };
    if (!pageResult.nextCursor || cursors.has(pageResult.nextCursor)) throw new Error('Search API returned a missing or repeated cursor.');
    cursors.add(pageResult.nextCursor);
    cursor = pageResult.nextCursor;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return { rankedItemIds, truncated };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const allowRemote = args.includes('--allow-remote');
  const files = args.filter((arg) => !arg.startsWith('--'));
  if (files.length !== 1 || args.some((arg) => arg.startsWith('--') && arg !== '--allow-remote')) usage();
  const cookie = process.env.REMBR_EVAL_SESSION_COOKIE;
  if (!cookie?.trim()) throw new Error('Set REMBR_EVAL_SESSION_COOKIE in the process environment; it is never read from or written to the dataset.');

  const raw = await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), files[0]!), 'utf8');
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error('Evaluation dataset must be valid JSON.'); }
  const dataset: RetrievalEvaluationDataset = parseRetrievalEvaluationDataset(input);
  const apiUrl = normalizeEvaluationApiUrl(process.env.REMBR_EVAL_API_URL ?? 'http://127.0.0.1:4000', allowRemote);
  const results = [];
  for (const entry of dataset.queries) {
    const { rankedItemIds, truncated } = await search(apiUrl, cookie, entry.query);
    results.push({
      judgedItems: entry.judgments.length,
      retrievedItems: rankedItemIds.length,
      truncated,
      ...calculateRetrievalMetrics(rankedItemIds, entry.judgments),
    });
  }
  process.stdout.write(`${JSON.stringify(createPublicEvaluationReport(dataset.judgmentSource, results), null, 2)}\n`);
  if (dataset.judgmentSource === 'synthetic') process.stderr.write('Synthetic judgments are sanity checks only; do not report them as representative retrieval-quality evidence.\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation failed.'}\n`);
  process.exitCode = 1;
});
