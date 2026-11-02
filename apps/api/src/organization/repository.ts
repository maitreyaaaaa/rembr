import type { DatabaseHandle } from '../db/database.js';
import { MAX_TAGS_PER_ITEM } from './tag-policy.js';

export function createOrganizationRepository(database: DatabaseHandle) {
  return {
    async listTags(ownerId: string) {
      return await database.prepare(`SELECT tags.id, tags.display_name AS name, count(item_tags.item_id) AS "itemCount"
        FROM tags LEFT JOIN item_tags ON item_tags.owner_id=tags.owner_id AND item_tags.tag_id=tags.id
        WHERE tags.owner_id=? GROUP BY tags.id ORDER BY tags.normalized_name`).all(ownerId);
    },
    async createTag(input: { id: string; ownerId: string; normalized: string; name: string; now: string }) {
      await database.prepare('INSERT INTO tags (id, owner_id, normalized_name, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(input.id, input.ownerId, input.normalized, input.name, input.now, input.now);
      return { id: input.id, name: input.name, itemCount: 0 };
    },
    async renameTag(input: { ownerId: string; id: string; name: string; normalized: string; now: string }) {
      const result = await database.prepare('UPDATE tags SET display_name=?, normalized_name=?, updated_at=? WHERE owner_id=? AND id=?')
        .run(input.name, input.normalized, input.now, input.ownerId, input.id);
      return result.changes > 0;
    },
    async deleteTag(ownerId: string, id: string) {
      return (await database.prepare('DELETE FROM tags WHERE owner_id=? AND id=?').run(ownerId, id)).changes > 0;
    },
    async addTag(ownerId: string, itemId: string, tagId: string, now: string): Promise<'added' | 'exists' | 'limit' | 'not_found'> {
      const transaction = database.transaction(async () => {
        const item = await database.prepare('SELECT id FROM saved_items WHERE owner_id=? AND id=? FOR UPDATE').get(ownerId, itemId);
        if (!item) return 'not_found' as const;
        const tag = await database.prepare('SELECT id FROM tags WHERE owner_id=? AND id=?').get(ownerId, tagId);
        if (!tag) return 'not_found' as const;
        const current = await database.prepare('SELECT count(*) AS count FROM item_tags WHERE owner_id=? AND item_id=? AND tag_id=?').get(ownerId, itemId, tagId) as { count: number | string };
        if (Number(current.count) > 0) return 'exists' as const;
        const total = await database.prepare('SELECT count(*) AS count FROM item_tags WHERE owner_id=? AND item_id=?').get(ownerId, itemId) as { count: number | string };
        if (Number(total.count) >= MAX_TAGS_PER_ITEM) return 'limit' as const;
        await database.prepare('INSERT INTO item_tags (owner_id,item_id,tag_id,created_at) VALUES (?,?,?,?)').run(ownerId, itemId, tagId, now);
        return 'added' as const;
      });
      return transaction();
    },
    async removeTag(ownerId: string, itemId: string, tagId: string) {
      await database.prepare('DELETE FROM item_tags WHERE owner_id=? AND item_id=? AND tag_id=?').run(ownerId, itemId, tagId);
    },
  };
}
