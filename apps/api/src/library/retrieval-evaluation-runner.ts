import type { RetrievalEvaluationDataset } from './retrieval-evaluation-dataset.js';
import type { RetrievalMetrics } from './retrieval-evaluation.js';

export interface EvaluationQueryResult extends RetrievalMetrics {
  judgedItems: number;
  retrievedItems: number;
  truncated: boolean;
}

export function normalizeEvaluationApiUrl(value: string, allowRemote: boolean): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Evaluation API URL must be HTTP(S) without embedded credentials.');
  const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (!localHost && !allowRemote) throw new Error('Remote API use requires the explicit --allow-remote flag.');
  if (!localHost && url.protocol !== 'https:') throw new Error('Remote API use requires HTTPS so the session cookie is encrypted in transit.');
  url.pathname = '/api/items';
  url.search = '';
  return url;
}

export function createPublicEvaluationReport(
  judgmentSource: RetrievalEvaluationDataset['judgmentSource'],
  results: readonly EvaluationQueryResult[],
) {
  const mean = (key: keyof RetrievalMetrics) => results.reduce((sum, result) => sum + result[key], 0) / results.length;
  return {
    judgmentSource,
    evaluatedQueries: results.length,
    truncatedQueries: results.filter(({ truncated }) => truncated).length,
    cutoff: 10,
    macroAverage: {
      mrrAt10: mean('reciprocalRankAtK'),
      ndcgAt10: mean('ndcgAtK'),
      recallAt10: mean('recallAtK'),
    },
    perQuery: results.map(({ judgedItems, retrievedItems, truncated, reciprocalRankAtK, ndcgAtK, recallAtK }, index) => ({
      queryIndex: index + 1,
      judgedItems,
      retrievedItems,
      truncated,
      mrrAt10: reciprocalRankAtK,
      ndcgAt10: ndcgAtK,
      recallAt10: recallAtK,
    })),
  };
}
