import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestDatabase, type DatabaseHandle } from '../src/db/database.js';
import { createSmartCollectionService } from '../src/smart-collections/service.js';

async function fixture(run: (database: DatabaseHandle) => Promise<void>) {
  const database = await createTestDatabase();
  try {
    for (const owner of ['owner', 'other']) await database.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES (?,?,?,?)').run(owner, `${owner}@example.test`, 'fixture', new Date().toISOString());
    await addPage(database, 'one'); await addPage(database, 'two');
    await run(database);
  } finally { await database.close(); }
}

async function addPage(database: DatabaseHandle, id: string, owner = 'owner') {
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO saved_items(id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'ready',?,?)`).run(id, owner, `https://example.test/${id}`, `https://example.test/${id}`, id, 'Figma dashboard design system', now, now);
}

async function build(database: DatabaseHandle, owner = 'owner') {
  const service = createSmartCollectionService(database);
  await service.requestRefresh(owner);
  assert.equal(await service.processNextRefresh(owner), owner);
  return service;
}

test('stored collection reads do not generate work and survive service recreation', async () => fixture(async (database) => {
  const service = createSmartCollectionService(database);
  assert.deepEqual((await service.list('owner')).collections, []);
  assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM smart_collections').get<{ count: number }>())?.count, 0);
  await build(database);
  const first = await service.list('owner');
  const folder = first.collections.find((collection) => collection.slug === 'ui-inspiration')!;
  assert.equal(folder.itemCount, 2);
  assert.deepEqual((await service.listItems('owner', folder.id, '', 25)).items.map((item) => item.id).sort(), ['one', 'two']);
  const second = await createSmartCollectionService(database).list('owner');
  assert.deepEqual(second, first);
  assert.equal((await database.prepare('SELECT attempts FROM smart_collection_refresh_state WHERE owner_id=?').get<{ attempts: number }>('owner'))?.attempts, 1);
  assert.deepEqual((await service.list('other')).collections, []);
  await assert.rejects(service.listItems('other', folder.id, '', 25), /not found/);
}));

test('save and bulk import-style writes coalesce into one durable refresh and retain preferences/corrections', async () => fixture(async (database) => {
  const service = await build(database);
  const folder = (await service.list('owner')).collections.find((collection) => collection.slug === 'ui-inspiration')!;
  await service.update('owner', folder.id, { name: 'My references', color: '#FF6A00', pinned: true });
  await service.setItemOverride('owner', folder.id, 'one', 'exclude');
  assert.equal((await service.list('owner')).refresh.status, 'ready');
  await database.transaction(async () => { for (let index = 0; index < 12; index++) await addPage(database, `bulk-${index}`); })();
  const stale = await service.list('owner');
  assert.equal(stale.refresh.status, 'pending');
  assert.equal(stale.collections.find((collection) => collection.id === folder.id)?.itemCount, 1);
  assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM smart_collection_refresh_state WHERE owner_id=?').get<{ count: number }>('owner'))?.count, 1);
  await database.prepare('UPDATE smart_collection_refresh_state SET available_at=CURRENT_TIMESTAMP WHERE owner_id=?').run('owner');
  assert.equal(await service.processNextRefresh('owner'), 'owner');
  const updated = (await service.list('owner')).collections.find((collection) => collection.id === folder.id)!;
  assert.equal(updated.itemCount, 13);
  assert.equal(updated.name, 'My references'); assert.equal(updated.color, '#FF6A00'); assert.equal(updated.pinned, true);
  await service.setItemOverride('owner', folder.id, 'one', 'reset');
  assert.equal((await service.list('owner')).collections.find((collection) => collection.id === folder.id)?.itemCount, 14);
  assert.equal(await service.processNextRefresh('owner'), null);
}));

test('invalidation rolls back with failed source transactions and deleted saves leave no ghost memberships', async () => fixture(async (database) => {
  const service = await build(database);
  const before = await database.prepare('SELECT revision FROM smart_collection_refresh_state WHERE owner_id=?').get('owner');
  await assert.rejects(database.transaction(async () => { await addPage(database, 'rolled-back'); throw new Error('rollback'); })(), /rollback/);
  assert.deepEqual(await database.prepare('SELECT revision FROM smart_collection_refresh_state WHERE owner_id=?').get('owner'), before);
  await database.prepare('DELETE FROM saved_items WHERE owner_id=? AND id=?').run('owner', 'one');
  const folder = (await service.list('owner')).collections.find((collection) => collection.slug === 'ui-inspiration')!;
  assert.equal(folder.itemCount, 1);
  assert.equal((await service.list('owner')).refresh.status, 'pending');
  await database.prepare('DELETE FROM users WHERE id=?').run('owner');
  assert.equal(await database.prepare('SELECT 1 FROM smart_collection_refresh_state WHERE owner_id=?').get('owner'), undefined);
}));

test('failed refresh preserves the last snapshot and exposes a retryable state', async () => fixture(async (database) => {
  const service = await build(database);
  const before = await service.list('owner');
  await service.requestRefresh('owner');
  const broken: DatabaseHandle = {
    ...database, transaction: database.transaction.bind(database), close: async () => undefined,
    prepare(sql) {
      const statement = database.prepare(sql);
      return sql.startsWith('SELECT saved_items.id') ? { ...statement, all: async () => { throw new Error('fixture failure'); } } : statement;
    },
  };
  await assert.rejects(createSmartCollectionService(broken).processNextRefresh('owner'), /fixture failure/);
  const failed = await service.list('owner');
  assert.deepEqual(failed.collections, before.collections); assert.equal(failed.generatedAt, before.generatedAt);
  assert.equal(failed.refresh.status, 'failed');
  assert.equal(await service.processNextRefresh('owner'), null);
  await service.requestRefresh('owner'); await service.processNextRefresh('owner');
  assert.equal((await service.list('owner')).refresh.status, 'ready');
}));

test('changes during a refresh remain dirty and expired leases can be reclaimed', async () => fixture(async (database) => {
  const service = await build(database);
  await service.requestRefresh('owner');
  let invalidated = false;
  const concurrent: DatabaseHandle = {
    ...database, transaction: database.transaction.bind(database), close: async () => undefined,
    prepare(sql) {
      const statement = database.prepare(sql);
      if (!sql.startsWith('SELECT saved_items.id')) return statement;
      return { ...statement, all: async <T>(...values: unknown[]) => {
        if (!invalidated) { invalidated = true; await database.prepare('UPDATE smart_collection_refresh_state SET revision=revision+1 WHERE owner_id=?').run('owner'); }
        return statement.all<T>(...values);
      } };
    },
  };
  await createSmartCollectionService(concurrent).processNextRefresh('owner');
  assert.equal((await service.list('owner')).refresh.status, 'pending');
  await database.prepare(`UPDATE smart_collection_refresh_state SET lease_token='abandoned',lease_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second',available_at=CURRENT_TIMESTAMP WHERE owner_id=?`).run('owner');
  await service.processNextRefresh('owner');
  assert.equal((await service.list('owner')).refresh.status, 'ready');
}));

test('a superseded lease cannot publish or clear the new worker claim', async () => fixture(async (database) => {
  const service = await build(database);
  const before = await service.list('owner');
  await service.requestRefresh('owner');
  const stale: DatabaseHandle = {
    prepare: database.prepare.bind(database), close: async () => undefined,
    transaction<T>(callback: () => T | Promise<T>) { return async () => {
      await database.prepare(`UPDATE smart_collection_refresh_state SET lease_token='replacement',lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '5 minutes' WHERE owner_id=?`).run('owner');
      return database.transaction(callback)();
    }; },
  };
  await assert.rejects(createSmartCollectionService(stale).processNextRefresh('owner'), /lease_lost/);
  assert.equal((await database.prepare('SELECT lease_token FROM smart_collection_refresh_state WHERE owner_id=?').get<{ lease_token: string }>('owner'))?.lease_token, 'replacement');
  assert.deepEqual((await service.list('owner')).collections, before.collections);
  assert.equal(await service.processNextRefresh('owner'), null);
}));

test('note edits and extracted content invalidate stored matches without navigation rebuilding them', async () => fixture(async (database) => {
  const service = await build(database);
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO notes(owner_id,item_id,body,created_at,updated_at) VALUES (?,?,?,?,?)`).run('owner', 'one', 'A travel itinerary', now, now);
  await database.prepare(`INSERT INTO extracted_artifacts(id,owner_id,item_id,title,text_content,fetched_at,created_at) VALUES (?,?,?,?,?,?,?)`).run('artifact', 'owner', 'two', 'Saved page', 'A travel itinerary', now, now);
  assert.equal((await service.list('owner')).refresh.status, 'pending');
  await build(database);
  assert.equal((await service.list('owner')).refresh.status, 'ready');
  await database.prepare('UPDATE notes SET body=? WHERE owner_id=? AND item_id=?').run('New recipe ideas', 'owner', 'one');
  assert.equal((await service.list('owner')).refresh.status, 'pending');
}));
