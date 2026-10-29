const SEARCH_STOP_WORDS = new Set(['a','an','and','are','as','at','be','by','did','do','does','for','from','how','i','in','is','it','me','my','of','on','or','that','the','this','to','was','what','when','where','which','who','why','with','you','your']);

export function tokenizeSearchTerms(value: string): string[] {
  const normalized = value.normalize('NFKC').toLowerCase();
  const tokens = [...new Set(normalized.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])];
  const meaningful = tokens.filter((token) => !SEARCH_STOP_WORDS.has(token));
  return meaningful.length ? meaningful : tokens.length ? tokens : normalized.trim() ? [normalized.trim()] : [];
}
