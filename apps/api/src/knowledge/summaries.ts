import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

export const SAVED_ITEM_SUMMARY_PROMPT_VERSION = '2026-10-29-v1';

export interface SavedItemSummary {
  id: string;
  itemId: string;
  generation: number;
  model: string;
  promptVersion: string;
  sourceCharacters: number;
  summary: string;
  inputTokens: number;
  outputTokens: number;
  billedMicroUsd: number;
  createdAt: string;
}

type SummaryRow = Record<string, unknown>;
function toSummary(row: SummaryRow | undefined): SavedItemSummary | null {
  if (!row) return null;
  return {
    id: String(row.id), itemId: String(row.item_id), generation: Number(row.generation), model: String(row.model),
    promptVersion: String(row.prompt_version), sourceCharacters: Number(row.source_characters), summary: String(row.summary),
    inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens), billedMicroUsd: Number(row.billed_microusd),
    createdAt: String(row.created_at),
  };
}

export function createSavedItemSummaryRepository(database: DatabaseHandle) {
  return {
    async latest(ownerId: string, itemId: string) {
      const row = await database.prepare(`SELECT id,item_id,generation,model,prompt_version,source_characters,summary,
        input_tokens,output_tokens,billed_microusd,created_at FROM ai_saved_item_summaries
        WHERE owner_id=? AND item_id=? ORDER BY generation DESC LIMIT 1`).get(ownerId, itemId) as SummaryRow | undefined;
      return toSummary(row);
    },
    async save(input: { ownerId: string; itemId: string; model: string; sourceText: string; summary: string; inputTokens: number; outputTokens: number; billedMicroUsd: number }) {
      const createdAt = new Date().toISOString();
      return database.transaction(async () => {
        await database.prepare('SELECT id FROM saved_items WHERE owner_id=? AND id=? FOR UPDATE').get(input.ownerId, input.itemId);
        const next = await database.prepare(`SELECT COALESCE(MAX(generation),0)+1 AS generation FROM ai_saved_item_summaries
          WHERE owner_id=? AND item_id=?`).get(input.ownerId, input.itemId) as { generation: number };
        const id = randomUUID();
        await database.prepare(`INSERT INTO ai_saved_item_summaries
          (id,owner_id,item_id,generation,model,prompt_version,source_sha256,source_characters,summary,input_tokens,output_tokens,billed_microusd,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.ownerId, input.itemId, Number(next.generation), input.model,
          SAVED_ITEM_SUMMARY_PROMPT_VERSION, createHash('sha256').update(input.sourceText).digest('hex'), [...input.sourceText].length,
          input.summary, input.inputTokens, input.outputTokens, input.billedMicroUsd, createdAt);
        return {
          id, itemId: input.itemId, generation: Number(next.generation), model: input.model,
          promptVersion: SAVED_ITEM_SUMMARY_PROMPT_VERSION, sourceCharacters: [...input.sourceText].length,
          summary: input.summary, inputTokens: input.inputTokens, outputTokens: input.outputTokens,
          billedMicroUsd: input.billedMicroUsd, createdAt,
        } satisfies SavedItemSummary;
      })();
    },
  };
}
