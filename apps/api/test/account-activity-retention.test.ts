import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNT_ACTIVITY_RETENTION_MS, cleanupExpiredAccountActivity } from '../src/account/retention-service.js';
import { createTestDatabase } from '../src/db/database.js';

test('activity cleanup enforces the shared 90-day window in bounded batches', async () => {
  const database = await createTestDatabase();
  try {
    await database.prepare(`INSERT INTO users (id,email,password_hash,created_at) VALUES ('activity-owner','activity@example.test','hash',?)`)
      .run('2026-10-30T00:00:00.000Z');
    const now = new Date('2026-10-30T12:00:00.000Z');
    const cutoff = new Date(now.getTime() - ACCOUNT_ACTIVITY_RETENTION_MS).toISOString();
    for (const [id, createdAt] of [
      ['search-old-a', new Date(Date.parse(cutoff) - 2).toISOString()],
      ['search-old-b', new Date(Date.parse(cutoff) - 1).toISOString()],
      ['search-boundary', cutoff],
      ['search-active', new Date(Date.parse(cutoff) + 1).toISOString()],
    ] as const) {
      await database.prepare(`INSERT INTO search_events (id,owner_id,query_hash,query_length,filters_json,result_count,created_at)
        VALUES (?, 'activity-owner', ?, 1, '{}', 0, ?)`)
        .run(id, 'a'.repeat(64), createdAt);
    }
    for (const [id, createdAt] of [
      ['security-old-a', new Date(Date.parse(cutoff) - 2).toISOString()],
      ['security-old-b', new Date(Date.parse(cutoff) - 1).toISOString()],
      ['security-boundary', cutoff],
      ['security-active', new Date(Date.parse(cutoff) + 1).toISOString()],
    ] as const) {
      await database.prepare(`INSERT INTO account_security_events (id,owner_id,event_type,created_at)
        VALUES (?, 'activity-owner', 'sign_in', ?)`).run(id, createdAt);
    }

    assert.deepEqual(await cleanupExpiredAccountActivity(database, now, 1), { searchEvents: 1, securityEvents: 1 });
    assert.deepEqual(await cleanupExpiredAccountActivity(database, now, 1), { searchEvents: 1, securityEvents: 1 });
    assert.deepEqual(await cleanupExpiredAccountActivity(database, now, 1), { searchEvents: 0, securityEvents: 0 });
    assert.deepEqual(await database.prepare('SELECT id FROM search_events ORDER BY id').all(), [
      { id: 'search-active' }, { id: 'search-boundary' },
    ]);
    assert.deepEqual(await database.prepare('SELECT id FROM account_security_events ORDER BY id').all(), [
      { id: 'security-active' }, { id: 'security-boundary' },
    ]);
    await assert.rejects(cleanupExpiredAccountActivity(database, now, 501), /limit must be between/);
  } finally {
    await database.close();
  }
});
