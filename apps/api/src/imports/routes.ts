import express from 'express';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import { createImportService, ImportServiceError, IMPORT_FILE_LIMIT, IMPORT_TOTAL_LIMIT } from './service.js';
import type { ImportStorage } from './storage.js';

const createSchema = z.object({ files: z.array(z.object({ name: z.string().min(1).max(255), mime: z.string().max(120).default('application/octet-stream'), size: z.number().int(), chunks: z.number().int() }).strict()).min(1).max(20) }).strict();
function param(req: express.Request, key: string): string { const value = req.params[key]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function fail(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createImportRouter(database: DatabaseHandle, assetStorage: AssetStorage, storage: ImportStorage) {
  const router = express.Router(); const signedIn = requireUser(database); const profile = createProfileGate(database, assetStorage);
  const imports = createImportService(database, storage);

  router.get('/imports', signedIn, profile, async (req, res) => res.json({ imports: await imports.list(req.user!.id) }));
  router.get('/imports/:id', signedIn, profile, async (req, res) => {
    const result = await imports.get(req.user!.id, param(req, 'id'));
    return result ? res.json(result) : fail(res, 404, 'not_found', 'Import not found.', req.requestId);
  });
  router.get('/imports/:id/progress', signedIn, profile, async (req, res) => {
    const progress = await imports.progress(req.user!.id, param(req, 'id'));
    return progress ? res.json({ progress }) : fail(res, 404, 'not_found', 'Import not found.', req.requestId);
  });

  router.post('/imports/:id/cancel', signedIn, profile, async (req, res) => {
    try {
      const result = await imports.cancel(req.user!.id, param(req, 'id'));
      if (!result.cancelled) return fail(res, 409, 'upload_not_cancellable', 'This import can no longer be canceled.', req.requestId);
      return res.json({ importId: param(req, 'id'), status: 'failed', errorCode: 'upload_cancelled', cleanupStatus: result.cleanupComplete ? 'complete' : 'retry' });
    } catch {
      return fail(res, 500, 'import_cleanup_pending', 'The import was canceled, but temporary file cleanup will be retried.', req.requestId);
    }
  });

  router.post('/imports', signedIn, profile, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_import', 'Provide supported files with their sizes and chunk counts.', req.requestId);
    const total = parsed.data.files.reduce((sum, file) => sum + file.size, 0);
    if (total > IMPORT_TOTAL_LIMIT) return fail(res, 413, 'import_size_limit', 'An import cannot exceed 100 MiB total.', req.requestId);
    try {
      const suppliedKey = req.get('Idempotency-Key');
      if (suppliedKey && !/^[A-Za-z0-9._:-]{16,128}$/.test(suppliedKey)) return fail(res, 400, 'invalid_idempotency_key', 'The import retry key is invalid.', req.requestId);
      const result = await imports.create(req.user!.id, req.requestId ?? '', suppliedKey ?? req.requestId ?? '', parsed.data.files);
      return res.status(201).json({ importId: result.id, status: result.status, files: result.files.map((file) => ({ fileId: file.id, name: file.name, size: file.size, chunks: file.chunks })) });
    } catch (cause) {
      const code = cause instanceof ImportServiceError ? cause.code : 'invalid_import';
      if (cause instanceof Error && 'code' in cause && cause.code === 'idempotency_key_conflict') return fail(res, 409, 'idempotency_key_conflict', 'This retry key already belongs to a different file selection.', req.requestId);
      const status = ['file_size_limit', 'import_size_limit'].includes(code) ? 413 : 400;
      return fail(res, status, code, 'One or more files are unsupported or exceed the upload limits.', req.requestId);
    }
  });

  router.put('/imports/:id/files/:fileId/chunks/:chunkIndex', signedIn, profile,
    express.raw({ type: 'application/octet-stream', limit: IMPORT_FILE_LIMIT }), async (req, res) => {
      if (!Buffer.isBuffer(req.body)) return fail(res, 415, 'invalid_chunk_type', 'Upload each part as application/octet-stream.', req.requestId);
      const index = Number(param(req, 'chunkIndex'));
      try {
        const result = await imports.uploadChunk(req.user!.id, param(req, 'id'), param(req, 'fileId'), index, req.body);
        return res.status(result.complete ? 202 : 200).json({ importId: param(req, 'id'), status: result.status, complete: result.complete });
      } catch (cause) {
        const code = cause instanceof ImportServiceError ? cause.code : 'chunk_upload_failed';
        if (code === 'not_found') return fail(res, 404, code, 'Import file not found.', req.requestId);
        if (code === 'chunk_conflict') return fail(res, 409, code, 'This chunk index already contains different data.', req.requestId);
        const status = ['invalid_chunk_size', 'import_byte_limit'].includes(code) ? 413 : 400;
        return fail(res, status, code, 'The upload part could not be accepted.', req.requestId);
      }
    });

  return router;
}
