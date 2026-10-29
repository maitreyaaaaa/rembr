import type { DatabaseHandle } from '../db/database.js';
import { lockActiveOwner } from './owner-lifecycle.js';

export interface ProfileRow {
  username: string;
  avatarUrl: string | null;
  avatarAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createAccountRepository(database: DatabaseHandle) {
  return {
    async getProfile(userId: string) {
      return await database.prepare(`SELECT username, avatar_url AS "avatarUrl", avatar_asset_id AS "avatarAssetId",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM profiles WHERE user_id = ?`).get(userId) as ProfileRow | undefined;
    },

    async saveProfile(userId: string, username: string, avatarUrl: string | null, avatarAssetId: string | null, oldAssetId: string | null, now: string) {
      await database.transaction(async () => {
        if (!await lockActiveOwner(database, userId)) throw new Error('account_inactive');
        if (oldAssetId && oldAssetId !== avatarAssetId) await database.prepare("UPDATE asset_objects SET state='deleting',updated_at=? WHERE owner_id=? AND id=?").run(now, userId, oldAssetId);
        await database.prepare(`INSERT INTO profiles (user_id, username, avatar_url, avatar_asset_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET username=excluded.username, avatar_url=excluded.avatar_url,
            avatar_asset_id=excluded.avatar_asset_id, updated_at=excluded.updated_at`)
          .run(userId, username, avatarUrl, avatarAssetId, now, now);
      })();
    },

    async getOnboarding(userId: string) {
      const preferences = await database.prepare(`SELECT referral_source AS "referralSource", completed_at AS "completedAt",
          skipped_at AS "skippedAt"
        FROM onboarding_preferences WHERE user_id = ?`).get(userId) as { referralSource: string | null; completedAt: string | null; skippedAt: string | null } | undefined;
      if (!preferences) return null;
      const rows = await database.prepare('SELECT content_type AS "contentType" FROM onboarding_content_types WHERE user_id = ? ORDER BY content_type')
        .all(userId) as Array<{ contentType: string }>;
      return { contentTypes: rows.map((row) => row.contentType), referralSource: preferences.referralSource ?? '', completedAt: preferences.completedAt, skippedAt: preferences.skippedAt };
    },

    async saveOnboarding(userId: string, contentTypes: string[], referralSource: string | null, completedAt: string | null, skippedAt: string | null, now: string) {
      await database.transaction(async () => {
        if (!await lockActiveOwner(database, userId)) throw new Error('account_inactive');
        await database.prepare(`INSERT INTO onboarding_preferences (user_id, referral_source, completed_at, skipped_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET referral_source=excluded.referral_source,
            completed_at=excluded.completed_at, skipped_at=excluded.skipped_at, updated_at=excluded.updated_at`)
          .run(userId, referralSource, completedAt, skippedAt, now, now);
        await database.prepare('DELETE FROM onboarding_content_types WHERE user_id = ?').run(userId);
        const insert = database.prepare('INSERT INTO onboarding_content_types (user_id, content_type) VALUES (?, ?)');
        for (const type of contentTypes) await insert.run(userId, type);
      })();
    },

    async hasProfile(userId: string) {
      return Boolean(await database.prepare('SELECT 1 FROM profiles WHERE user_id = ?').get(userId));
    },
  };
}
