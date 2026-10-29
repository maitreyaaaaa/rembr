import { createHash } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

const OLD_SAVE_DAYS = 90;
const ITEM_SAMPLE_LIMIT = 200;
const DISPLAY_LIMIT = 8;

type CareItem = { id: string; title: string; status: string; created_at: string };

function stableRank(seed: string, id: string): string {
  return createHash('sha256').update(`${seed}:${id}`).digest('hex');
}

function stableSample(items: CareItem[], seed: string, limit: number): CareItem[] {
  return [...items].sort((left, right) => stableRank(seed, left.id).localeCompare(stableRank(seed, right.id))).slice(0, limit);
}

export function createLibraryCheckupRepository(database: DatabaseHandle) {
  return {
    async get(ownerId: string, now = new Date()) {
      const nowIso = now.toISOString();
      const oldCutoff = new Date(now.getTime() - OLD_SAVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const [totalRow, unorganizedRow, attentionCountRow, attentionRow, oldCountRow, oldRows, recentRows] = await Promise.all([
        database.prepare('SELECT count(*) AS count FROM saved_items WHERE owner_id=?').get(ownerId) as Promise<{ count: number }>,
        database.prepare(`SELECT count(*) AS count FROM saved_items
          WHERE owner_id=?
            AND NOT EXISTS (SELECT 1 FROM item_tags WHERE item_tags.owner_id=saved_items.owner_id AND item_tags.item_id=saved_items.id)
            AND NOT EXISTS (SELECT 1 FROM collection_items WHERE collection_items.owner_id=saved_items.owner_id AND collection_items.item_id=saved_items.id)`)
          .get(ownerId) as Promise<{ count: number }>,
        database.prepare(`SELECT count(*) AS count FROM saved_items
          WHERE saved_items.owner_id=? AND EXISTS (
            SELECT 1 FROM processing_jobs pj
            LEFT JOIN job_pause_states jps ON jps.job_id=pj.id AND jps.owner_id=pj.owner_id
            WHERE pj.owner_id=saved_items.owner_id AND pj.item_id=saved_items.id
              AND (jps.pause_cause IS NOT NULL OR pj.status IN ('partial','failed','retry_wait','cancel_requested')))`)
          .get(ownerId) as Promise<{ count: number }>,
        database.prepare(`SELECT saved_items.id, COALESCE(saved_items.title_override,saved_items.title) AS title,
            COALESCE((SELECT CASE WHEN jps.pause_cause IS NOT NULL THEN 'paused'
                WHEN pj.status IN ('partial','failed','retry_wait','cancel_requested','cancelled') THEN pj.status
                WHEN pj.status='completed' THEN 'ready' ELSE saved_items.status END
              FROM processing_jobs pj
              LEFT JOIN job_pause_states jps ON jps.job_id=pj.id AND jps.owner_id=pj.owner_id
              WHERE pj.owner_id=saved_items.owner_id AND pj.item_id=saved_items.id
              ORDER BY pj.generation DESC LIMIT 1), saved_items.status) AS status,
            saved_items.created_at
          FROM saved_items
          WHERE saved_items.owner_id=? AND EXISTS (
            SELECT 1 FROM processing_jobs pj
            LEFT JOIN job_pause_states jps ON jps.job_id=pj.id AND jps.owner_id=pj.owner_id
            WHERE pj.owner_id=saved_items.owner_id AND pj.item_id=saved_items.id
              AND (jps.pause_cause IS NOT NULL OR pj.status IN ('partial','failed','retry_wait','cancel_requested')))
          ORDER BY saved_items.updated_at DESC, saved_items.id DESC LIMIT ?`).all(ownerId, DISPLAY_LIMIT) as Promise<CareItem[]>,
        database.prepare('SELECT count(*) AS count FROM saved_items WHERE owner_id=? AND created_at<=?').get(ownerId, oldCutoff) as Promise<{ count: number }>,
        database.prepare(`SELECT id, COALESCE(title_override,title) AS title, status, created_at FROM saved_items
          WHERE owner_id=? AND created_at<=? ORDER BY created_at ASC, id ASC LIMIT ?`).all(ownerId, oldCutoff, DISPLAY_LIMIT) as Promise<CareItem[]>,
        database.prepare(`SELECT id, COALESCE(title_override,title) AS title, status, created_at FROM saved_items
          WHERE owner_id=? ORDER BY created_at DESC, id DESC LIMIT ?`).all(ownerId, ITEM_SAMPLE_LIMIT) as Promise<CareItem[]>,
      ]);

      const daySeed = nowIso.slice(0, 10);
      const weekSeed = `${now.getUTCFullYear()}-w${Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000))}`;
      return {
        generatedAt: nowIso,
        summary: {
          savedItems: Number(totalRow?.count ?? 0),
          unorganizedItems: Number(unorganizedRow?.count ?? 0),
          needsAttention: Number(attentionCountRow?.count ?? 0),
          olderSaves: Number(oldCountRow?.count ?? 0),
        },
        needsAttention: attentionRow,
        olderSaves: oldRows,
        weeklyRediscovery: stableSample(recentRows, weekSeed, 6),
        dailyPick: stableSample(recentRows, daySeed, 1)[0] ?? null,
        readOnly: true,
      };
    },
  };
}
