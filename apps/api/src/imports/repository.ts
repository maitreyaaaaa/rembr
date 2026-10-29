import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { DatabaseHandle } from '../db/database.js';
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
        return { id, status: 'uploading', files: result };
      });
      return await transaction();
    },

    async owned(ownerId: string, importId: string) {
      return await database.prepare(`SELECT id,request_id,source,status,total_bytes,file_count,parsed_count,new_count,
          duplicate_count,skipped_count,failed_count,cleanup_status,error_code,created_at,updated_at,completed_at
        FROM imports WHERE owner_id=? AND id=?`).get(ownerId, importId) as Record<string, unknown> | undefined;
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

    recordChunk(ownerId: string, importId: string, fileId: string, index: number, bytes: number, sha256: string, storageKey: string) {
      const transaction = database.transaction(async () => {
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
        const result = await database.prepare(`UPDATE imports SET status='parsing',lease_token=?,lease_expires_at=?,updated_at=?
          WHERE owner_id=? AND id=? AND (status='staged' OR (status='parsing' AND lease_expires_at<=?))`)
          .run(lease, new Date(now.getTime() + 30 * 60_000).toISOString(), timestamp, ownerId, importId, timestamp);
        if (result.changes !== 1) return null;
        await database.prepare(`UPDATE import_upload_files SET state='parsing',updated_at=? WHERE owner_id=? AND import_id=? AND state IN ('staged','parsing')`).run(timestamp, ownerId, importId);
        return lease;
      });
      return transaction();
    },

    accept(ownerId: string, importId: string, leaseToken: string, files: Array<{ id: string; key: string; name: string }>, items: ParsedImportItem[], failures: Array<{ fileId: string; code: string }> = []) {
      const now = new Date().toISOString();
      const transaction = database.transaction(async () => {
        const state = await database.prepare('SELECT status,lease_token,request_id FROM imports WHERE owner_id=? AND id=?').get(ownerId, importId) as { status: string; lease_token: string | null; request_id: string | null } | undefined;
        if (!state || state.status !== 'parsing' || state.lease_token !== leaseToken) throw new ImportRepositoryError('import_not_available');
        const sourcePlatforms = [...new Set(items.map((item) => item.platform))];
        const source = sourcePlatforms.length === 1 ? sourcePlatforms[0]! : sourcePlatforms.length ? 'mixed' : 'unknown';
        let newCount = 0; let duplicateCount = 0;
        const fileIdsByName = new Map(files.map((file) => [file.name, file.id]));
        const fileIds = new Set(files.map((file) => file.id));
        const entryRows: SqlRow[] = [];
        const savedItemRows: SqlRow[] = [];
        const jobRows: SqlRow[] = [];
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
          entryRows.push([randomUUID(), ownerId, importId, failure.fileId, null, null, 'unknown', null, null, '', '{}', 'failed', failure.code, now]);
        }
        for (const entry of items) {
          const uploadFileId = fileIdsByName.get(String(entry.metadata.sourceFile ?? '')) ?? null;
          const existingItemId = itemIdsByUrl.get(entry.url);
          if (existingItemId) {
            entryRows.push([randomUUID(), ownerId, importId, uploadFileId, existingItemId, null, entry.platform, entry.url, entry.sourceId, entry.title, JSON.stringify(entry.metadata), 'duplicate', null, now]);
            duplicateCount += 1; continue;
          }
          const itemId = randomUUID(); const jobId = randomUUID(); const correlationId = String(state.request_id ?? importId);
          const hashtags = Array.isArray(entry.metadata.hashtags) ? entry.metadata.hashtags : [];
          savedItemRows.push([itemId, ownerId, entry.url, entry.url, entry.title, entry.description, now, now, entry.platform, entry.sourceId, JSON.stringify(entry.metadata)]);
          jobRows.push([jobId, ownerId, itemId, importId, correlationId, now, now, now]);
          entryRows.push([randomUUID(), ownerId, importId, uploadFileId, itemId, jobId, entry.platform, entry.url, entry.sourceId, entry.title, JSON.stringify(entry.metadata), 'queued', null, now]);
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
        await insertRows(database, 'processing_jobs', ['id','owner_id','item_id','import_id','correlation_id','status','available_at','created_at','updated_at'], jobRows.map((row) => [...row.slice(0, 5), 'queued', ...row.slice(5)]));
        await insertRows(database, 'import_entries', ['id','owner_id','import_id','upload_file_id','item_id','job_id','source_platform','source_url','source_id','title','source_metadata_json','status','error_code','created_at'], entryRows);

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
        await database.prepare(`UPDATE imports SET source=?,status=?,parsed_count=?,new_count=?,duplicate_count=?,failed_count=?,error_code=?,updated_at=?,completed_at=?,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=? AND id=? AND lease_token=?`)
          .run(source, status, parsedCount, newCount, duplicateCount, failedCount, errorCode, now, newCount ? null : now, ownerId, importId, leaseToken);
        await database.prepare(`UPDATE import_upload_files SET state='accepted',updated_at=? WHERE owner_id=? AND import_id=?`).run(now, ownerId, importId);
        return { status, parsedCount, newCount, duplicateCount, skippedCount: 0, failedCount };
      });
      return transaction();
    },

    async fail(ownerId: string, importId: string, code: string, leaseToken?: string) {
      const now = new Date().toISOString();
      await database.prepare(`UPDATE imports SET status='failed',error_code=?,failed_count=GREATEST(failed_count,1),updated_at=?,completed_at=?
        ,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=? AND id=? AND status IN ('uploading','staged','parsing')
        AND (? IS NULL OR lease_token=?)`).run(code, now, now, ownerId, importId, leaseToken ?? null, leaseToken ?? null);
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
      return await database.prepare(`SELECT id,item_id,source_platform,source_url,source_id,title,status,error_code,created_at
        FROM import_entries WHERE owner_id=? AND import_id=? ORDER BY created_at,id`).all(ownerId, importId) as Array<Record<string, unknown>>;
    },

  };
}
