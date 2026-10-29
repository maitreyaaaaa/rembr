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
