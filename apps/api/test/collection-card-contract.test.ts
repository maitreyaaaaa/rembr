import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionItemToSavedItem, type CollectionItem } from '../../web/src/features/library/collection-items.js';

const collectionPage: CollectionItem = {
  id: 'page-1', kind: 'page', title: 'A saved page', description: 'A readable preview',
  url: 'https://example.com', text: 'Saved text', note: '', status: 'ready',
  createdAt: '2026-11-03T12:00:00.000Z', tags: ['design', 'research'],
  matchConfidence: 0.9, matchReason: 'Existing topic match',
};

test('collection page records become library cards without treating note strings as hydrated notes', () => {
  const item = collectionItemToSavedItem(collectionPage);
  assert.equal(item.note, undefined);
  assert.deepEqual(item.tags.map((tag) => tag.name), ['design', 'research']);
  assert.equal(item.textPreview, 'Saved text');
  assert.equal(item.updatedAt, collectionPage.createdAt);
  assert.equal(item.errorCode, null);
});

test('collection notes expose body text and empty asset/link arrays for card rendering', () => {
  const item = collectionItemToSavedItem({ ...collectionPage, kind: 'note', note: 'My research note', tags: [] });
  assert.deepEqual(item.note, { body: 'My research note', links: [], assets: [] });
  assert.equal(item.note?.assets.find((asset) => asset.mime.startsWith('image/')), undefined);
  assert.deepEqual(item.tags, []);
});
