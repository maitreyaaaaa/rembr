export interface RelevanceJudgment {
  itemId: string;
  grade: number;
}

export interface RetrievalMetrics {
  reciprocalRankAtK: number;
  ndcgAtK: number;
  recallAtK: number;
}

export function calculateRetrievalMetrics(
  rankedItemIds: readonly string[],
  judgments: readonly RelevanceJudgment[],
  k = 10,
): RetrievalMetrics {
  if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer.');
  const grades = new Map(judgments.map(({ itemId, grade }) => [itemId, grade]));
  if (grades.size !== judgments.length) throw new Error('Each item may have only one relevance judgment.');
  if (judgments.some(({ grade }) => !Number.isInteger(grade) || grade < 0 || grade > 3)) {
    throw new Error('Relevance grades must be integers from 0 to 3.');
  }

  const top = rankedItemIds.slice(0, k);
  const relevantCount = judgments.filter(({ grade }) => grade > 0).length;
  const firstRelevantIndex = top.findIndex((itemId) => (grades.get(itemId) ?? 0) > 0);
  const reciprocalRankAtK = firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1);
  const dcg = top.reduce((sum, itemId, index) => {
    const grade = grades.get(itemId) ?? 0;
    return sum + (2 ** grade - 1) / Math.log2(index + 2);
  }, 0);
  const idealDcg = judgments.map(({ grade }) => grade).sort((a, b) => b - a).slice(0, k)
    .reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
  const retrievedRelevantCount = top.filter((itemId) => (grades.get(itemId) ?? 0) > 0).length;

  return {
    reciprocalRankAtK,
    ndcgAtK: idealDcg === 0 ? 0 : dcg / idealDcg,
    recallAtK: relevantCount === 0 ? 0 : retrievedRelevantCount / relevantCount,
  };
}
