import type { DatabaseHandle } from '../db/database.js';
import type { ItemCursorKey } from '../library/repository.js';

type Row = Record<string, unknown>;
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
    async addTag(ownerId: string, itemId: string, tagId: string, now: string) {
      await database.prepare('INSERT INTO item_tags (owner_id,item_id,tag_id,created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').run(ownerId, itemId, tagId, now);
    },
    async removeTag(ownerId: string, itemId: string, tagId: string) {
      await database.prepare('DELETE FROM item_tags WHERE owner_id=? AND item_id=? AND tag_id=?').run(ownerId, itemId, tagId);
    },
    async listCollections(ownerId: string) {
      return await database.prepare(`SELECT collections.id, collections.name, collections.description,
          count(collection_items.item_id) AS "itemCount", collections.created_at AS "createdAt", collections.updated_at AS "updatedAt"
        FROM collections LEFT JOIN collection_items ON collection_items.owner_id=collections.owner_id AND collection_items.collection_id=collections.id
        WHERE collections.owner_id=? GROUP BY collections.id ORDER BY collections.normalized_name`).all(ownerId);
    },
    async createCollection(input: { id: string; ownerId: string; name: string; normalized: string; description: string; now: string }) {
      await database.prepare('INSERT INTO collections (id,owner_id,name,normalized_name,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(input.id, input.ownerId, input.name, input.normalized, input.description, input.now, input.now);
      return { id: input.id, name: input.name, description: input.description, itemCount: 0, createdAt: input.now, updatedAt: input.now };
    },
    async getCollection(ownerId: string, id: string) {
      return await database.prepare('SELECT id,name,description,created_at AS "createdAt",updated_at AS "updatedAt" FROM collections WHERE owner_id=? AND id=?').get(ownerId, id) as Row | undefined;
    },
    async getCollectionItems(ownerId: string, id: string, limit: number, cursor?: ItemCursorKey) {
      const cursorClause = cursor ? 'AND (saved_items.created_at < ? OR (saved_items.created_at=? AND saved_items.id<?))' : '';
      const params = cursor ? [ownerId, id, cursor.key, cursor.key, cursor.id, limit + 1] : [ownerId, id, limit + 1];
      const rows = await database.prepare(`SELECT saved_items.*, COALESCE(saved_items.title_override,saved_items.title) AS effective_title,
          COALESCE(saved_items.description_override,saved_items.description) AS effective_description, extracted_artifacts.text_content
        FROM collection_items JOIN saved_items ON saved_items.owner_id=collection_items.owner_id AND saved_items.id=collection_items.item_id
        LEFT JOIN extracted_artifacts ON extracted_artifacts.owner_id=saved_items.owner_id AND extracted_artifacts.item_id=saved_items.id
        WHERE collection_items.owner_id=? AND collection_items.collection_id=? ${cursorClause}
        ORDER BY saved_items.created_at DESC,saved_items.id DESC LIMIT ?`).all(...params) as Row[];
      return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
    },
    async updateCollection(input: { ownerId: string; id: string; name?: string; normalized?: string; description?: string; now: string }) {
      const fields: string[]=[]; const values: unknown[]=[];
      if (input.name !== undefined) { fields.push('name=?','normalized_name=?'); values.push(input.name,input.normalized); }
      if (input.description !== undefined) { fields.push('description=?'); values.push(input.description); }
      fields.push('updated_at=?'); values.push(input.now,input.ownerId,input.id);
      const result = await database.prepare(`UPDATE collections SET ${fields.join(',')} WHERE owner_id=? AND id=?`).run(...values);
      if (!result.changes) return undefined;
      return await database.prepare('SELECT id,name,description,updated_at AS "updatedAt" FROM collections WHERE owner_id=? AND id=?').get(input.ownerId,input.id) as Row;
    },
    async deleteCollection(ownerId: string, id: string) {
      return (await database.prepare('DELETE FROM collections WHERE owner_id=? AND id=?').run(ownerId,id)).changes > 0;
    },
    async addCollectionItem(ownerId: string, collectionId: string, itemId: string, now: string) {
      await database.prepare('INSERT INTO collection_items (owner_id,collection_id,item_id,created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').run(ownerId,collectionId,itemId,now);
    },
    async removeCollectionItem(ownerId: string, collectionId: string, itemId: string) {
      await database.prepare('DELETE FROM collection_items WHERE owner_id=? AND collection_id=? AND item_id=?').run(ownerId,collectionId,itemId);
    },
  };
}
