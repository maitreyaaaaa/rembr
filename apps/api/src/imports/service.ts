import { createHash } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { ImportParseError, parsePlatformExports } from './parser.js';
import { createImportRepository, ImportRepositoryError, type ImportFileInput } from './repository.js';
import { LocalImportStorage } from './storage.js';

export class ImportServiceError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ImportServiceError'; }
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

export function createImportService(database: DatabaseHandle, storage: LocalImportStorage) {
  const repository = createImportRepository(database);
  async function cleanup(ownerId: string, importId: string): Promise<boolean> {
    const files = repository.cleanupFiles(ownerId, importId); let success = true;
    for (const file of files) {
      try { await storage.removeFile(file.storage_key); }
      catch { success = false; }
    }
    repository.cleanup(ownerId, importId, success);
    return success;
  }

  async function processStagedImport(ownerId: string, importId: string): Promise<boolean> {
    const leaseToken = repository.claimForParsing(ownerId, importId);
    if (!leaseToken) return false;
    const rows = repository.files(ownerId, importId);
    const files = rows.map((row) => ({ id: String(row.id), key: String(row.storage_key), name: String(row.original_name), extension: String(row.extension) }));
    const parsed = []; const failures: Array<{ fileId: string; code: string }> = [];
    for (const file of files) {
      try {
        const bytes = await storage.readFile(file.key);
        if (bytes.length < 1 || bytes.length > IMPORT_FILE_LIMIT || !validSignature(file.extension, bytes)) throw new ImportServiceError('file_signature_mismatch');
        parsed.push(...parsePlatformExports([{ name: file.name, bytes }]));
      } catch (cause) {
        failures.push({ fileId: file.id, code: cause instanceof ImportParseError || cause instanceof ImportServiceError ? cause.code : 'file_read_failed' });
      }
    }
    try {
      if (!parsed.length && !failures.length) failures.push({ fileId: files[0]!.id, code: 'no_supported_items' });
      repository.accept(ownerId, importId, leaseToken, files, parsed, failures);
    } catch (cause) {
      const code = cause instanceof ImportRepositoryError ? cause.code : 'import_accept_failed';
      repository.fail(ownerId, importId, code, leaseToken);
      if (code === 'import_not_available') return false;
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
      if (!repository.cancelUpload(ownerId, importId)) return { cancelled: false, cleanupComplete: false };
      const cleaned = await cleanup(ownerId, importId);
      await storage.removeUnknown(repository.storageKeys());
      return { cancelled: true, cleanupComplete: cleaned };
    },

    async uploadChunk(ownerId: string, importId: string, fileId: string, index: number, bytes: Buffer) {
      const file = repository.file(ownerId, importId, fileId);
      if (!file) throw new ImportServiceError('not_found');
      if (!Number.isInteger(index) || index < 0 || index >= Number(file.chunk_count)) throw new ImportServiceError('invalid_chunk_index');
      if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > IMPORT_FILE_LIMIT) throw new ImportServiceError('invalid_chunk_size');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const prior = repository.chunk(ownerId, fileId, index);
      if (prior && prior.sha256 !== sha256) throw new ImportServiceError('chunk_conflict');
      if (prior && String(file.state) !== 'uploading') return { status: String(file.state), complete: true };
      if (String(file.state) !== 'uploading') throw new ImportServiceError('upload_not_available');
      const chunkKey = await storage.writeChunk(String(file.storage_key), index, bytes);
      let result;
      try { result = repository.recordChunk(ownerId, importId, fileId, index, bytes.length, sha256, chunkKey); }
      catch (cause) {
        if (!prior) await storage.removeChunk(String(file.storage_key), index).catch(() => undefined);
        throw new ImportServiceError(cause instanceof ImportRepositoryError ? cause.code : 'chunk_record_failed');
      }
      if (result.complete) {
        await storage.assemble(result.storageKey, Number(file.chunk_count), Number(file.expected_bytes));
        const allStaged = repository.markFileStaged(ownerId, importId, fileId);
        if (allStaged) return { status: 'staged', complete: true };
      }
      return { status: 'uploading', complete: false };
    },

    processNextImport() {
      const next = repository.staged(1)[0];
      if (!next) return Promise.resolve(null);
      return processStagedImport(next.owner_id, next.id).then(() => next.id);
    },

    async retryCleanup() {
      repository.expireStaleUploads(new Date(Date.now() - 24 * 60 * 60_000).toISOString());
      let processed = 0;
      for (const row of repository.cleanupPending()) { await cleanup(row.owner_id, row.id); processed += 1; }
      await storage.removeUnknown(repository.storageKeys());
      return processed;
    },

    get(ownerId: string, importId: string) {
      const data = repository.owned(ownerId, importId);
      return data ? { import: data, entries: repository.listEntries(ownerId, importId) } : null;
    },

    list(ownerId: string) { return repository.list(ownerId); },
  };
}
