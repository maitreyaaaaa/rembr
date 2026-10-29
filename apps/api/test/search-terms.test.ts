import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenizeSearchTerms } from '../src/library/search-terms.js';

test('normalizes compatibility characters, case, punctuation, and duplicate terms', () => {
  assert.deepEqual(tokenizeSearchTerms('ＡＩ, café CAFÉ design-system'), ['ai', 'café', 'design', 'system']);
});

test('drops common English, Spanish, French, German, and Hindi function words', () => {
  assert.deepEqual(tokenizeSearchTerms('¿Qué guardé en la biblioteca de diseño?'), ['qué', 'guardé', 'biblioteca', 'diseño']);
  assert.deepEqual(tokenizeSearchTerms('Où sont mes notes de design?'), ['notes', 'design']);
  assert.deepEqual(tokenizeSearchTerms('Das ist ein neues Design und ein Archiv'), ['neues', 'design', 'archiv']);
  assert.deepEqual(tokenizeSearchTerms('मेरे संग्रह में बगीचा योजना'), ['मेरे', 'संग्रह', 'बगीचा', 'योजना']);
});

test('keeps all terms when a query contains only stop words and preserves scripts without listed stop words', () => {
  assert.deepEqual(tokenizeSearchTerms('the and'), ['the', 'and']);
  assert.deepEqual(tokenizeSearchTerms('東京 図書館'), ['東京', '図書館']);
});
