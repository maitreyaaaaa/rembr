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
    for (const [id, createdAt] of [
      ['admin-old-a', new Date(Date.parse(cutoff) - 2).toISOString()],
      ['admin-old-b', new Date(Date.parse(cutoff) - 1).toISOString()],
      ['admin-boundary', cutoff],
      ['admin-active', new Date(Date.parse(cutoff) + 1).toISOString()],
    ] as const) {
      await database.prepare(`INSERT INTO admin_access_audit (id,event_type,metadata,created_at)
        VALUES (?, 'admin_user_list_viewed', '{}', ?)`).run(id, createdAt);
    }

    const old = new Date(Date.parse(cutoff) - 1).toISOString();
    const recent = new Date(Date.parse(cutoff) + 1).toISOString();
    for (const [id, status, completedAt, cancelledAt, updatedAt] of [
      ['deletion-old-complete', 'completed', old, null, old],
      ['deletion-old-cancel', 'cancelled', null, old, old],
      ['deletion-boundary', 'completed', cutoff, null, cutoff],
      ['deletion-recent', 'cancelled', null, recent, recent],
      ['deletion-retryable', 'failed', null, null, old],
    ] as const) {
      await database.prepare(`INSERT INTO account_deletion_requests
        (id,owner_id,owner_hash,status,export_confirmed,attempt_count,max_attempts,requested_at,available_at,completed_at,cancelled_at,created_at,updated_at)
        VALUES (?,? ,? ,?,TRUE,0,8,?,?,?,?,?,?)`)
        .run(id, id === 'deletion-old-complete' ? null : 'activity-owner', 'b'.repeat(64), status, old, old, completedAt, cancelledAt, old, updatedAt);
      await database.prepare(`INSERT INTO account_deletion_audit (id,request_id,owner_hash,actor_type,event_type,metadata,created_at)
        VALUES (?,?,?,'worker','completed','{}',?)`).run(`${id}-audit`, id, 'b'.repeat(64), old);
      await database.prepare(`INSERT INTO account_deletion_steps (id,request_id,step_key,status,attempt_count,updated_at)
        VALUES (?,?, 'delete_identity','completed',1,?)`).run(`${id}-step`, id, updatedAt);
    }
    for (const [id, status, artifactKey, updatedAt] of [
      ['export-old-expired', 'expired', null, old],
      ['export-old-failed', 'failed', null, old],
      ['export-boundary', 'expired', null, cutoff],
      ['export-recent', 'cancelled', null, recent],
      ['export-retained-key', 'expired', 'private/object-key', old],
    ] as const) {
      await database.prepare(`INSERT INTO account_data_exports (id,owner_id,status,artifact_key,created_at,updated_at)
        VALUES (?,'activity-owner',?,?,?,?)`).run(id, status, artifactKey, old, updatedAt);
    }

    const emptyCleanup = { searchEvents: 0, securityEvents: 0, adminAccessEvents: 0, exportHistory: 0, deletionRequests: 0, deletionAudits: 0 };
    assert.deepEqual(await cleanupExpiredAccountActivity(database, now, 1), { searchEvents: 1, securityEvents: 1, adminAccessEvents: 1, exportHistory: 1, deletionRequests: 1, deletionAudits: 1 });
    assert.deepEqual(await cleanupExpiredAccountActivity(database, now, 1), { searchEvents: 1, securityEvents: 1, adminAccessEvents: 1, exportHistory: 1, deletionRequests: 1, deletionAudits: 1 });
    assert.deepEqual(await cleanupExpiredAccountActivity(database, now, 1), emptyCleanup);
    assert.deepEqual(await database.prepare('SELECT id FROM search_events ORDER BY id').all(), [
      { id: 'search-active' }, { id: 'search-boundary' },
    ]);
    assert.deepEqual(await database.prepare('SELECT id FROM account_security_events ORDER BY id').all(), [
      { id: 'security-active' }, { id: 'security-boundary' },
    ]);
    assert.deepEqual(await database.prepare('SELECT id FROM admin_access_audit ORDER BY id').all(), [
      { id: 'admin-active' }, { id: 'admin-boundary' },
    ]);
    assert.deepEqual(await database.prepare('SELECT id FROM account_deletion_requests ORDER BY id').all(), [
      { id: 'deletion-boundary' }, { id: 'deletion-recent' }, { id: 'deletion-retryable' },
    ]);
    assert.deepEqual(await database.prepare('SELECT request_id FROM account_deletion_audit ORDER BY request_id').all(), [
      { request_id: 'deletion-boundary' }, { request_id: 'deletion-recent' }, { request_id: 'deletion-retryable' },
    ]);
    assert.deepEqual(await database.prepare('SELECT id FROM account_data_exports ORDER BY id').all(), [
      { id: 'export-boundary' }, { id: 'export-recent' }, { id: 'export-retained-key' },
    ]);
    await assert.rejects(cleanupExpiredAccountActivity(database, now, 501), /limit must be between/);
  } finally {
    await database.close();
  }
});
