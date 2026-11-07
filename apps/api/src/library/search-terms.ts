// Deliberately small, language-agnostic stop-word set: these frequent function words
// are removed across English, Spanish, French, German, and Hindi without language detection.
const SEARCH_STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','by','did','do','does','for','from','how','i','in','is','it','me','my','of','on','or','that','the','this','to','was','what','when','where','which','who','why','with','you','your',
  'al','algo','como','con','de','del','el','en','es','la','las','lo','los','o','para','por','que','se','sin','su','un','una','y',
  'au','aux','avec','ce','ces','dans','des','du','elle','en','et','il','le','les','leur','mais','mes','ne','ou','où','par','pas','pour','qui','sont','sur','une',
  'aber','als','am','an','auf','aus','bei','das','der','die','ein','eine','einer','eines','für','ist','mit','nach','oder','sein','und','von','vor','zu',
  'का','की','के','को','से','में','पर','और','है','हैं','था','थी','थे','एक','यह','उस',
]);

export function tokenizeSearchTerms(value: string): string[] {
  const normalized = value.normalize('NFKC').toLowerCase();
  const tokens = [...new Set(normalized.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])];
  const meaningful = tokens.filter((token) => !SEARCH_STOP_WORDS.has(token));
  return meaningful.length ? meaningful : tokens.length ? tokens : normalized.trim() ? [normalized.trim()] : [];
}

/** Build a PostgreSQL word-boundary regex for terms one edit away from an ASCII query word. */
export function fuzzySearchPattern(value: string): string | null {
  const term = value.normalize('NFKC').toLowerCase();
  if (!/^[a-z]{4,18}$/.test(term)) return null;

  const alternatives = new Set<string>();
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  for (let index = 0; index < term.length; index += 1) {
    alternatives.add(`${term.slice(0, index)}${term.slice(index + 1)}`);
    const replacements = alphabet.replace(term[index]!, '');
    alternatives.add(`${term.slice(0, index)}[${replacements}]${term.slice(index + 1)}`);
    if (index + 1 < term.length && term[index] !== term[index + 1]) {
      alternatives.add(`${term.slice(0, index)}${term[index + 1]}${term[index]}${term.slice(index + 2)}`);
    }
  }
  for (let index = 0; index <= term.length; index += 1) {
    alternatives.add(`${term.slice(0, index)}[a-z]${term.slice(index)}`);
  }

  return `(^|[^[:alnum:]])(${[...alternatives].join('|')})([^[:alnum:]]|$)`;
}
