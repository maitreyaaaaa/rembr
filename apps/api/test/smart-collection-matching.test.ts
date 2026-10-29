import assert from 'node:assert/strict';
import test from 'node:test';
import { matchingRuleTerms } from '../src/smart-collections/matching.js';

test('Smart Collection category terms require complete tokens but allow punctuation and hyphens', () => {
  assert.deepEqual(matchingRuleTerms('Cartography and parties are not artistic references.', ['art']), []);
  assert.deepEqual(matchingRuleTerms('Smart-art archive and Art museum', ['art']), ['art']);
});

test('Smart Collection category phrases match adjacent tokens across punctuation', () => {
  assert.deepEqual(matchingRuleTerms('A design-system article.', ['design system']), ['design system']);
  assert.deepEqual(matchingRuleTerms('Designer system notes.', ['design system']), []);
});

test('Smart Collection category matching recognizes common English inflections', () => {
  assert.deepEqual(matchingRuleTerms('Dresses, shops, shopping, watches, and studies.', ['dress', 'shop', 'watch', 'study']), [
    'dress', 'shop', 'watch', 'study',
  ]);
});

test('Smart Collection category matching applies Unicode compatibility normalization', () => {
  assert.deepEqual(matchingRuleTerms('ＦＩＧＭＡ design system', ['figma', 'design system']), ['figma', 'design system']);
});
