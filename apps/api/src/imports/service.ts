import { createHash } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { ImportParseError, parsePlatformExportFile, selectParsedImportItems } from './parser.js';
import { createImportRepository, ImportRepositoryError, type ImportFileInput } from './repository.js';
import type { ImportStorage } from './storage.js';
import { withOwnerWorkLease } from '../account/owner-lifecycle.js';

export class ImportServiceError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ImportServiceError'; }
}

export interface ImportProgress {
  importId: string;
  status: string;
  total: number;
  settled: number;
  saved: number;
  paused: number;
  queued: number;
  processing: number;
  retryWaiting: number;
  failed: number;
  cancelled: number;
  parseFailed: number;
}

export const IMPORT_FILE_LIMIT = 25 * 1024 * 1024;
export const IMPORT_TOTAL_LIMIT = 100 * 1024 * 1024;

const extensionMimes: Record<string, string[]> = {
  html: ['text/html', 'application/xhtml+xml', 'text/plain', 'application/octet-stream', ''],
  htm: ['text/html', 'application/xhtml+xml', 'text/plain', 'application/octet-stream', ''],
  zip: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream', ''],
  json: ['application/json', 'text/json', 'text/plain', 'application/octet-stream', ''],
  js: ['text/javascript', 'application/javascript', 'text/plain', 'application/octet-stream', ''],
  csv: ['text/csv', 'application/csv', 'text/plain', 'application/octet-stream', ''],
  txt: ['text/plain', 'application/octet-stream', ''],
};

export function validateImportFiles(files: ImportFileInput[]): void {
  if (!files.length || files.length > 20) throw new ImportServiceError('invalid_file_count');
  let total = 0;
  for (const file of files) {
    const name = file.name.replaceAll('\\', '/').split('/').at(-1) ?? '';
    const extension = name.toLowerCase().split('.').at(-1) ?? '';
    const mime = file.mime.trim().toLowerCase().split(';')[0] ?? '';
    if (!extensionMimes[extension]) throw new ImportServiceError('unsupported_file_type');
    if (!extensionMimes[extension]!.includes(mime)) throw new ImportServiceError('mime_extension_mismatch');
    if (!Number.isInteger(file.size) || file.size < 1 || file.size > IMPORT_FILE_LIMIT) throw new ImportServiceError('file_size_limit');
    if (!Number.isInteger(file.chunks) || file.chunks < 1 || file.chunks > 100 || file.chunks > file.size) throw new ImportServiceError('chunk_count_limit');
    total += file.size;
  }
  if (total > IMPORT_TOTAL_LIMIT) throw new ImportServiceError('import_size_limit');
}

function validSignature(extension: string, bytes: Buffer): boolean {
  if (extension === 'zip') return bytes.length >= 4 && bytes.subarray(0, 2).equals(Buffer.from([0x50, 0x4b]));
  return !bytes.includes(0);
}

export function createImportService(database: DatabaseHandle, storage: ImportStorage) {
  const repository = createImportRepository(database);
  async function cleanup(ownerId: string, importId: string): Promise<boolean> {
    const files = await repository.cleanupFiles(ownerId, importId); let success = true;
    for (const file of files) {
      try { await storage.removeFile(file.storage_key); }
      catch { success = false; }
    }
    await repository.cleanup(ownerId, importId, success);
    return success;
  }

  async function processStagedImport(ownerId: string, importId: string): Promise<boolean> {
    const leaseToken = await repository.claimForParsing(ownerId, importId);
    if (!leaseToken) return false;
    const rows = await repository.files(ownerId, importId);
    const files = rows.map((row) => ({ id: String(row.id), key: String(row.storage_key), name: String(row.original_name), extension: String(row.extension) }));
    const parsedCandidates = []; const failures: Array<{ fileId: string; code: string }> = [];
    for (const file of files) {
      try {
        const bytes = await storage.readFile(file.key);
        if (bytes.length < 1 || bytes.length > IMPORT_FILE_LIMIT || !validSignature(file.extension, bytes)) throw new ImportServiceError('file_signature_mismatch');
        parsedCandidates.push(...parsePlatformExportFile({ name: file.name, bytes }));
      } catch (cause) {
        failures.push({ fileId: file.id, code: cause instanceof ImportParseError || cause instanceof ImportServiceError ? cause.code : 'file_read_failed' });
      }
    }
    try {
      const { items: parsed, instagramSkippedCount } = selectParsedImportItems(parsedCandidates);
      if (!parsed.length && !failures.length) failures.push({ fileId: files[0]!.id, code: 'no_supported_items' });
      await repository.accept(ownerId, importId, leaseToken, files, parsed, failures, instagramSkippedCount);
    } catch (cause) {
      const code = cause instanceof ImportRepositoryError ? cause.code : 'import_accept_failed';
      await repository.fail(ownerId, importId, code, leaseToken);
      if (code === 'import_not_available' || code === 'account_inactive') return false;
    }
    await cleanup(ownerId, importId);
    return true;
  }

  return {
    create(ownerId: string, requestId: string, idempotencyKey: string, files: ImportFileInput[]) {
      validateImportFiles(files);
      return repository.create(ownerId, requestId, idempotencyKey, files);
    },

    async cancel(ownerId: string, importId: string): Promise<{ cancelled: boolean; cleanupComplete: boolean }> {
      if (!await repository.cancelUpload(ownerId, importId)) return { cancelled: false, cleanupComplete: false };
      const cleaned = await cleanup(ownerId, importId);
      await storage.removeUnknown(await repository.storageKeys());
      return { cancelled: true, cleanupComplete: cleaned };
    },

    async cancelQueuedWork(ownerId: string, importId: string) {
      return repository.cancelQueuedWork(ownerId, importId);
    },

    async discardCreatedItems(ownerId: string, importId: string, deleteItem: (ownerId: string, itemId: string) => Promise<boolean>) {
      const imported = await repository.owned(ownerId, importId);
      if (!imported) return { found: false, deleted: 0, active: 0 };
      const active = await repository.activeWork(ownerId, importId);
      if (active > 0) return { found: true, deleted: 0, active };
      const rows = await repository.createdItems(ownerId, importId);
      let deleted = 0;
      for (const row of rows) if (await deleteItem(ownerId, row.item_id)) deleted += 1;
      return { found: true, deleted, active: 0 };
    },

    async uploadChunk(ownerId: string, importId: string, fileId: string, index: number, bytes: Buffer) {
      const file = await repository.file(ownerId, importId, fileId);
      if (!file) throw new ImportServiceError('not_found');
      if (!Number.isInteger(index) || index < 0 || index >= Number(file.chunk_count)) throw new ImportServiceError('invalid_chunk_index');
      if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > IMPORT_FILE_LIMIT) throw new ImportServiceError('invalid_chunk_size');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const prior = await repository.chunk(ownerId, fileId, index);
      if (prior && prior.sha256 !== sha256) throw new ImportServiceError('chunk_conflict');
      if (prior && String(file.state) !== 'uploading') return { status: String(file.state), complete: true };
      if (String(file.state) !== 'uploading') throw new ImportServiceError('upload_not_available');
      return withOwnerWorkLease(database, ownerId, 'import_upload', async (signal) => {
        const chunkKey = await storage.writeChunk(String(file.storage_key), index, bytes, signal);
        let result;
        try { result = await repository.recordChunk(ownerId, importId, fileId, index, bytes.length, sha256, chunkKey); }
        catch (cause) {
          if (!prior) await storage.removeChunk(String(file.storage_key), index).catch(() => undefined);
          throw new ImportServiceError(cause instanceof ImportRepositoryError ? cause.code : 'chunk_record_failed');
        }
        if (result.complete) {
          try {
            await storage.assemble(result.storageKey, Number(file.chunk_count), Number(file.expected_bytes), signal);
            const allStaged = await repository.markFileStaged(ownerId, importId, fileId);
            if (allStaged) return { status: 'staged', complete: true };
          } catch (cause) {
            if (cause instanceof ImportRepositoryError && cause.code === 'account_inactive') {
              await storage.removeFile(result.storageKey).catch(() => undefined);
            }
            throw new ImportServiceError(cause instanceof ImportRepositoryError ? cause.code : 'file_assembly_failed');
          }
        }
        return { status: 'uploading', complete: false };
      });
    },

    async processNextImport() {
      const next = (await repository.staged(1))[0];
      if (!next) return Promise.resolve(null);
      return processStagedImport(next.owner_id, next.id).then(() => next.id);
    },

    async retryCleanup() {
      await repository.expireStaleUploads(new Date(Date.now() - 24 * 60 * 60_000).toISOString());
      let processed = 0;
      for (const row of await repository.cleanupPending()) { await cleanup(row.owner_id, row.id); processed += 1; }
      await storage.removeUnknown(await repository.storageKeys());
      return processed;
    },

    async get(ownerId: string, importId: string) {
      const data = await repository.owned(ownerId, importId);
      return data ? { import: data, entries: await repository.listEntries(ownerId, importId) } : null;
    },

    async progress(ownerId: string, importId: string): Promise<ImportProgress | null> {
      const row = await repository.progress(ownerId, importId);
      if (!row) return null;
      return {
        importId: String(row.importId),
        status: String(row.status),
        total: Number(row.total ?? 0),
        settled: Number(row.settled ?? 0),
        saved: Number(row.saved ?? 0),
        paused: Number(row.paused ?? 0),
        queued: Number(row.queued ?? 0),
        processing: Number(row.processing ?? 0),
        retryWaiting: Number(row.retryWaiting ?? 0),
        failed: Number(row.failed ?? 0),
        cancelled: Number(row.cancelled ?? 0),
        parseFailed: Number(row.parseFailed ?? 0),
      };
    },

    list(ownerId: string) { return repository.list(ownerId); },
  };
}
