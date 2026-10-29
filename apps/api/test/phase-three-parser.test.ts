import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { parsePlatformExports, parsePlatformExportsDetailed } from '../src/imports/parser.js';
import { repairMisdecodedUtf8 } from '../src/items/text-normalization.js';

function crc32(buffer: Buffer): number {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<{ name: string; text: string }>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const data = Buffer.from(entry.text); const compressed = deflateRawSync(data); const checksum = crc32(data);
    const local = Buffer.alloc(30 + name.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    locals.push(local, compressed);
    const central = Buffer.alloc(46 + name.length); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(localOffset, 42); name.copy(central, 46);
    centrals.push(central); localOffset += local.length + compressed.length;
  }
  const centralBytes = Buffer.concat(centrals); const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(centralBytes.length, 12); eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

test('Phase 3 parses Instagram saved posts only from recognized export filenames', () => {
  const bytes = Buffer.from('<html><a href="https://www.instagram.com/p/ABC123/">Saved caption</a></html>');
  const accepted = parsePlatformExports([{ name: 'saved_posts.html', bytes }]);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.platform, 'instagram');
  assert.equal(accepted[0]?.url, 'https://www.instagram.com/p/ABC123/');
  assert.equal(accepted[0]?.title, 'Saved caption');
  assert.throws(() => parsePlatformExports([{ name: 'unrelated.html', bytes }]), { code: 'empty_export' });
});

test('Instagram JSON retains caption, owner, saved date, hashtags, and collection membership', () => {
  const bytes = Buffer.from(JSON.stringify({ saved_saved_collections: [{ title: 'AI Tools', items: [{
    media: [{ uri: 'http://m.instagram.com/reels/ABC999/' }],
    string_map_data: {
      Caption: { value: 'Useful post #AI' }, Name: { value: 'Mira' }, Username: { value: 'mira_dev' },
      'Saved on': { timestamp: 1_700_000_000 }, 'Collection name': { value: 'AI Tools' },
    },
  }] }] }));
  const [item] = parsePlatformExports([{ name: 'saved_collections.json', bytes }]);
  assert.equal(item?.url, 'https://www.instagram.com/reel/ABC999/');
  assert.equal(item?.description, 'Useful post #AI');
  assert.equal(item?.metadata.ownerName, 'Mira');
  assert.equal(item?.metadata.ownerUsername, 'mira_dev');
  assert.deepEqual(item?.metadata.hashtags, ['ai']);
  assert.deepEqual(item?.metadata.collections, ['AI Tools']);
  assert.equal(item?.metadata.savedAt, new Date(1_700_000_000_000).toISOString());
});

test('Instagram JSON maps the current label_values export shape and record timestamp', () => {
  const bytes = Buffer.from(JSON.stringify([{ fbid: 'ignored', timestamp: 1_700_000_001, media: [], label_values: [
    { label: 'URL', href: 'https://www.instagram.com/p/CURRENT123/' },
    { label: 'Caption', value: 'A saved caption #reading' },
    { label: 'Title', value: 'A saved caption #reading' },
  ] }]));
  const [item] = parsePlatformExports([{ name: 'your_instagram_activity/saved/saved_posts.json', bytes }]);
  assert.equal(item?.url, 'https://www.instagram.com/p/CURRENT123/');
  assert.equal(item?.title, 'A saved caption #reading');
  assert.equal(item?.description, 'A saved caption #reading');
  assert.deepEqual(item?.metadata.hashtags, ['reading']);
  assert.equal(item?.metadata.savedAt, new Date(1_700_000_001_000).toISOString());
});

test('Instagram JSON repairs UTF-8 captions misdecoded as Latin-1 without changing ordinary Unicode', () => {
  const bytes = Buffer.from(JSON.stringify([{ media: [], label_values: [
    { label: 'URL', href: 'https://www.instagram.com/p/MOJIBAKE01/' },
    { label: 'Caption', value: 'I\u00e2\u0080\u0099ll send you \u00f0\u009f\u0098\u0080 — Caf\u00c3\u00a9 東京' },
  ] }]));
  const [item] = parsePlatformExports([{ name: 'saved_posts.json', bytes }]);
  assert.equal(item?.title, 'I’ll send you 😀 — Café 東京');
  assert.equal(item?.description, 'I’ll send you 😀 — Café 東京');
  assert.equal(repairMisdecodedUtf8('Already correct: Café 東京'), 'Already correct: Café 東京');
});

test('Instagram import orders deduplicated posts by saved date, keeps unknown dates stable, and reports the cap', () => {
  const savedPost = (id: string, savedAt?: number, url = `https://www.instagram.com/p/${id}/`) => ({
    string_map_data: {
      URL: { href: url },
      Caption: { value: `Caption ${id} #original` },
      ...(savedAt === undefined ? {} : { 'Saved on': { timestamp: savedAt } }),
    },
  });
  const oldest = savedPost('OLDER001', 1_700_000_000);
  const duplicateNewer = savedPost('OLDER001', 1_700_000_300, 'https://www.instagram.com/p/OLDER001/?igsh=duplicate');
  const equalA = savedPost('EQUAL001', 1_700_000_200);
  const equalB = savedPost('EQUAL002', 1_700_000_200);
  const undatedA = savedPost('UNDATED1');
  const undatedB = savedPost('UNDATED2');
  const bytes = Buffer.from(JSON.stringify([oldest, equalA, undatedA, duplicateNewer, equalB, undatedB]));

  const result = parsePlatformExportsDetailed([{ name: 'saved_posts.json', bytes }]);

  assert.equal(result.instagramSkippedCount, 0);
  assert.deepEqual(result.items.map((item) => item.sourceId), ['OLDER001', 'EQUAL001', 'EQUAL002', 'UNDATED1', 'UNDATED2']);
  assert.deepEqual(result.items.map((item) => item.sourceOrder), [0, 1, 2, 3, 4]);
  assert.equal(result.items[0]?.metadata.savedAt, new Date(1_700_000_300_000).toISOString());
  assert.deepEqual(result.items[0]?.metadata.hashtags, ['original']);
});

test('Instagram parser returns only the 300 newest distinct saved posts and leaves invalid or missing dates after dated posts', () => {
  const savedPosts = Array.from({ length: 302 }, (_, index) => ({
    string_map_data: {
      URL: { href: `https://www.instagram.com/p/CAP${String(index).padStart(4, '0')}/` },
      Caption: { value: `Post ${index}` },
      'Saved on': { timestamp: 1_700_000_000 + index },
    },
  }));
  (savedPosts[300]!.string_map_data as Record<string, { timestamp?: unknown }>)['Saved on'] = { timestamp: 'not a date' };
  delete (savedPosts[301]!.string_map_data as Record<string, unknown>)['Saved on'];
  const bytes = Buffer.from(JSON.stringify(savedPosts));

  const result = parsePlatformExportsDetailed([{ name: 'saved_posts.json', bytes }]);

  assert.equal(result.items.length, 300);
  assert.equal(result.instagramSkippedCount, 2);
  assert.equal(result.items[0]?.sourceId, 'CAP0299');
  assert.equal(result.items[299]?.sourceId, 'CAP0000');
  assert.deepEqual(result.items.map((item) => item.sourceOrder), Array.from({ length: 300 }, (_, index) => index));
  assert.ok(result.items.every((item) => item.sourceId !== 'CAP0300' && item.sourceId !== 'CAP0301'));
});

test('the Instagram cap does not change Pinterest or X ordering and limits', () => {
  const rows = Array.from({ length: 305 }, (_, index) => `https://www.pinterest.com/pin/${index + 1}/,Pin ${index + 1}`);
  const result = parsePlatformExportsDetailed([
    { name: 'pins.csv', bytes: Buffer.from(`url,title\n${rows.join('\n')}\n`) },
    { name: 'bookmarks.csv', bytes: Buffer.from('tweet_url,text\nhttps://x.com/mira/status/900001,first\nhttps://x.com/mira/status/900002,second\n') },
  ]);
  assert.equal(result.instagramSkippedCount, 0);
  assert.equal(result.items.length, 307);
  assert.deepEqual(result.items.slice(0, 2).map((item) => item.sourceId), ['1', '2']);
  assert.deepEqual(result.items.slice(-2).map((item) => item.sourceId), ['900001', '900002']);
});

test('Pinterest canonicalization rejects lookalike hosts and direct TXT files', () => {
  const csv = Buffer.from('url,title\nhttps://www.pinterest.com/pin/12345/,Pin title\nhttps://notpinterest.com/pin/777/,bad\n');
  const items = parsePlatformExports([{ name: 'pins.csv', bytes: csv }]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.url, 'https://www.pinterest.com/pin/12345/');
  assert.equal(items[0]?.title, 'Pin title');
  assert.throws(() => parsePlatformExports([{ name: 'pins.txt', bytes: Buffer.from('https://www.pinterest.com/pin/12345/') }]), { code: 'unsupported_export_file' });
});

test('imports reject exports that exceed the bounded saved-link count', () => {
  const rows = Array.from({ length: 5_001 }, (_, index) => `https://www.pinterest.com/pin/${index + 1}/,Pin ${index + 1}`);
  const bytes = Buffer.from(`url,title\n${rows.join('\n')}\n`);
  assert.throws(() => parsePlatformExports([{ name: 'pins.csv', bytes }]), { code: 'item_count_limit' });
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
  const sourceCompatibility = parsePlatformExports([{ name: 'pauch.csv', bytes: Buffer.from('url\nhttps://x.com/mira/status/54321') }]);
  assert.equal(sourceCompatibility[0]?.url, 'https://x.com/i/status/54321');
});

test('ZIP exports validate entries and parse recognized nested files', () => {
  const archive = zip([{ name: 'your_activity/saved_posts.html', text: '<a href="https://instagram.com/p/ZIP123/">Zip save</a>' }, { name: 'unrelated.txt', text: 'ignore me' }]);
  const items = parsePlatformExports([{ name: 'export.zip', bytes: archive }]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.url, 'https://www.instagram.com/p/ZIP123/');
});

test('ZIP exports reject traversal paths and integrity corruption', () => {
  const traversal = zip([{ name: '../saved_posts.html', text: '<a href="https://instagram.com/p/BAD123/">x</a>' }]);
  assert.throws(() => parsePlatformExports([{ name: 'export.zip', bytes: traversal }]), { code: 'invalid_archive_path' });
  const corrupt = zip([{ name: 'saved_posts.html', text: '<a href="https://instagram.com/p/BAD123/">x</a>' }]);
  const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); corrupt.writeUInt32LE(0, central + 16);
  assert.throws(() => parsePlatformExports([{ name: 'export.zip', bytes: corrupt }]), { code: 'invalid_archive' });
});
