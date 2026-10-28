import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { DatabaseHandle } from '../db/database.js';
import type { ParsedImportItem } from './parser.js';

export interface ImportFileInput { name: string; mime: string; size: number; chunks: number }
export class ImportRepositoryError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ImportRepositoryError'; }
}

export function createImportRepository(database: DatabaseHandle) {
  return {
    create(ownerId: string, requestId: string, files: ImportFileInput[]) {
      const id = randomUUID(); const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        database.prepare(`INSERT INTO imports (id,owner_id,request_id,source,status,file_count,created_at,updated_at)
          VALUES (?,?,?,'unknown','uploading',?,?,?)`).run(id, ownerId, requestId, files.length, now, now);
        const insert = database.prepare(`INSERT INTO import_upload_files
          (id,owner_id,import_id,original_name,extension,declared_mime,expected_bytes,chunk_count,storage_key,state,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,'uploading',?,?)`);
        const result = files.map((file) => {
          const fileId = randomUUID(); const cleanName = basename(file.name.replaceAll('\\', '/')).slice(0, 255);
          const extension = cleanName.toLowerCase().split('.').at(-1) ?? '';
          insert.run(fileId, ownerId, id, cleanName, extension, file.mime.slice(0, 120), file.size, file.chunks, randomUUID(), now, now);
          return { id: fileId, name: cleanName, size: file.size, chunks: file.chunks };
        });
        database.prepare('UPDATE imports SET total_bytes=? WHERE id=? AND owner_id=?')
          .run(files.reduce((total, file) => total + file.size, 0), id, ownerId);
        return result;
      });
      return { id, files: transaction.immediate() };
    },

    owned(ownerId: string, importId: string) {
      return database.prepare(`SELECT id,request_id,source,status,total_bytes,file_count,parsed_count,new_count,
          duplicate_count,skipped_count,failed_count,cleanup_status,error_code,created_at,updated_at,completed_at
        FROM imports WHERE owner_id=? AND id=?`).get(ownerId, importId) as Record<string, unknown> | undefined;
    },

    files(ownerId: string, importId: string) {
      return database.prepare(`SELECT id,original_name,extension,declared_mime,expected_bytes,received_bytes,
          chunk_count,chunks_received,storage_key,state FROM import_upload_files
        WHERE owner_id=? AND import_id=? ORDER BY created_at,id`).all(ownerId, importId) as Array<Record<string, unknown>>;
    },

    file(ownerId: string, importId: string, fileId: string) {
      return database.prepare(`SELECT id,original_name,extension,declared_mime,expected_bytes,received_bytes,chunk_count,chunks_received,storage_key,state
        FROM import_upload_files WHERE owner_id=? AND import_id=? AND id=?`).get(ownerId, importId, fileId) as Record<string, unknown> | undefined;
    },

    chunk(ownerId: string, fileId: string, index: number) {
      return database.prepare(`SELECT sha256,storage_key FROM import_upload_chunks WHERE owner_id=? AND upload_file_id=? AND chunk_index=?`)
        .get(ownerId, fileId, index) as { sha256: string; storage_key: string } | undefined;
    },

    list(ownerId: string, limit = 25) {
      return database.prepare(`SELECT id,request_id,source,status,total_bytes,file_count,parsed_count,new_count,duplicate_count,
          skipped_count,failed_count,cleanup_status,error_code,created_at,updated_at,completed_at
        FROM imports WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).all(ownerId, limit) as Array<Record<string, unknown>>;
    },

    staged(limit = 10) {
      return database.prepare(`SELECT id,owner_id FROM imports WHERE status='staged' OR (status='parsing' AND lease_expires_at<=?) ORDER BY created_at,id LIMIT ?`)
        .all(new Date().toISOString(), limit) as Array<{ id: string; owner_id: string }>;
    },

    cleanupPending(limit = 20) {
      return database.prepare(`SELECT id,owner_id FROM imports WHERE cleanup_status='retry' ORDER BY updated_at LIMIT ?`)
        .all(limit) as Array<{ id: string; owner_id: string }>;
    },

    storageKeys() {
      const files = new Set((database.prepare(`SELECT storage_key FROM import_upload_files WHERE state!='deleted'`).all() as Array<{ storage_key: string }>).map((row) => row.storage_key));
      const chunks = new Set((database.prepare(`SELECT storage_key FROM import_upload_chunks`).all() as Array<{ storage_key: string }>).map((row) => row.storage_key));
      return { files, chunks };
    },

    expireStaleUploads(cutoff: string) {
      const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        const rows = database.prepare(`SELECT id,owner_id FROM imports WHERE status='uploading' AND updated_at<?`).all(cutoff) as Array<{ id: string; owner_id: string }>;
        for (const row of rows) {
          database.prepare(`UPDATE imports SET status='expired',error_code='upload_expired',cleanup_status='retry',updated_at=?,completed_at=? WHERE id=? AND owner_id=?`)
            .run(now, now, row.id, row.owner_id);
          database.prepare(`UPDATE import_upload_files SET state='failed',updated_at=? WHERE owner_id=? AND import_id=?`).run(now, row.owner_id, row.id);
        }
        return rows;
      });
      return transaction.immediate();
    },

    recordChunk(ownerId: string, importId: string, fileId: string, index: number, bytes: number, sha256: string, storageKey: string) {
      const transaction = database.transaction(() => {
        const file = this.file(ownerId, importId, fileId);
        if (!file || file.state !== 'uploading') throw new ImportRepositoryError('upload_not_available');
        const existing = database.prepare(`SELECT sha256 FROM import_upload_chunks WHERE owner_id=? AND upload_file_id=? AND chunk_index=?`)
          .get(ownerId, fileId, index) as { sha256: string } | undefined;
        if (existing) {
          if (existing.sha256 !== sha256) throw new ImportRepositoryError('chunk_conflict');
          return { duplicate: true, complete: Number(file.chunks_received) === Number(file.chunk_count), storageKey: String(file.storage_key) };
        }
        const total = Number(file.received_bytes) + bytes;
        if (total > Number(file.expected_bytes)) throw new ImportRepositoryError('import_byte_limit');
        const now = new Date().toISOString();
        database.prepare(`INSERT INTO import_upload_chunks (id,owner_id,upload_file_id,chunk_index,byte_size,sha256,storage_key,created_at)
          VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), ownerId, fileId, index, bytes, sha256, storageKey, now);
        const count = Number(file.chunks_received) + 1;
        if (count > Number(file.chunk_count)) throw new ImportRepositoryError('too_many_chunks');
        if (count === Number(file.chunk_count) && total !== Number(file.expected_bytes)) throw new ImportRepositoryError('import_byte_count_mismatch');
        database.prepare(`UPDATE import_upload_files SET received_bytes=?,chunks_received=?,updated_at=?
          WHERE owner_id=? AND import_id=? AND id=?`).run(total, count, now, ownerId, importId, fileId);
        return { duplicate: false, complete: count === Number(file.chunk_count), storageKey: String(file.storage_key) };
      });
      return transaction.immediate();
    },

    markFileStaged(ownerId: string, importId: string, fileId: string) {
      const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        const changed = database.prepare(`UPDATE import_upload_files SET state='staged',updated_at=?
          WHERE owner_id=? AND import_id=? AND id=? AND state='uploading' AND chunks_received=chunk_count AND received_bytes=expected_bytes`)
          .run(now, ownerId, importId, fileId);
        if (changed.changes !== 1) return false;
        const remaining = database.prepare(`SELECT count(*) AS count FROM import_upload_files
          WHERE owner_id=? AND import_id=? AND state!='staged'`).get(ownerId, importId) as { count: number };
        if (remaining.count === 0) database.prepare(`UPDATE imports SET status='staged',updated_at=? WHERE owner_id=? AND id=? AND status='uploading'`).run(now, ownerId, importId);
        return remaining.count === 0;
      });
      return transaction.immediate();
    },

    claimForParsing(ownerId: string, importId: string): string | null {
      const now = new Date(); const timestamp = now.toISOString(); const lease = randomUUID();
      const transaction = database.transaction(() => {
        const result = database.prepare(`UPDATE imports SET status='parsing',lease_token=?,lease_expires_at=?,updated_at=?
          WHERE owner_id=? AND id=? AND (status='staged' OR (status='parsing' AND lease_expires_at<=?))`)
          .run(lease, new Date(now.getTime() + 30 * 60_000).toISOString(), timestamp, ownerId, importId, timestamp);
        if (result.changes !== 1) return null;
        database.prepare(`UPDATE import_upload_files SET state='parsing',updated_at=? WHERE owner_id=? AND import_id=? AND state IN ('staged','parsing')`).run(timestamp, ownerId, importId);
        return lease;
      });
      return transaction.immediate();
    },

    accept(ownerId: string, importId: string, leaseToken: string, files: Array<{ id: string; key: string; name: string }>, items: ParsedImportItem[], failures: Array<{ fileId: string; code: string }> = []) {
      const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        const state = database.prepare('SELECT status,lease_token FROM imports WHERE owner_id=? AND id=?').get(ownerId, importId) as { status: string; lease_token: string | null } | undefined;
        if (!state || state.status !== 'parsing' || state.lease_token !== leaseToken) throw new ImportRepositoryError('import_not_available');
        const sourcePlatforms = [...new Set(items.map((item) => item.platform))];
        const source = sourcePlatforms.length === 1 ? sourcePlatforms[0]! : sourcePlatforms.length ? 'mixed' : 'unknown';
        let newCount = 0; let duplicateCount = 0;
        const addEntry = database.prepare(`INSERT INTO import_entries
          (id,owner_id,import_id,upload_file_id,item_id,job_id,source_platform,source_url,source_id,title,source_metadata_json,status,error_code,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const failure of failures) {
          const uploadFile = files.find((file) => file.id === failure.fileId);
          addEntry.run(randomUUID(), ownerId, importId, failure.fileId, null, null, 'unknown', null, null, '', '{}', 'failed', failure.code, now);
          if (!uploadFile) throw new ImportRepositoryError('upload_file_not_found');
        }
        for (const entry of items) {
          const uploadFileId = files.find((file) => file.name === entry.metadata.sourceFile)?.id ?? null;
          const existing = database.prepare('SELECT id FROM saved_items WHERE owner_id=? AND canonical_url=?').get(ownerId, entry.url) as { id: string } | undefined;
          if (existing) {
            addEntry.run(randomUUID(), ownerId, importId, uploadFileId, existing.id, null, entry.platform, entry.url, entry.sourceId, entry.title, JSON.stringify(entry.metadata), 'duplicate', null, now);
            duplicateCount += 1; continue;
          }
          const itemId = randomUUID(); const jobId = randomUUID(); const correlationId = String(this.owned(ownerId, importId)?.request_id ?? importId);
          const hashtags = Array.isArray(entry.metadata.hashtags) ? entry.metadata.hashtags : [];
          database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,description,status,created_at,updated_at,source_platform,source_id,source_metadata_json)
            VALUES (?,?,?,?,?,?,'queued',?,?,?,?,?)`).run(itemId, ownerId, entry.url, entry.url, entry.title, entry.description, now, now, entry.platform, entry.sourceId, JSON.stringify(entry.metadata));
          database.prepare(`INSERT INTO processing_jobs (id,owner_id,item_id,import_id,correlation_id,status,available_at,created_at,updated_at)
            VALUES (?,?,?,?,?,'queued',?,?,?)`).run(jobId, ownerId, itemId, importId, correlationId, now, now, now);
          addEntry.run(randomUUID(), ownerId, importId, uploadFileId, itemId, jobId, entry.platform, entry.url, entry.sourceId, entry.title, JSON.stringify(entry.metadata), 'queued', null, now);
          for (const rawTag of hashtags.slice(0, 20)) {
            const name = String(rawTag).trim().slice(0, 40); const normalized = name.toLowerCase(); if (!normalized) continue;
            database.prepare(`INSERT OR IGNORE INTO tags (id,owner_id,normalized_name,display_name,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
              .run(randomUUID(), ownerId, normalized, name, now, now);
            const tag = database.prepare('SELECT id FROM tags WHERE owner_id=? AND normalized_name=?').get(ownerId, normalized) as { id: string } | undefined;
            if (tag) database.prepare('INSERT OR IGNORE INTO item_tags (owner_id,item_id,tag_id,created_at) VALUES (?,?,?,?)').run(ownerId, itemId, tag.id, now);
          }
          const collections = Array.isArray(entry.metadata.collections) ? entry.metadata.collections : entry.collection ? [entry.collection] : [];
          for (const collectionName of collections.slice(0, 20)) {
            const name = String(collectionName).trim().slice(0, 80); const normalized = name.toLowerCase();
            if (normalized) {
              database.prepare(`INSERT OR IGNORE INTO collections (id,owner_id,name,normalized_name,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
                .run(randomUUID(), ownerId, name, normalized, now, now);
              const collection = database.prepare('SELECT id FROM collections WHERE owner_id=? AND normalized_name=?').get(ownerId, normalized) as { id: string } | undefined;
              if (collection) database.prepare('INSERT OR IGNORE INTO collection_items (owner_id,collection_id,item_id,created_at) VALUES (?,?,?,?)').run(ownerId, collection.id, itemId, now);
            }
          }
          newCount += 1;
        }
        const parsedCount = items.length;
        const failedCount = failures.length;
        const status = failedCount ? (newCount || duplicateCount ? 'partial' : 'failed') : newCount ? 'queued' : parsedCount ? 'completed' : 'failed';
        const errorCode = failedCount ? 'some_files_failed' : parsedCount ? null : 'no_supported_items';
        database.prepare(`UPDATE imports SET source=?,status=?,parsed_count=?,new_count=?,duplicate_count=?,failed_count=?,error_code=?,updated_at=?,completed_at=?,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=? AND id=? AND lease_token=?`)
          .run(source, status, parsedCount, newCount, duplicateCount, failedCount, errorCode, now, newCount ? null : now, ownerId, importId, leaseToken);
        database.prepare(`UPDATE import_upload_files SET state='accepted',updated_at=? WHERE owner_id=? AND import_id=?`).run(now, ownerId, importId);
        return { status, parsedCount, newCount, duplicateCount, skippedCount: 0, failedCount };
      });
      return transaction.immediate();
    },

    fail(ownerId: string, importId: string, code: string, leaseToken?: string) {
      const now = new Date().toISOString();
      database.prepare(`UPDATE imports SET status='failed',error_code=?,failed_count=max(failed_count,1),updated_at=?,completed_at=?
        ,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=? AND id=? AND status IN ('uploading','staged','parsing')
        AND (? IS NULL OR lease_token=?)`).run(code, now, now, ownerId, importId, leaseToken ?? null, leaseToken ?? null);
      database.prepare(`UPDATE import_upload_files SET state='failed',updated_at=? WHERE owner_id=? AND import_id=? AND state!='deleted'`).run(now, ownerId, importId);
    },

    cleanup(ownerId: string, importId: string, success: boolean) {
      const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        database.prepare(`UPDATE imports SET cleanup_status=?,cleanup_attempts=cleanup_attempts+1,updated_at=?,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=? AND id=?`)
          .run(success ? 'complete' : 'retry', now, ownerId, importId);
        if (success) {
          database.prepare(`DELETE FROM import_upload_chunks WHERE owner_id=? AND upload_file_id IN
            (SELECT id FROM import_upload_files WHERE owner_id=? AND import_id=?)`).run(ownerId, ownerId, importId);
          database.prepare(`UPDATE import_upload_files SET state='deleted',updated_at=? WHERE owner_id=? AND import_id=?`).run(now, ownerId, importId);
        }
      });
      transaction.immediate();
    },

    cleanupFiles(ownerId: string, importId: string) {
      return database.prepare(`SELECT id,storage_key FROM import_upload_files WHERE owner_id=? AND import_id=? AND state!='deleted'`)
        .all(ownerId, importId) as Array<{ id: string; storage_key: string }>;
    },

    listEntries(ownerId: string, importId: string) {
      return database.prepare(`SELECT id,item_id,source_platform,source_url,source_id,title,status,error_code,created_at
        FROM import_entries WHERE owner_id=? AND import_id=? ORDER BY created_at,id`).all(ownerId, importId) as Array<Record<string, unknown>>;
    },

  };
}
