import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlatformExports } from '../src/imports/parser.js';

test('Phase 3 parses Instagram saved posts only from recognized export filenames', () => {
  const bytes = Buffer.from('<html><a href="https://www.instagram.com/p/ABC123/">Saved caption</a></html>');
  const accepted = parsePlatformExports([{ name: 'saved_posts.html', bytes }]);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.platform, 'instagram');
  assert.equal(accepted[0]?.url, 'https://www.instagram.com/p/ABC123/');
  assert.equal(accepted[0]?.title, 'Saved caption');
  assert.deepEqual(parsePlatformExports([{ name: 'unrelated.html', bytes }]), []);
});

test('Pinterest canonicalization rejects lookalike hosts and direct TXT files', () => {
  const csv = Buffer.from('url,title\nhttps://www.pinterest.com/pin/12345/,Pin title\nhttps://notpinterest.com/pin/777/,bad\n');
  const items = parsePlatformExports([{ name: 'pins.csv', bytes: csv }]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.url, 'https://www.pinterest.com/pin/12345/');
  assert.equal(items[0]?.title, 'Pin title');
  assert.deepEqual(parsePlatformExports([{ name: 'pins.txt', bytes: Buffer.from('https://www.pinterest.com/pin/12345/') }]), []);
});

test('X CSV parser accepts quoted multiline text and canonicalizes numeric status URLs', () => {
  const csv = Buffer.from('tweet_url,text\nhttps://twitter.com/artist/status/987654,"first line\nsecond, line"\n');
  const items = parsePlatformExports([{ name: 'bookmarks.csv', bytes: csv }]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.url, 'https://x.com/i/status/987654');
  assert.equal(items[0]?.title, 'first line\nsecond, line');
});

test('X text imports require recognized bookmark naming and retain only status URLs', () => {
  const bytes = Buffer.from('https://x.com/mira/status/12345\nhttps://x.com/home');
  const items = parsePlatformExports([{ name: 'Bookmarks.txt', bytes }]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.sourceId, '12345');
  assert.deepEqual(parsePlatformExports([{ name: 'pauch.csv', bytes: Buffer.from('url\nhttps://x.com/mira/status/12345') }]), []);
});
