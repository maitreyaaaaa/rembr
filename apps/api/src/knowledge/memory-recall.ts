import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

export type RecallOutcome = 'remembered' | 'partial' | 'forgot' | 'skipped';
const WEEKLY_PROMPT_LIMIT = 3;
const RECALL_INTERVALS = [1, 3, 7, 14, 30] as const;

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function createMemoryRecallRepository(database: DatabaseHandle) {
  async function remaining(ownerId: string, now: Date) {
    const row = await database.prepare(`SELECT COUNT(*) AS count FROM item_memory_prompts
      WHERE owner_id=? AND shown_at>=?`).get(ownerId, addDays(now, -7)) as { count: number | string };
    return Math.max(0, WEEKLY_PROMPT_LIMIT - Number(row.count));
  }

  return {
    async updatePreference(ownerId: string, itemId: string, enabled: boolean, reason: string) {
      const exists = await database.prepare('SELECT 1 FROM saved_items WHERE owner_id=? AND id=?').get(ownerId, itemId);
      if (!exists) return false;
      const now = new Date();
      if (!enabled) {
        await database.prepare(`UPDATE item_memory_prompts SET outcome='skipped',answered_at=?
          WHERE owner_id=? AND item_id=? AND outcome IS NULL`).run(now.toISOString(), ownerId, itemId);
        await database.prepare('DELETE FROM item_memory_settings WHERE owner_id=? AND item_id=?').run(ownerId, itemId);
        return true;
      }
      await database.prepare(`INSERT INTO item_memory_settings
        (owner_id,item_id,reason,interval_days,successful_recalls,next_due_at,created_at,updated_at)
        VALUES (?,?,?,1,0,?,?,?)
        ON CONFLICT(owner_id,item_id) DO UPDATE SET reason=excluded.reason,updated_at=excluded.updated_at`)
        .run(ownerId, itemId, reason.trim(), addDays(now, 1), now.toISOString(), now.toISOString());
      return true;
    },

    async next(ownerId: string) {
      return database.transaction(async () => {
        await database.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(ownerId);
        const now = new Date();
        const nowIso = now.toISOString();
        const pending = await database.prepare(`SELECT prompt.id,prompt.item_id AS "itemId",setting.reason
          FROM item_memory_prompts prompt JOIN item_memory_settings setting
            ON setting.owner_id=prompt.owner_id AND setting.item_id=prompt.item_id
          WHERE prompt.owner_id=? AND prompt.outcome IS NULL
          ORDER BY prompt.shown_at,prompt.id LIMIT 1`).get(ownerId) as { id: string; itemId: string; reason: string } | undefined;
        if (pending) return { prompt: { ...pending, question: pending.reason ? 'Why did you save this?' : 'What was the idea in this save?' }, remainingThisWeek: await remaining(ownerId, now) };

        const available = await remaining(ownerId, now);
        if (available <= 0) return { prompt: null, remainingThisWeek: 0 };
        const candidate = await database.prepare(`SELECT setting.item_id AS "itemId",setting.reason
          FROM item_memory_settings setting JOIN saved_items item
            ON item.owner_id=setting.owner_id AND item.id=setting.item_id
          WHERE setting.owner_id=? AND setting.next_due_at<=?
            AND NOT EXISTS (SELECT 1 FROM item_memory_prompts recent
              WHERE recent.owner_id=setting.owner_id AND recent.item_id=setting.item_id AND recent.shown_at>=?)
          ORDER BY setting.next_due_at,setting.item_id LIMIT 1 FOR UPDATE OF setting`)
          .get(ownerId, nowIso, addDays(now, -7)) as { itemId: string; reason: string } | undefined;
        if (!candidate) return { prompt: null, remainingThisWeek: available };
        const id = randomUUID();
        await database.prepare(`INSERT INTO item_memory_prompts
          (id,owner_id,item_id,shown_at,created_at) VALUES (?,?,?,?,?)`)
          .run(id, ownerId, candidate.itemId, nowIso, nowIso);
        return { prompt: { id, ...candidate, question: candidate.reason ? 'Why did you save this?' : 'What was the idea in this save?' }, remainingThisWeek: available - 1 };
      })();
    },

    async reveal(ownerId: string, promptId: string) {
      const changed = await database.prepare(`UPDATE item_memory_prompts SET revealed_at=?
        WHERE owner_id=? AND id=? AND outcome IS NULL AND revealed_at IS NULL`)
        .run(new Date().toISOString(), ownerId, promptId);
      if (!changed.changes) {
        const existing = await database.prepare(`SELECT item_id AS "itemId",revealed_at AS "revealedAt"
          FROM item_memory_prompts WHERE owner_id=? AND id=? AND outcome IS NULL`)
          .get(ownerId, promptId) as { itemId: string; revealedAt: string | null } | undefined;
        return existing?.revealedAt ? existing.itemId : null;
      }
      const prompt = await database.prepare('SELECT item_id AS "itemId" FROM item_memory_prompts WHERE owner_id=? AND id=?').get(ownerId, promptId) as { itemId: string } | undefined;
      return prompt?.itemId ?? null;
    },

    async respond(ownerId: string, promptId: string, outcome: RecallOutcome) {
      const now = new Date();
      const nowIso = now.toISOString();
      return database.transaction(async () => {
        const prompt = await database.prepare(`SELECT item_id AS "itemId",revealed_at AS "revealedAt"
          FROM item_memory_prompts WHERE owner_id=? AND id=? AND outcome IS NULL FOR UPDATE`)
          .get(ownerId, promptId) as { itemId: string; revealedAt: string | null } | undefined;
        if (!prompt || (outcome !== 'skipped' && !prompt.revealedAt)) return false;
        const setting = await database.prepare(`SELECT interval_days AS "intervalDays",successful_recalls AS "successfulRecalls"
          FROM item_memory_settings WHERE owner_id=? AND item_id=? FOR UPDATE`)
          .get(ownerId, prompt.itemId) as { intervalDays: number; successfulRecalls: number } | undefined;
        if (!setting) return false;
        const updatedPrompt = await database.prepare(`UPDATE item_memory_prompts SET outcome=?,answered_at=?
          WHERE owner_id=? AND id=? AND outcome IS NULL`).run(outcome, nowIso, ownerId, promptId);
        if (!updatedPrompt.changes) return false;

        let intervalDays = Number(setting.intervalDays);
        let successfulRecalls = Number(setting.successfulRecalls);
        if (outcome === 'remembered') {
          const nextIndex = Math.min(RECALL_INTERVALS.indexOf(intervalDays as typeof RECALL_INTERVALS[number]) + 1, RECALL_INTERVALS.length - 1);
          intervalDays = RECALL_INTERVALS[Math.max(0, nextIndex)]!;
          successfulRecalls += 1;
        } else if (outcome === 'partial' || outcome === 'forgot') {
          intervalDays = 1;
          successfulRecalls = 0;
        }
        const delayDays = outcome === 'skipped' ? 3 : intervalDays;
        await database.prepare(`UPDATE item_memory_settings SET interval_days=?,successful_recalls=?,next_due_at=?,updated_at=?
          WHERE owner_id=? AND item_id=?`).run(intervalDays, successfulRecalls, addDays(now, delayDays), nowIso, ownerId, prompt.itemId);
        return true;
      })();
    },
  };
}
