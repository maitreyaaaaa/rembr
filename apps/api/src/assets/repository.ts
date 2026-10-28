import type { DatabaseHandle } from '../db/database.js';

export type AssetKind = 'avatar' | 'note_image';

export function createAssetRepository(database: DatabaseHandle) {
  return {
    async stage(id: string, ownerId: string, kind: AssetKind, key: string, mime: string, bytes: number, sha256: string, now: string) {
      await database.prepare(`INSERT INTO asset_objects (id,owner_id,kind,storage_key,detected_mime,byte_size,sha256,state,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'staging',?,?)`).run(id, ownerId, kind, key, mime, bytes, sha256, now, now);
    },
    async markReady(id: string, now: string) {
      await database.prepare("UPDATE asset_objects SET state='ready',updated_at=? WHERE id=?").run(now, id);
    },
    async markDeleting(ownerId: string, id: string, now: string) {
      await database.prepare("UPDATE asset_objects SET state='deleting',updated_at=? WHERE owner_id=? AND id=?").run(now, ownerId, id);
    },
    async getForOwner(ownerId: string, id: string, state?: 'ready' | 'deleting') {
      const stateClause = state ? ' AND state=?' : '';
      return await database.prepare(`SELECT id,owner_id AS "ownerId",kind,storage_key AS "storageKey",detected_mime AS mime,byte_size AS "byteSize",sha256,state
        FROM asset_objects WHERE owner_id=? AND id=?${stateClause}`).get(...(state ? [ownerId, id, state] : [ownerId, id])) as {
          id: string; ownerId: string; kind: AssetKind; storageKey: string; mime: string; byteSize: number; sha256: string; state: string;
        } | undefined;
    },
    async removeMetadata(ownerId: string, id: string) {
      await database.prepare('DELETE FROM asset_objects WHERE owner_id=? AND id=?').run(ownerId, id);
    },
    async findStagedAndCleanupCandidates() {
      return await database.prepare(`SELECT id,owner_id AS "ownerId",storage_key AS "storageKey",state,created_at AS "createdAt"
        FROM asset_objects`).all() as Array<{ id: string; ownerId: string; storageKey: string; state: string; createdAt: string }>;
    },
    async countReferences(id: string) {
      const row = await database.prepare(`SELECT
          (SELECT count(*) FROM note_assets WHERE asset_id=?) +
          (SELECT count(*) FROM profiles WHERE avatar_asset_id=?) AS count`).get(id, id) as { count: number };
      return row.count;
    },
    async listKeys() {
      return (await database.prepare('SELECT storage_key AS key FROM asset_objects').all() as Array<{ key: string }>).map((row) => row.key);
    },
  };
}
