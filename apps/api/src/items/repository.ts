import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

export interface SavedItemSummary {
  id: string;
  url: string;
  title: string;
  description: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  textPreview: string;
  titleOverride: string | null;
  descriptionOverride: string | null;
  kind: 'page' | 'note';
}

function toSummary(row: Record<string, unknown>): SavedItemSummary {
  return {
    id: String(row.id),
    url: String(row.original_url),
    title: String(row.title_override ?? row.title),
    description: String(row.description_override ?? row.description ?? ''),
    titleOverride: row.title_override == null ? null : String(row.title_override),
    descriptionOverride: row.description_override == null ? null : String(row.description_override),
    kind: (row.item_kind ?? 'page') as 'page' | 'note',
    status: row.status as SavedItemSummary['status'],
    errorCode: row.error_code ? String(row.error_code) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    textPreview: String(row.text_content ?? '').slice(0, 240),
  };
}

export function createItemRepository(database: DatabaseHandle) {
  const findByCanonical = database.prepare(`SELECT saved_items.*,
    extracted_artifacts.text_content
    FROM saved_items LEFT JOIN extracted_artifacts
      ON extracted_artifacts.item_id = saved_items.id
      AND extracted_artifacts.owner_id = saved_items.owner_id
    WHERE saved_items.owner_id = ? AND saved_items.canonical_url = ?`);

  return {
    findByCanonical(ownerId: string, canonicalUrl: string): SavedItemSummary | undefined {
      const row = findByCanonical.get(ownerId, canonicalUrl) as Record<string, unknown> | undefined;
      return row ? toSummary(row) : undefined;
    },

    create(ownerId: string, originalUrl: string, canonicalUrl: string, title: string): SavedItemSummary {
      const id = randomUUID();
      const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        database.prepare(`INSERT INTO saved_items
          (id, owner_id, original_url, canonical_url, title, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`)
          .run(id, ownerId, originalUrl, canonicalUrl, title, now, now);
        database.prepare(`INSERT INTO processing_jobs
          (id, owner_id, item_id, correlation_id, status, available_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`)
          .run(randomUUID(), ownerId, id, randomUUID(), now, now, now);
      });
      transaction();
      return this.get(ownerId, id)!;
    },

    list(ownerId: string, search: string, limit: number): SavedItemSummary[] {
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      const rows = database.prepare(`SELECT saved_items.*, extracted_artifacts.text_content
        FROM saved_items LEFT JOIN extracted_artifacts
          ON extracted_artifacts.item_id = saved_items.id
          AND extracted_artifacts.owner_id = saved_items.owner_id
        WHERE saved_items.owner_id = ?
          AND (? = '' OR saved_items.title LIKE ? ESCAPE '\\' OR saved_items.original_url LIKE ? ESCAPE '\\')
        ORDER BY saved_items.created_at DESC LIMIT ?`)
        .all(ownerId, search, pattern, pattern, limit) as Array<Record<string, unknown>>;
      return rows.map(toSummary);
    },

    get(ownerId: string, itemId: string) {
      const row = database.prepare(`SELECT saved_items.*, extracted_artifacts.text_content,
          extracted_artifacts.fetched_at
        FROM saved_items LEFT JOIN extracted_artifacts
          ON extracted_artifacts.item_id = saved_items.id
          AND extracted_artifacts.owner_id = saved_items.owner_id
        WHERE saved_items.owner_id = ? AND saved_items.id = ?`)
        .get(ownerId, itemId) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return { ...toSummary(row), text: String(row.text_content ?? ''), fetchedAt: row.fetched_at ? String(row.fetched_at) : null };
    },

    delete(ownerId: string, itemId: string): boolean {
      const result = database.prepare('DELETE FROM saved_items WHERE owner_id = ? AND id = ?').run(ownerId, itemId);
      return result.changes > 0;
    },
  };
}
