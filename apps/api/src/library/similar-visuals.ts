export interface SimilarVisualProfile {
  id: string;
  title: string;
  description?: string | null;
  visualDescription?: string | null;
  ocrText?: string | null;
  summary?: string | null;
  keywords?: string[];
  tags?: string[];
  collections?: string[];
  platform?: string | null;
  contentType?: string | null;
  hasImage?: boolean;
  createdAt?: string | null;
}

export interface SimilarVisualVector { itemId: string; model: string; embedding: number[] }

const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'being', 'can', 'could', 'from', 'has', 'have', 'into', 'its', 'just', 'more', 'not', 'one', 'only', 'over', 'post', 'save', 'saved', 'that', 'the', 'their', 'there', 'this', 'with', 'you', 'your']);

function tokenize(value: unknown): string[] {
  return [...new Set(String(value ?? '').toLocaleLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2 && !STOP_WORDS.has(part)))];
}

function overlap(left: string[], right: string[], weight: number): { score: number; matches: string[] } {
  if (!left.length || !right.length) return { score: 0, matches: [] };
  const rightSet = new Set(right);
  const matches = left.filter((value) => rightSet.has(value));
  return { score: (matches.length / (Math.sqrt(left.length * right.length) || 1)) * weight, matches };
}

function magnitude(vector: number[]): number { return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)); }

export function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  const leftMagnitude = magnitude(left); const rightMagnitude = magnitude(right);
  if (!leftMagnitude || !rightMagnitude) return 0;
  const dot = left.reduce((sum, value, index) => sum + value * right[index]!, 0);
  return dot / (leftMagnitude * rightMagnitude);
}

export function findSimilarVisuals(items: SimilarVisualProfile[], sourceId: string, vectors: SimilarVisualVector[], limit = 8) {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit) || 8));
  const source = items.find((item) => item.id === sourceId);
  if (!source) return [];
  const vectorByItem = new Map(vectors.map((value) => [value.itemId, value]));
  const sourceVector = vectorByItem.get(sourceId);
  const sourceText = tokenize([source.title, source.description, source.visualDescription, source.ocrText, source.summary].join(' '));
  const sourceVisual = tokenize([source.visualDescription, source.ocrText].join(' '));
  const sourceKeywords = [...new Set([...(source.keywords ?? []), ...(source.tags ?? []), ...(source.collections ?? [])].map((value) => value.toLocaleLowerCase()))];
  return items.filter((item) => item.id !== sourceId).map((item) => {
    const candidateText = tokenize([item.title, item.description, item.visualDescription, item.ocrText, item.summary].join(' '));
    const candidateVisual = tokenize([item.visualDescription, item.ocrText].join(' '));
    const candidateKeywords = [...new Set([...(item.keywords ?? []), ...(item.tags ?? []), ...(item.collections ?? [])].map((value) => value.toLocaleLowerCase()))];
    const visual = overlap(sourceVisual, candidateVisual, 2.4);
    const text = overlap(sourceText, candidateText, 1.2);
    const keywords = overlap(sourceKeywords, candidateKeywords, 1.8);
    let score = visual.score + text.score + keywords.score;
    if (source.hasImage && item.hasImage) score += 0.12;
    if (source.platform && source.platform === item.platform) score += 0.04;
    if (source.contentType && source.contentType === item.contentType) score += 0.03;
    let reason = visual.matches.length ? `Similar visual details: ${visual.matches.slice(0, 3).join(', ')}`
      : keywords.matches.length ? `Shared topics: ${keywords.matches.slice(0, 3).join(', ')}`
        : item.hasImage ? 'Another image-based save from your library.' : 'Related saved item.';
    const candidateVector = vectorByItem.get(item.id);
    const vectorScore = sourceVector && candidateVector && sourceVector.model === candidateVector.model
      ? cosineSimilarity(sourceVector.embedding, candidateVector.embedding) : 0;
    if (Number.isFinite(vectorScore) && vectorScore > 0) {
      score = Math.max(score, vectorScore * 1.35);
      reason = vectorScore >= 0.85 ? 'Looks very visually similar.' : 'Looks visually similar.';
    }
    const matched = visual.matches.length + text.matches.length + keywords.matches.length > 0 || vectorScore > 0;
    return { item, score, matched, reason, matchedVisualTerms: visual.matches.slice(0, 6), matchedTopics: keywords.matches.slice(0, 6) };
  }).filter((row) => row.matched && row.score >= 0.16)
    .sort((a, b) => b.score - a.score || String(b.item.createdAt ?? '').localeCompare(String(a.item.createdAt ?? '')))
    .slice(0, safeLimit)
    .map(({ item, score, reason, matchedVisualTerms, matchedTopics }) => ({
      itemId: item.id, similarity: { score: Number(Math.min(1, score).toFixed(3)), reason, matchedVisualTerms, matchedTopics },
    }));
}
