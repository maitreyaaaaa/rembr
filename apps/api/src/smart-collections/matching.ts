function tokens(value: string): string[] {
  return value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

function inflections(word: string): Set<string> {
  const forms = new Set([word]);
  if (!/^[a-z]+$/.test(word)) return forms;

  if (/[^aeiou]y$/.test(word)) {
    const stem = word.slice(0, -1);
    forms.add(`${stem}ies`);
    forms.add(`${stem}ied`);
  } else {
    forms.add(/(?:s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`);
    if (word.endsWith('e')) {
      forms.add(`${word}d`);
      forms.add(`${word.slice(0, -1)}ing`);
    } else {
      forms.add(`${word}ed`);
      forms.add(`${word}ing`);
      if (/[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]$/.test(word)) {
        const last = word.at(-1)!;
        forms.add(`${word}${last}ed`);
        forms.add(`${word}${last}ing`);
      }
    }
  }
  return forms;
}

function includesPhrase(text: string[], phrase: string[]): boolean {
  if (!phrase.length || phrase.length > text.length) return false;
  const forms = phrase.map(inflections);
  for (let start = 0; start <= text.length - phrase.length; start += 1) {
    if (forms.every((choices, index) => choices.has(text[start + index]!))) return true;
  }
  return false;
}

export function matchingRuleTerms(text: string, terms: readonly string[]): string[] {
  const textTokens = tokens(text);
  return terms.filter((term) => includesPhrase(textTokens, tokens(term)));
}
