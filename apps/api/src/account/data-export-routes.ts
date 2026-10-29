import { rateLimit } from 'express-rate-limit';
import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth/sessions.js';
import type { DatabaseHandle } from '../db/database.js';
import { AccountDataExportError } from './data-export-service.js';

const idSchema = z.string().uuid();
const requestSchema = z.object({ includeFiles: z.boolean().optional() }).strict();
const exportId = (value: string | string[] | undefined): string | null => typeof value === 'string' && idSchema.safeParse(value).success ? value : null;
const response = (res: express.Response, status: number, code: string, message: string, requestId?: string) =>
  res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });

export function createDataExportRouter(database: DatabaseHandle, service: {
  request(ownerId: string, includeFiles?: boolean): Promise<unknown>;
  list(ownerId: string, limit?: number): Promise<unknown>;
  getStatus(ownerId: string, id: string): Promise<{ status: string } | null>;
  cancel(ownerId: string, id: string): Promise<unknown | null>;
  retry(ownerId: string, id: string): Promise<unknown | null>;
  getDownload(ownerId: string, id: string): Promise<{ bytes: Buffer; contentType: 'application/zip'; fileName: string } | null>;
}): express.Router {
  const router = express.Router();
  const auth = requireUser(database) as RequestHandler;
  const createLimit = rateLimit({ windowMs: 15 * 60_000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false });
  const readLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  const mutateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
  router.use('/account/data-exports', (_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' });
    next();
  });
  router.post('/account/data-exports', auth, createLimit, async (req, res, next) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return response(res, 400, 'invalid_input', 'Use an optional includeFiles boolean.', req.requestId);
    try { return res.status(202).json(await service.request(req.user!.id, parsed.data.includeFiles ?? false)); }
    catch (error) { if (error instanceof AccountDataExportError) return response(res, 413, error.code, error.message, req.requestId); next(error); }
  });
  router.get('/account/data-exports', auth, readLimit, async (req, res, next) => {
    try { return res.json({ exports: await service.list(req.user!.id, 5) }); }
    catch (error) { next(error); }
  });
  router.get('/account/data-exports/:id', auth, readLimit, async (req, res, next) => {
    const id = exportId(req.params.id);
    if (!id) return response(res, 404, 'not_found', 'This export request does not exist.', req.requestId);
    try { const result = await service.getStatus(req.user!.id, id); return result ? res.json(result) : response(res, 404, 'not_found', 'This export request does not exist.', req.requestId); }
    catch (error) { next(error); }
  });
  for (const action of ['cancel', 'retry'] as const) {
    router.post(`/account/data-exports/:id/${action}`, auth, mutateLimit, async (req, res, next) => {
      const id = exportId(req.params.id);
      if (!id) return response(res, 404, 'not_found', 'This export request does not exist.', req.requestId);
      try {
        const result = await service[action](req.user!.id, id);
        if (result) return res.json(result);
        const status = await service.getStatus(req.user!.id, id);
        if (!status) return response(res, 404, 'not_found', 'This export request does not exist.', req.requestId);
        return response(res, 409, action === 'cancel' ? 'export_not_cancellable' : 'export_not_retryable',
          action === 'cancel' ? 'Only queued or failed exports can be cancelled.' : 'Only failed exports with retry attempts remaining can be retried.', req.requestId);
      } catch (error) { next(error); }
    });
  }
  router.get('/account/data-exports/:id/download', auth, readLimit, async (req, res, next) => {
    const id = exportId(req.params.id);
    if (!id) return response(res, 404, 'not_found', 'This export request does not exist.', req.requestId);
    try {
      const status = await service.getStatus(req.user!.id, id);
      if (!status) return response(res, 404, 'not_found', 'This export request does not exist.', req.requestId);
      if (status.status === 'expired') return response(res, 410, 'export_expired', 'This export has expired. Request a new export.', req.requestId);
      if (status.status !== 'ready') return response(res, 409, 'export_not_ready', 'This export is not ready to download.', req.requestId);
      const download = await service.getDownload(req.user!.id, id);
      if (!download) {
        const latest = await service.getStatus(req.user!.id, id);
        if (!latest) return response(res, 404, 'not_found', 'This export request does not exist.', req.requestId);
        if (latest.status === 'expired') return response(res, 410, 'export_expired', 'This export has expired. Request a new export.', req.requestId);
        if (latest.status === 'failed') return response(res, 503, 'export_artifact_unavailable', 'The export file is unavailable. Request a new export.', req.requestId);
        return response(res, 409, 'export_not_ready', 'This export is not ready to download.', req.requestId);
      }
      res.type(download.contentType).set('Content-Disposition', 'attachment; filename="rembr-personal-data.zip"').set('Content-Length', String(download.bytes.length));
      return res.send(download.bytes);
    } catch (error) { next(error); }
  });
  return router;
}
