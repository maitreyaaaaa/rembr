export const MAX_TAGS_PER_ITEM = 5;

const genericHashtags = new Set([
  'explore', 'explorepage', 'fyp', 'followme', 'followforfollow', 'f4f',
  'likeforlike', 'likeforlikes', 'l4l', 'instagood', 'instagram', 'reels',
  'photooftheday', 'picoftheday', 'viral', 'trending',
]);
const usefulShortTags = new Set(['ai', 'ux', 'ui', 'hr', 'ml', 'qa']);

/** Keep specific source hashtags, in their original order, and discard obvious noise. */
export function curateHashtags(value: unknown, limit = MAX_TAGS_PER_ITEM): string[] {
  if (!Array.isArray(value) || limit < 1) return [];

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const display = candidate.trim().replace(/^#/, '').slice(0, 40);
    const normalized = display.toLocaleLowerCase('en-US');
    if ((normalized.length < 3 && !usefulShortTags.has(normalized)) || !/\p{L}{2}/u.test(normalized)) continue;
    if (/\p{N}/u.test(normalized)) continue;
    if (/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(normalized) || genericHashtags.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(display);
    if (tags.length === limit) break;
  }
  return tags;
}
