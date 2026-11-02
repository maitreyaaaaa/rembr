import assert from 'node:assert/strict';
import { test } from 'node:test';
import { curateHashtags } from '../src/organization/tag-policy.js';

test('curated hashtags drop obvious noise, deduplicate, and stay within five', () => {
  assert.deepEqual(curateHashtags([
    '000c18', 'instagram', '10', 'ai', 'businessintelligence', 'coldcalls', 'salesstrategy',
    'closingdeals', 'entrepreneurmindset', 'extratag', 'businessintelligence',
  ]), [
    'ai', 'businessintelligence', 'coldcalls', 'salesstrategy', 'closingdeals',
  ]);
});
