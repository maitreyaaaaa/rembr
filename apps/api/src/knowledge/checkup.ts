import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { lockActiveOwner } from '../account/owner-lifecycle.js';

const OLD_SAVE_DAYS = 90;
const ITEM_SAMPLE_LIMIT = 200;
const DISPLAY_LIMIT = 8;

type CareItem = { id: string; title: string; status: string; created_at: string };
type ReminderRow = { id: string; item_id: string; remind_at: string; reason: string; note: string; completed_at: string | null; created_at: string; updated_at: string; title: string; item_status: string; item_created_at: string };
type DuplicateImportRow = { id: string; item_id: string; imported_title: string; source_platform: string; imported_at: string; matched_item_title: string };

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
      const [totalRow, unorganizedRow, attentionCountRow, attentionRow, oldCountRow, oldRows, recentRows, duplicateImportCountRow, duplicateImportRows] = await Promise.all([
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
        database.prepare(`SELECT count(*) AS count FROM import_entries WHERE owner_id=? AND status='duplicate'`)
          .get(ownerId) as Promise<{ count: number }>,
        database.prepare(`SELECT entries.id,entries.item_id,entries.title AS imported_title,entries.source_platform,
            entries.created_at AS imported_at,COALESCE(saved_items.title_override,saved_items.title) AS matched_item_title
          FROM import_entries entries JOIN saved_items
            ON saved_items.owner_id=entries.owner_id AND saved_items.id=entries.item_id
          WHERE entries.owner_id=? AND entries.status='duplicate'
          ORDER BY entries.created_at DESC,entries.id DESC LIMIT ?`).all(ownerId, DISPLAY_LIMIT) as Promise<DuplicateImportRow[]>,
      ]);

      const [dueReminderRows, upcomingReminderRows] = await Promise.all([
        database.prepare(`SELECT reminders.id,reminders.item_id,reminders.remind_at,reminders.reason,reminders.note,reminders.completed_at,
            reminders.created_at,reminders.updated_at,COALESCE(saved_items.title_override,saved_items.title) AS title,
            saved_items.status AS item_status,saved_items.created_at AS item_created_at
          FROM library_reminders reminders JOIN saved_items ON saved_items.owner_id=reminders.owner_id AND saved_items.id=reminders.item_id
          WHERE reminders.owner_id=? AND reminders.status='pending' AND reminders.remind_at<=?
          ORDER BY reminders.remind_at ASC,reminders.id ASC LIMIT ?`).all(ownerId, nowIso, DISPLAY_LIMIT) as Promise<ReminderRow[]>,
        database.prepare(`SELECT reminders.id,reminders.item_id,reminders.remind_at,reminders.reason,reminders.note,reminders.completed_at,
            reminders.created_at,reminders.updated_at,COALESCE(saved_items.title_override,saved_items.title) AS title,
            saved_items.status AS item_status,saved_items.created_at AS item_created_at
          FROM library_reminders reminders JOIN saved_items ON saved_items.owner_id=reminders.owner_id AND saved_items.id=reminders.item_id
          WHERE reminders.owner_id=? AND reminders.status='pending' AND reminders.remind_at>?
          ORDER BY reminders.remind_at ASC,reminders.id ASC LIMIT ?`).all(ownerId, nowIso, DISPLAY_LIMIT) as Promise<ReminderRow[]>,
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
        duplicateImports: {
          count: Number(duplicateImportCountRow?.count ?? 0),
          recent: duplicateImportRows.map((row) => ({
            id: row.id,
            itemId: row.item_id,
            importedTitle: row.imported_title,
            matchedItemTitle: row.matched_item_title,
            sourcePlatform: row.source_platform,
            importedAt: row.imported_at,
          })),
        },
        needsAttention: attentionRow,
        olderSaves: oldRows,
        dueReminders: dueReminderRows.map((row) => toReminder(row)),
        upcomingReminders: upcomingReminderRows.map((row) => toReminder(row)),
        weeklyRediscovery: stableSample(recentRows, weekSeed, 6),
        dailyPick: stableSample(recentRows, daySeed, 1)[0] ?? null,
        readOnly: true,
      };
    },
    async createReminder(ownerId: string, itemId: string, preset: 'tomorrow' | 'week' | 'month', note = '', now = new Date()) {
      const days = preset === 'tomorrow' ? 1 : preset === 'month' ? 30 : 7;
      const id = randomUUID();
      const createdAt = now.toISOString();
      const remindAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
      const inserted = await database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new Error('account_inactive');
        if (!await database.prepare('SELECT 1 FROM saved_items WHERE owner_id=? AND id=?').get(ownerId, itemId)) return false;
        await database.prepare(`INSERT INTO library_reminders (id,owner_id,item_id,remind_at,status,reason,note,completed_at,created_at,updated_at)
          VALUES (?,?,?,?,'pending',?,?,NULL,?,?)`).run(id, ownerId, itemId, remindAt, preset, note.trim().replace(/\s+/g, ' ').slice(0, 300), createdAt, createdAt);
        return true;
      })();
      if (!inserted) return null;
      return { id, itemId, remindAt, status: 'pending' as const, reason: preset, note: note.trim().replace(/\s+/g, ' ').slice(0, 300), completedAt: null, createdAt, updatedAt: createdAt };
    },
    async updateReminder(ownerId: string, reminderId: string, status: 'done' | 'dismissed', now = new Date()) {
      const updatedAt = now.toISOString();
      const result = await database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new Error('account_inactive');
        return database.prepare(`UPDATE library_reminders SET status=?,completed_at=?,updated_at=?
          WHERE owner_id=? AND id=? AND status='pending'`).run(status, status === 'done' ? updatedAt : null, updatedAt, ownerId, reminderId);
      })();
      return result.changes === 1;
    },
  };
}

function toReminder(row: ReminderRow) {
  return {
    id: row.id, itemId: row.item_id, remindAt: row.remind_at, status: 'pending' as const,
    reason: row.reason, note: row.note, completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at,
    item: { id: row.item_id, title: row.title, status: row.item_status, created_at: row.item_created_at },
  };
}
