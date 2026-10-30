import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { lockActiveOwner } from '../account/owner-lifecycle.js';
import { recordAccountActivityEvent } from '../account/activity-events.js';
import type { DatabaseHandle } from '../db/database.js';
import { AI_DISCLOSURE_VERSION, LOCAL_ASR_DISCLOSURE_VERSION, LOCAL_OCR_DISCLOSURE_VERSION } from '../ai/preferences.js';
import type { ParsedImportItem } from './parser.js';

const ACCEPT_BATCH_SIZE = 250;
const LOOKUP_BATCH_SIZE = 400;
type SqlRow = unknown[];

async function insertRows(database: DatabaseHandle, table: string, columns: string[], rows: SqlRow[], conflict = ''): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += ACCEPT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + ACCEPT_BATCH_SIZE);
    const values = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    await database.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values} ${conflict}`).run(...batch.flat());
  }
}

async function lookupIds(database: DatabaseHandle, table: 'tags' | 'collections', ownerId: string, names: string[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let offset = 0; offset < names.length; offset += LOOKUP_BATCH_SIZE) {
    const batch = names.slice(offset, offset + LOOKUP_BATCH_SIZE);
    if (!batch.length) continue;
    const rows = await database.prepare(`SELECT id,normalized_name FROM ${table} WHERE owner_id=? AND normalized_name IN (${batch.map(() => '?').join(',')})`)
      .all(ownerId, ...batch) as Array<{ id: string; normalized_name: string }>;
    for (const row of rows) ids.set(row.normalized_name, row.id);
  }
  return ids;
}

export interface ImportFileInput { name: string; mime: string; size: number; chunks: number }
export class ImportRepositoryError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ImportRepositoryError'; }
}

export function createImportRepository(database: DatabaseHandle) {
  return {
    async create(ownerId: string, requestId: string, idempotencyKey: string, files: ImportFileInput[]) {
      const id = randomUUID(); const now = new Date().toISOString();
      const transaction = database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new ImportRepositoryError('account_inactive');
        const prior = await database.prepare('SELECT id,status FROM imports WHERE owner_id=? AND idempotency_key=?')
          .get(ownerId, idempotencyKey) as { id: string; status: string } | undefined;
        if (prior) {
          const priorFiles = await database.prepare(`SELECT id,original_name,declared_mime,expected_bytes,chunk_count FROM import_upload_files
            WHERE owner_id=? AND import_id=? ORDER BY created_at,id`).all(ownerId, prior.id) as Array<Record<string, unknown>>;
          const matches = priorFiles.length === files.length && priorFiles.every((row, index) => {
            const file = files[index]!; const cleanName = basename(file.name.replaceAll('\\', '/')).slice(0, 255);
            return String(row.original_name) === cleanName && String(row.declared_mime) === file.mime.slice(0, 120)
              && Number(row.expected_bytes) === file.size && Number(row.chunk_count) === file.chunks;
          });
          if (!matches) throw new ImportRepositoryError('idempotency_key_conflict');
          return { id: prior.id, status: prior.status, files: priorFiles.map((row) => ({ id: String(row.id), name: String(row.original_name), size: Number(row.expected_bytes), chunks: Number(row.chunk_count) })) };
        }
        await database.prepare(`INSERT INTO imports (id,owner_id,request_id,idempotency_key,source,status,file_count,created_at,updated_at)
          VALUES (?,?,?,?,'unknown','uploading',?,?,?)`).run(id, ownerId, requestId, idempotencyKey, files.length, now, now);
        const insert = database.prepare(`INSERT INTO import_upload_files
          (id,owner_id,import_id,original_name,extension,declared_mime,expected_bytes,chunk_count,storage_key,state,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,'uploading',?,?)`);
        const result = await Promise.all(files.map(async (file) => {
          const fileId = randomUUID(); const cleanName = basename(file.name.replaceAll('\\', '/')).slice(0, 255);
          const extension = cleanName.toLowerCase().split('.').at(-1) ?? '';
          await insert.run(fileId, ownerId, id, cleanName, extension, file.mime.slice(0, 120), file.size, file.chunks, randomUUID(), now, now);
          return { id: fileId, name: cleanName, size: file.size, chunks: file.chunks };
        }));
        await database.prepare('UPDATE imports SET total_bytes=? WHERE id=? AND owner_id=?')
          .run(files.reduce((total, file) => total + file.size, 0), id, ownerId);
        await recordAccountActivityEvent(database, ownerId, 'import_started', now);
        return { id, status: 'uploading', files: result };
      });
      return await transaction();
    },

    async owned(ownerId: string, importId: string) {
      return await database.prepare(`SELECT id,request_id,source,status,total_bytes,file_count,parsed_count,new_count,
          duplicate_count,skipped_count,failed_count,cleanup_status,error_code,created_at,updated_at,completed_at
        FROM imports WHERE owner_id=? AND id=?`).get(ownerId, importId) as Record<string, unknown> | undefined;
    },

    async progress(ownerId: string, importId: string) {
      return await database.prepare(`SELECT i.id AS "importId",i.status,i.failed_count AS "parseFailed",
          COUNT(j.id) AS total,
          SUM(CASE WHEN j.status IN ('completed','partial','failed','cancelled') THEN 1 ELSE 0 END) AS settled,
          SUM(CASE WHEN j.status IN ('completed','partial') THEN 1 ELSE 0 END) AS saved,
          SUM(CASE WHEN p.job_id IS NOT NULL THEN 1 ELSE 0 END) AS paused,
          SUM(CASE WHEN j.status='queued' AND p.job_id IS NULL THEN 1 ELSE 0 END) AS queued,
          SUM(CASE WHEN j.status IN ('processing','cancel_requested') AND p.job_id IS NULL THEN 1 ELSE 0 END) AS processing,
          SUM(CASE WHEN j.status='retry_wait' AND p.job_id IS NULL THEN 1 ELSE 0 END) AS "retryWaiting",
          SUM(CASE WHEN j.status='failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN j.status='cancelled' THEN 1 ELSE 0 END) AS cancelled
        FROM imports i
        LEFT JOIN processing_jobs j ON j.owner_id=i.owner_id AND j.import_id=i.id
        LEFT JOIN job_pause_states p ON p.owner_id=j.owner_id AND p.job_id=j.id
        WHERE i.owner_id=? AND i.id=?
        GROUP BY i.id,i.status,i.failed_count`).get(ownerId, importId) as Record<string, unknown> | undefined;
    },

    async files(ownerId: string, importId: string) {
      return await database.prepare(`SELECT id,original_name,extension,declared_mime,expected_bytes,received_bytes,
          chunk_count,chunks_received,storage_key,state FROM import_upload_files
        WHERE owner_id=? AND import_id=? ORDER BY created_at,id`).all(ownerId, importId) as Array<Record<string, unknown>>;
    },

    async file(ownerId: string, importId: string, fileId: string) {
      return await database.prepare(`SELECT id,original_name,extension,declared_mime,expected_bytes,received_bytes,chunk_count,chunks_received,storage_key,state
        FROM import_upload_files WHERE owner_id=? AND import_id=? AND id=?`).get(ownerId, importId, fileId) as Record<string, unknown> | undefined;
    },

    async chunk(ownerId: string, fileId: string, index: number) {
      return await database.prepare(`SELECT sha256,storage_key FROM import_upload_chunks WHERE owner_id=? AND upload_file_id=? AND chunk_index=?`)
        .get(ownerId, fileId, index) as { sha256: string; storage_key: string } | undefined;
    },

    async list(ownerId: string, limit = 25) {
      return await database.prepare(`SELECT id,request_id,source,status,total_bytes,file_count,parsed_count,new_count,duplicate_count,
          skipped_count,failed_count,cleanup_status,error_code,created_at,updated_at,completed_at
        FROM imports WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).all(ownerId, limit) as Array<Record<string, unknown>>;
    },

    async staged(limit = 10) {
      return await database.prepare(`SELECT id,owner_id FROM imports WHERE status='staged' OR (status='parsing' AND lease_expires_at<=?) ORDER BY created_at,id LIMIT ?`)
        .all(new Date().toISOString(), limit) as Array<{ id: string; owner_id: string }>;
    },

    async cleanupPending(limit = 20) {
      return await database.prepare(`SELECT id,owner_id FROM imports WHERE cleanup_status IN ('pending','retry')
        AND status IN ('queued','processing','completed','partial','failed','expired') ORDER BY updated_at LIMIT ?`)
        .all(limit) as Array<{ id: string; owner_id: string }>;
    },

    async storageKeys() {
      const files = new Set((await database.prepare(`SELECT storage_key FROM import_upload_files WHERE state!='deleted'`).all() as Array<{ storage_key: string }>).map((row) => row.storage_key));
      const chunks = new Set((await database.prepare(`SELECT storage_key FROM import_upload_chunks`).all() as Array<{ storage_key: string }>).map((row) => row.storage_key));
      return { files, chunks };
    },

    expireStaleUploads(cutoff: string) {
      const now = new Date().toISOString();
      const transaction = database.transaction(async () => {
        const rows = await database.prepare(`SELECT id,owner_id FROM imports WHERE status='uploading' AND updated_at<?`).all(cutoff) as Array<{ id: string; owner_id: string }>;
        for (const row of rows) {
          await database.prepare(`UPDATE imports SET status='expired',error_code='upload_expired',cleanup_status='retry',updated_at=?,completed_at=? WHERE id=? AND owner_id=?`)
            .run(now, now, row.id, row.owner_id);
          await database.prepare(`UPDATE import_upload_files SET state='failed',updated_at=? WHERE owner_id=? AND import_id=?`).run(now, row.owner_id, row.id);
        }
        return rows;
      });
      return transaction();
    },

    async cancelUpload(ownerId: string, importId: string): Promise<boolean> {
      const now = new Date().toISOString();
      const transaction = database.transaction(async () => {
        const changed = await database.prepare(`UPDATE imports SET status='failed',error_code='upload_cancelled',failed_count=GREATEST(failed_count,1),updated_at=?,completed_at=?
          WHERE owner_id=? AND id=? AND status IN ('uploading','staged')`).run(now, now, ownerId, importId);
        if (changed.changes !== 1) return false;
        await database.prepare(`UPDATE import_upload_files SET state='failed',updated_at=? WHERE owner_id=? AND import_id=? AND state!='deleted'`)
          .run(now, ownerId, importId);
        return true;
      });
      return transaction();
    },

    async cancelQueuedWork(ownerId: string, importId: string) {
      const now = new Date().toISOString();
      const transaction = database.transaction(async () => {
        const imported = await database.prepare('SELECT status FROM imports WHERE owner_id=? AND id=?')
          .get(ownerId, importId) as { status: string } | undefined;
        if (!imported) return { found: false, cancelled: 0, active: 0 };
        const changed = await database.prepare(`UPDATE processing_jobs SET status='cancelled',error_code='cancelled',
            lease_token=NULL,lease_expires_at=NULL,updated_at=?
          WHERE owner_id=? AND import_id=? AND status IN ('queued','retry_wait')`).run(now, ownerId, importId);
        await database.prepare(`UPDATE import_entries SET status='cancelled',error_code='cancelled'
          WHERE owner_id=? AND import_id=? AND job_id IN (SELECT id FROM processing_jobs
            WHERE owner_id=? AND import_id=? AND status='cancelled' AND error_code='cancelled')`)
          .run(ownerId, importId, ownerId, importId);
        await database.prepare(`UPDATE saved_items SET status='failed',error_code='cancelled',updated_at=?
          WHERE owner_id=? AND id IN (SELECT item_id FROM processing_jobs WHERE owner_id=? AND import_id=? AND status='cancelled' AND error_code='cancelled')`)
          .run(now, ownerId, ownerId, importId);
        await database.prepare(`UPDATE processing_jobs SET status='cancel_requested',updated_at=?
          WHERE owner_id=? AND import_id=? AND status='processing'`).run(now, ownerId, importId);
        await database.prepare(`UPDATE import_entries SET status='processing'
          WHERE owner_id=? AND import_id=? AND job_id IN (SELECT id FROM processing_jobs
            WHERE owner_id=? AND import_id=? AND status='cancel_requested')`)
          .run(ownerId, importId, ownerId, importId);
        await database.prepare(`DELETE FROM job_pause_states WHERE owner_id=? AND job_id IN
          (SELECT id FROM processing_jobs WHERE owner_id=? AND import_id=? AND status='cancelled')`).run(ownerId, ownerId, importId);
        const aiActive = await database.prepare(`SELECT id,status FROM ai_analysis_jobs WHERE owner_id=? AND import_id=?
          AND status IN ('queued','processing','paused')`).all(ownerId, importId) as Array<{ id: string; status: string }>;
        if (aiActive.length) {
          await database.prepare(`UPDATE ai_usage_reservations SET status='held'
            WHERE owner_id=? AND import_id=? AND status='reserved'
              AND job_id IN (SELECT id FROM ai_analysis_jobs WHERE owner_id=? AND import_id=? AND status='processing')`)
            .run(ownerId, importId, ownerId, importId);
          await database.prepare(`UPDATE ai_analysis_jobs SET status='cancelled',pause_reason='consent_disabled',
              lease_token=NULL,lease_expires_at=NULL,error_code='import_cancelled',updated_at=?,completed_at=?
            WHERE owner_id=? AND import_id=? AND status IN ('queued','processing','paused')`).run(now, now, ownerId, importId);
        }
        const active = await database.prepare(`SELECT count(*) AS count FROM processing_jobs WHERE owner_id=? AND import_id=?
          AND status IN ('queued','processing','retry_wait','cancel_requested')`).get(ownerId, importId) as { count: number };
        if (Number(active.count) === 0 && ['queued','processing'].includes(imported.status)) {
          await database.prepare(`UPDATE imports SET status='partial',updated_at=?,completed_at=? WHERE owner_id=? AND id=?`)
            .run(now, now, ownerId, importId);
        }
        return { found: true, cancelled: changed.changes, active: Number(active.count) };
      });
      return await transaction();
    },

    async createdItems(ownerId: string, importId: string) {
      return await database.prepare(`SELECT DISTINCT item_id FROM import_entries
        WHERE owner_id=? AND import_id=? AND job_id IS NOT NULL AND item_id IS NOT NULL ORDER BY item_id`)
        .all(ownerId, importId) as Array<{ item_id: string }>;
    },

    async activeWork(ownerId: string, importId: string) {
      const row = await database.prepare(`SELECT count(*) AS count FROM processing_jobs WHERE owner_id=? AND import_id=?
        AND status IN ('queued','processing','retry_wait','cancel_requested')`).get(ownerId, importId) as { count: number } | undefined;
      return Number(row?.count ?? 0);
    },

    recordChunk(ownerId: string, importId: string, fileId: string, index: number, bytes: number, sha256: string, storageKey: string) {
      const transaction = database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new ImportRepositoryError('account_inactive');
        const file = await this.file(ownerId, importId, fileId);
        if (!file || file.state !== 'uploading') throw new ImportRepositoryError('upload_not_available');
        const existing = await database.prepare(`SELECT sha256 FROM import_upload_chunks WHERE owner_id=? AND upload_file_id=? AND chunk_index=?`)
          .get(ownerId, fileId, index) as { sha256: string } | undefined;
        if (existing) {
          if (existing.sha256 !== sha256) throw new ImportRepositoryError('chunk_conflict');
          return { duplicate: true, complete: Number(file.chunks_received) === Number(file.chunk_count), storageKey: String(file.storage_key) };
        }
        const total = Number(file.received_bytes) + bytes;
        if (total > Number(file.expected_bytes)) throw new ImportRepositoryError('import_byte_limit');
        const now = new Date().toISOString();
        await database.prepare(`INSERT INTO import_upload_chunks (id,owner_id,upload_file_id,chunk_index,byte_size,sha256,storage_key,created_at)
          VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), ownerId, fileId, index, bytes, sha256, storageKey, now);
        const count = Number(file.chunks_received) + 1;
        if (count > Number(file.chunk_count)) throw new ImportRepositoryError('too_many_chunks');
        if (count === Number(file.chunk_count) && total !== Number(file.expected_bytes)) throw new ImportRepositoryError('import_byte_count_mismatch');
        await database.prepare(`UPDATE import_upload_files SET received_bytes=?,chunks_received=?,updated_at=?
          WHERE owner_id=? AND import_id=? AND id=?`).run(total, count, now, ownerId, importId, fileId);
        return { duplicate: false, complete: count === Number(file.chunk_count), storageKey: String(file.storage_key) };
      });
      return transaction();
    },

    markFileStaged(ownerId: string, importId: string, fileId: string) {
      const now = new Date().toISOString();
      const transaction = database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new ImportRepositoryError('account_inactive');
        const changed = await database.prepare(`UPDATE import_upload_files SET state='staged',updated_at=?
          WHERE owner_id=? AND import_id=? AND id=? AND state='uploading' AND chunks_received=chunk_count AND received_bytes=expected_bytes`)
          .run(now, ownerId, importId, fileId);
        if (changed.changes !== 1) return false;
        const remaining = await database.prepare(`SELECT count(*) AS count FROM import_upload_files
          WHERE owner_id=? AND import_id=? AND state!='staged'`).get(ownerId, importId) as { count: number };
        if (Number(remaining.count) === 0) await database.prepare(`UPDATE imports SET status='staged',updated_at=? WHERE owner_id=? AND id=? AND status='uploading'`).run(now, ownerId, importId);
        return Number(remaining.count) === 0;
      });
      return transaction();
    },

    async claimForParsing(ownerId: string, importId: string): Promise<string | null> {
      const now = new Date(); const timestamp = now.toISOString(); const lease = randomUUID();
      const transaction = database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) return null;
        const result = await database.prepare(`UPDATE imports SET status='parsing',lease_token=?,lease_expires_at=?,updated_at=?
          WHERE owner_id=? AND id=? AND (status='staged' OR (status='parsing' AND lease_expires_at<=?))`)
          .run(lease, new Date(now.getTime() + 30 * 60_000).toISOString(), timestamp, ownerId, importId, timestamp);
        if (result.changes !== 1) return null;
        await database.prepare(`UPDATE import_upload_files SET state='parsing',updated_at=? WHERE owner_id=? AND import_id=? AND state IN ('staged','parsing')`).run(timestamp, ownerId, importId);
        return lease;
      });
      return transaction();
    },

    accept(ownerId: string, importId: string, leaseToken: string, files: Array<{ id: string; key: string; name: string }>, items: ParsedImportItem[], failures: Array<{ fileId: string; code: string }> = [], instagramSkippedCount = 0) {
      const now = new Date().toISOString();
      const transaction = database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new ImportRepositoryError('account_inactive');
        const state = await database.prepare('SELECT status,lease_token,request_id FROM imports WHERE owner_id=? AND id=?').get(ownerId, importId) as { status: string; lease_token: string | null; request_id: string | null } | undefined;
        if (!state || state.status !== 'parsing' || state.lease_token !== leaseToken) throw new ImportRepositoryError('import_not_available');
        const instagramItems = items.filter((item) => item.platform === 'instagram');
        if (instagramItems.length > 300) throw new ImportRepositoryError('instagram_item_limit');
        const instagramOrderByItem = new Map<ParsedImportItem, number>();
        const seenInstagramOrders = new Set<number>();
        instagramItems.forEach((item, index) => {
          const order = Number.isInteger(item.sourceOrder) ? item.sourceOrder! : index;
          if (order < 0 || order >= 300 || seenInstagramOrders.has(order)) throw new ImportRepositoryError('instagram_source_order_invalid');
          seenInstagramOrders.add(order);
          instagramOrderByItem.set(item, order);
        });
        const sourcePlatforms = [...new Set(items.map((item) => item.platform))];
        const source = sourcePlatforms.length === 1 ? sourcePlatforms[0]! : sourcePlatforms.length ? 'mixed' : 'unknown';
        let newCount = 0; let duplicateCount = 0;
        const fileIdsByName = new Map(files.map((file) => [file.name, file.id]));
        const fileIds = new Set(files.map((file) => file.id));
        const entryRows: SqlRow[] = [];
        const savedItemRows: SqlRow[] = [];
        const jobRows: SqlRow[] = [];
        const aiJobRows: SqlRow[] = [];
        const tagNames = new Map<string, string>();
        const collectionNames = new Map<string, string>();
        const tagLinks: Array<{ itemId: string; normalized: string }> = [];
        const collectionLinks: Array<{ itemId: string; normalized: string }> = [];
        const itemIdsByUrl = new Map<string, string>();

        for (let offset = 0; offset < items.length; offset += LOOKUP_BATCH_SIZE) {
          const urls = [...new Set(items.slice(offset, offset + LOOKUP_BATCH_SIZE).map((item) => item.url))];
          if (!urls.length) continue;
          const existing = await database.prepare(`SELECT id,canonical_url FROM saved_items WHERE owner_id=? AND canonical_url IN (${urls.map(() => '?').join(',')})`)
            .all(ownerId, ...urls) as Array<{ id: string; canonical_url: string }>;
          for (const item of existing) itemIdsByUrl.set(item.canonical_url, item.id);
        }

        for (const failure of failures) {
          if (!fileIds.has(failure.fileId)) throw new ImportRepositoryError('upload_file_not_found');
          entryRows.push([randomUUID(), ownerId, importId, failure.fileId, null, null, 'unknown', null, null, '', '{}', 'failed', failure.code, null, now]);
        }
        const preference = await database.prepare(`SELECT enabled,consent_version,local_ocr_enabled,local_ocr_consent_version,
            local_asr_enabled,local_asr_consent_version
          FROM ai_analysis_preferences WHERE owner_id=?`)
          .get(ownerId) as { enabled: boolean | number; consent_version: string | null;
            local_ocr_enabled: boolean | number; local_ocr_consent_version: string | null;
            local_asr_enabled: boolean | number; local_asr_consent_version: string | null } | undefined;
        const aiEnabled = Boolean((preference?.enabled && preference.consent_version === AI_DISCLOSURE_VERSION)
          || (preference?.local_ocr_enabled && preference.local_ocr_consent_version === LOCAL_OCR_DISCLOSURE_VERSION)
          || (preference?.local_asr_enabled && preference.local_asr_consent_version === LOCAL_ASR_DISCLOSURE_VERSION));
        for (const entry of items) {
          const uploadFileId = fileIdsByName.get(String(entry.metadata.sourceFile ?? '')) ?? null;
          const sourceOrder = entry.platform === 'instagram' ? instagramOrderByItem.get(entry) ?? null : null;
          const existingItemId = itemIdsByUrl.get(entry.url);
          if (existingItemId) {
            entryRows.push([randomUUID(), ownerId, importId, uploadFileId, existingItemId, null, entry.platform, entry.url, entry.sourceId, entry.title, JSON.stringify(entry.metadata), 'duplicate', null, sourceOrder, now]);
            duplicateCount += 1; continue;
          }
          const itemId = randomUUID(); const jobId = randomUUID(); const correlationId = String(state.request_id ?? importId);
          const hashtags = Array.isArray(entry.metadata.hashtags) ? entry.metadata.hashtags : [];
          savedItemRows.push([itemId, ownerId, entry.url, entry.url, entry.title, entry.description, now, now, entry.platform, entry.sourceId, JSON.stringify(entry.metadata)]);
          jobRows.push([jobId, ownerId, itemId, importId, correlationId, sourceOrder, now, now, now]);
          entryRows.push([randomUUID(), ownerId, importId, uploadFileId, itemId, jobId, entry.platform, entry.url, entry.sourceId, entry.title, JSON.stringify(entry.metadata), 'queued', null, sourceOrder, now]);
          if (aiEnabled && entry.platform === 'instagram') aiJobRows.push([randomUUID(), ownerId, importId, itemId, now, now, now]);
          itemIdsByUrl.set(entry.url, itemId);
          for (const rawTag of hashtags.slice(0, 20)) {
            const name = String(rawTag).trim().slice(0, 40); const normalized = name.toLowerCase(); if (!normalized) continue;
            if (!tagNames.has(normalized)) tagNames.set(normalized, name);
            tagLinks.push({ itemId, normalized });
          }
          const collections = Array.isArray(entry.metadata.collections) ? entry.metadata.collections : entry.collection ? [entry.collection] : [];
          for (const collectionName of collections.slice(0, 20)) {
            const name = String(collectionName).trim().slice(0, 80); const normalized = name.toLowerCase();
            if (normalized) {
              if (!collectionNames.has(normalized)) collectionNames.set(normalized, name);
              collectionLinks.push({ itemId, normalized });
            }
          }
          newCount += 1;
        }

        await insertRows(database, 'saved_items', ['id','owner_id','original_url','canonical_url','title','description','status','created_at','updated_at','source_platform','source_id','source_metadata_json'], savedItemRows.map((row) => [...row.slice(0, 6), 'queued', ...row.slice(6)]));
        await insertRows(database, 'processing_jobs', ['id','owner_id','item_id','import_id','correlation_id','source_order','status','available_at','created_at','updated_at'], jobRows.map((row) => [...row.slice(0, 6), 'queued', ...row.slice(6)]));
        await insertRows(database, 'import_entries', ['id','owner_id','import_id','upload_file_id','item_id','job_id','source_platform','source_url','source_id','title','source_metadata_json','status','error_code','source_order','created_at'], entryRows);
        await insertRows(database, 'ai_analysis_jobs', ['id','owner_id','import_id','item_id','status','available_at','created_at','updated_at'], aiJobRows.map((row) => [...row.slice(0, 4), 'queued', ...row.slice(4)]));
        if (aiJobRows.length) await database.prepare(`INSERT INTO ai_import_usage (owner_id,import_id,created_at,updated_at)
          VALUES (?,?,?,?) ON CONFLICT (owner_id,import_id) DO NOTHING`).run(ownerId, importId, now, now);

        if (tagNames.size) {
          const tagRows = [...tagNames].map(([normalized, display]) => [randomUUID(), ownerId, normalized, display, now, now]);
          await insertRows(database, 'tags', ['id','owner_id','normalized_name','display_name','created_at','updated_at'], tagRows, 'ON CONFLICT DO NOTHING');
          const tagIds = await lookupIds(database, 'tags', ownerId, [...tagNames.keys()]);
          const links = tagLinks.flatMap(({ itemId, normalized }) => tagIds.has(normalized) ? [[ownerId, itemId, tagIds.get(normalized)!, now]] : []);
          await insertRows(database, 'item_tags', ['owner_id','item_id','tag_id','created_at'], links, 'ON CONFLICT DO NOTHING');
        }
        if (collectionNames.size) {
          const collectionRows = [...collectionNames].map(([normalized, name]) => [randomUUID(), ownerId, name, normalized, now, now]);
          await insertRows(database, 'collections', ['id','owner_id','name','normalized_name','created_at','updated_at'], collectionRows, 'ON CONFLICT DO NOTHING');
          const collectionIds = await lookupIds(database, 'collections', ownerId, [...collectionNames.keys()]);
          const links = collectionLinks.flatMap(({ itemId, normalized }) => collectionIds.has(normalized) ? [[ownerId, collectionIds.get(normalized)!, itemId, now]] : []);
          await insertRows(database, 'collection_items', ['owner_id','collection_id','item_id','created_at'], links, 'ON CONFLICT DO NOTHING');
        }

        const parsedCount = items.length;
        const failedCount = failures.length;
        const status = failedCount ? (newCount || duplicateCount ? 'partial' : 'failed') : newCount ? 'queued' : parsedCount ? 'completed' : 'failed';
        const errorCode = failedCount ? 'some_files_failed' : parsedCount ? null : 'no_supported_items';
        await database.prepare(`UPDATE imports SET source=?,status=?,parsed_count=?,new_count=?,duplicate_count=?,skipped_count=?,failed_count=?,error_code=?,updated_at=?,completed_at=?,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=? AND id=? AND lease_token=?`)
          .run(source, status, parsedCount, newCount, duplicateCount, instagramSkippedCount, failedCount, errorCode, now, newCount ? null : now, ownerId, importId, leaseToken);
        await recordAccountActivityEvent(database, ownerId,
          status === 'failed' ? 'import_failed' : status === 'completed' ? 'import_completed' : 'import_status_changed', now);
        await database.prepare(`UPDATE import_upload_files SET state='accepted',updated_at=? WHERE owner_id=? AND import_id=?`).run(now, ownerId, importId);
        return { status, parsedCount, newCount, duplicateCount, skippedCount: instagramSkippedCount, failedCount };
      });
      return transaction();
    },

    async fail(ownerId: string, importId: string, code: string, leaseToken?: string) {
      const now = new Date().toISOString();
      const changed = await database.prepare(`UPDATE imports SET status='failed',error_code=?,failed_count=GREATEST(failed_count,1),updated_at=?,completed_at=?
        ,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=? AND id=? AND status IN ('uploading','staged','parsing')
        AND (? IS NULL OR lease_token=?)`).run(code, now, now, ownerId, importId, leaseToken ?? null, leaseToken ?? null);
      if (changed.changes === 1) await recordAccountActivityEvent(database, ownerId, 'import_failed', now);
      await database.prepare(`UPDATE import_upload_files SET state='failed',updated_at=? WHERE owner_id=? AND import_id=? AND state!='deleted'`).run(now, ownerId, importId);
    },

    async cleanup(ownerId: string, importId: string, success: boolean) {
      const now = new Date().toISOString();
      const transaction = database.transaction(async () => {
        await database.prepare(`UPDATE imports SET cleanup_status=?,cleanup_attempts=cleanup_attempts+1,updated_at=?,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=? AND id=?`)
          .run(success ? 'complete' : 'retry', now, ownerId, importId);
        if (success) {
          await database.prepare(`DELETE FROM import_upload_chunks WHERE owner_id=? AND upload_file_id IN
            (SELECT id FROM import_upload_files WHERE owner_id=? AND import_id=?)`).run(ownerId, ownerId, importId);
          await database.prepare(`UPDATE import_upload_files SET state='deleted',updated_at=? WHERE owner_id=? AND import_id=?`).run(now, ownerId, importId);
        }
      });
      await transaction();
    },

    async cleanupFiles(ownerId: string, importId: string) {
      return await database.prepare(`SELECT id,storage_key FROM import_upload_files WHERE owner_id=? AND import_id=? AND state!='deleted'`)
        .all(ownerId, importId) as Array<{ id: string; storage_key: string }>;
    },

    async listEntries(ownerId: string, importId: string) {
      return await database.prepare(`SELECT id,item_id,source_platform,source_url,source_id,title,status,error_code,source_order,created_at
        FROM import_entries WHERE owner_id=? AND import_id=?
        ORDER BY CASE WHEN source_platform='instagram' AND source_order IS NOT NULL THEN 0 ELSE 1 END, source_order, created_at, id`).all(ownerId, importId) as Array<Record<string, unknown>>;
    },

  };
}
