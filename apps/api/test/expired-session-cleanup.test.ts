import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupExpiredSessions } from '../src/auth/sessions.js';
import { createTestDatabase } from '../src/db/database.js';

test('expired session cleanup is bounded and preserves sessions that have not expired', async () => {
  const database = await createTestDatabase();
  try {
    await database.prepare(`INSERT INTO users (id,email,password_hash,created_at) VALUES ('session-owner','session@example.test','hash',?)`)
      .run('2026-10-30T00:00:00.000Z');
    const sessions = [
      ['expired-a', '2026-10-30T11:59:59.999Z'],
      ['expired-b', '2026-10-30T12:00:00.000Z'],
      ['active', '2026-10-30T12:00:00.001Z'],
    ] as const;
    for (const [id, expiresAt] of sessions) {
      await database.prepare(`INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)`)
        .run(id, 'session-owner', `${id}-hash`, expiresAt, '2026-10-30T00:00:00.000Z');
    }

    assert.equal(await cleanupExpiredSessions(database, new Date('2026-10-30T12:00:00.000Z'), 1), 1);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM sessions').get<{ count: number }>())?.count, 2);
    assert.equal(await cleanupExpiredSessions(database, new Date('2026-10-30T12:00:00.000Z'), 500), 1);
    const remaining = await database.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;
    assert.deepEqual(remaining, [{ id: 'active' }]);
    await assert.rejects(cleanupExpiredSessions(database, new Date(), 501), /limit must be between/);
  } finally {
    await database.close();
  }
});
