import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from '../src/db/database.js';
import { createAccountDataMapService } from '../src/account/data-map-service.js';

const timestamp = '2026-10-30T00:00:00.000Z';

async function seedUser(database: Awaited<ReturnType<typeof createTestDatabase>>, id: string, email: string) {
  await database.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)')
    .run(id, email, 'not-a-real-password-hash', timestamp);
}

test('account data map inventories current owned tables and labels uncounted bytes and provider copies', async () => {
  const database = await createTestDatabase();
  try {
    await seedUser(database, 'owner-a', 'a@example.test');
    const map = await createAccountDataMapService(database).getForOwner('owner-a');
    const records = map.categories.flatMap((category) => category.records);

    assert.ok(Number.isFinite(Date.parse(map.generatedAt)));
    assert.equal(new Set(records.map((record) => record.table)).size, records.length, 'each owned table appears once');
    assert.ok(records.length >= 35, 'the inventory covers all current owner-scoped tables');
    assert.ok(records.every((record) => record.rowCount === 0 || (record.table === 'users' && record.rowCount === 1)));
    assert.equal(map.categories.find((category) => category.id === 'account')?.rowCount, 1);
    assert.equal(map.privateFileBytes.rowCount, null);
    assert.equal(map.privateFileBytes.counted, false);
    assert.match(map.privateFileBytes.note, /not byte totals/i);
    assert.equal(map.externalProviderCopies.rowCount, null);
    assert.equal(map.externalProviderCopies.counted, false);
    assert.ok(map.externalProviderCopies.providers.includes('Meta AI API'));
    assert.ok(map.externalProviderCopies.providers.some((provider) => provider.startsWith('OpenRouter')));
    assert.deepEqual(map.excludedSharedRecords.map((record) => record.table), [
      'ai_monthly_usage',
      'ai_worker_status',
    ]);
    assert.deepEqual(map.excludedOperationalRecords.map((record) => record.table), ['media_cleanup_queue']);
  } finally {
    await database.close();
  }
});

test('account data map counts only the requested owner and separates file references from binary bytes', async () => {
  const database = await createTestDatabase();
  try {
    await seedUser(database, 'owner-a', 'a@example.test');
    await seedUser(database, 'owner-b', 'b@example.test');
    await database.prepare(`INSERT INTO profiles (user_id,username,created_at,updated_at)
      VALUES (?,?,?,?)`).run('owner-a', 'owner_a', timestamp, timestamp);
    await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run('item-a', 'owner-a', 'https://a.example/', 'https://a.example/', 'A', 'ready', timestamp, timestamp);
    await database.prepare(`INSERT INTO search_events (id,owner_id,query_hash,query_length,filters_json,result_count,created_at)
      VALUES (?,?,?,?,?,?,?)`).run('search-a', 'owner-a', 'a'.repeat(64), 1, '{}', 0, timestamp);
    await database.prepare(`INSERT INTO asset_objects (id,owner_id,kind,storage_key,detected_mime,byte_size,sha256,state,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run('asset-a', 'owner-a', 'avatar', 'owner-a/avatar-a', 'image/png', 16, 'b'.repeat(64), 'ready', timestamp, timestamp);
    await database.prepare('INSERT INTO admin_roles (user_id,role,granted_by,created_at) VALUES (?,?,?,?)')
      .run('owner-a', 'admin', 'owner-b', timestamp);

    const service = createAccountDataMapService(database);
    const ownerA = await service.getForOwner('owner-a');
    const ownerB = await service.getForOwner('owner-b');
    const maliciousOwner = await service.getForOwner("owner-a' OR TRUE --");
    const category = (map: typeof ownerA, id: string) => map.categories.find((entry) => entry.id === id)!;
    const record = (map: typeof ownerA, categoryId: string, table: string) => category(map, categoryId).records.find((entry) => entry.table === table)!;

    assert.equal(record(ownerA, 'account', 'users').rowCount, 1);
    assert.equal(record(ownerA, 'account', 'admin_roles').rowCount, 1);
    assert.equal(record(ownerA, 'account', 'profiles').rowCount, 1);
    assert.equal(record(ownerA, 'saved_library', 'saved_items').rowCount, 1);
    assert.equal(record(ownerA, 'search_activity', 'search_events').rowCount, 1);
    assert.equal(record(ownerA, 'private_file_references', 'asset_objects').rowCount, 1);
    assert.equal(category(ownerA, 'private_file_references').rowCount, 1);
    assert.equal(record(ownerB, 'account', 'users').rowCount, 1);
    assert.equal(record(ownerB, 'account', 'admin_roles').rowCount, 0);
    assert.equal(record(ownerB, 'account', 'profiles').rowCount, 0);
    assert.equal(record(ownerB, 'saved_library', 'saved_items').rowCount, 0);
    assert.equal(record(ownerB, 'search_activity', 'search_events').rowCount, 0);
    assert.equal(record(ownerB, 'private_file_references', 'asset_objects').rowCount, 0);
    assert.ok(maliciousOwner.categories.every((entry) => entry.rowCount === 0));
    assert.match(ownerA.privateFileBytes.note, /file-reference and upload-metadata rows/i);
  } finally {
    await database.close();
  }
});

test('account data map rejects a missing owner identifier', async () => {
  const database = await createTestDatabase();
  try {
    const service = createAccountDataMapService(database);
    await assert.rejects(() => service.getForOwner('  '), TypeError);
  } finally {
    await database.close();
  }
});
