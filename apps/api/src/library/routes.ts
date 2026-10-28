import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import { LocalAssetStorage } from '../assets/storage.js';
import { LocalMediaStorage } from '../media/storage.js';
import { createLibraryService, LibraryServiceError } from './service.js';

const noteUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 3, fieldSize: 50_000 } });
const updateItemSchema = z.object({ titleOverride: z.string().trim().max(240).nullable().optional(), descriptionOverride: z.string().trim().max(2000).nullable().optional() }).strict();

function param(req: express.Request, key: string): string { const value = req.params[key]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function apiError(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}
function serviceError(res: express.Response, cause: unknown, requestId?: string) {
  if (!(cause instanceof LibraryServiceError)) return false;
  const status = cause.code === 'not_found' ? 404 : cause.code === 'too_many_images' ? 413 : 400;
  apiError(res, status, cause.code, cause.message, requestId);
  return true;
}
function formField(req: express.Request, key: string): string {
  const value = req.body?.[key];
  return typeof value === 'string' ? value : '';
}

export function createLibraryRouter(database: DatabaseHandle, storage: LocalAssetStorage, mediaStorage: LocalMediaStorage) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, storage);
  const library = createLibraryService(database, storage, mediaStorage);

  router.get('/items', signedIn, profile, async (req, res) => {
    const parsed = z.object({
      search: z.string().max(120).default(''), type: z.enum(['page', 'note']).optional(),
      status: z.enum(['queued', 'processing', 'retry_wait', 'cancel_requested', 'cancelled', 'paused', 'partial', 'ready', 'failed']).optional(), tagId: z.string().optional(),
      collectionId: z.string().optional(), sort: z.enum(['created_desc', 'created_asc', 'title_asc', 'title_desc']).default('created_desc'),
      limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().max(2048).optional(),
    }).safeParse(req.query);
    if (!parsed.success) return apiError(res, 400, 'invalid_query', 'One or more library filters are invalid.', req.requestId);
    try {
      const { cursor, ...query } = parsed.data;
      return res.json(await library.list(req.user!.id, query, cursor));
    } catch (cause) {
      if (serviceError(res, cause, req.requestId)) return;
      throw cause;
    }
  });

  router.get('/items/:id', signedIn, profile, async (req, res) => {
    const item = await library.get(req.user!.id, param(req, 'id'));
    if (!item) return apiError(res, 404, 'not_found', 'Saved item not found.', req.requestId);
    return res.json({ item });
  });

  router.patch('/items/:id', signedIn, profile, async (req, res) => {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return apiError(res, 400, 'invalid_item', 'Provide a title or description to update.', req.requestId);
    const item = await library.update(req.user!.id, param(req, 'id'), parsed.data);
    if (!item) return apiError(res, 404, 'not_found', 'Saved item not found.', req.requestId);
    return res.json({ item });
  });

  router.delete('/items/:id', signedIn, profile, async (req, res) => {
    if (!await library.delete(req.user!.id, param(req, 'id'))) return apiError(res, 404, 'not_found', 'Saved item not found.', req.requestId);
    return res.status(204).end();
  });

  const saveNote = async (req: express.Request, res: express.Response, isCreate: boolean) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    try {
      const item = await library.saveNote({
        ownerId: req.user!.id, itemId: isCreate ? undefined : param(req, 'id'), isCreate,
        body: formField(req, 'body'), title: formField(req, 'title'), linksRaw: formField(req, 'links'),
        files: files.map((file) => ({ buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname })),
      });
      return res.status(isCreate ? 201 : 200).json({ item });
    } catch (cause) {
      if (serviceError(res, cause, req.requestId)) return;
      console.error('note_save_failed', { requestId: req.requestId, errorType: cause instanceof Error ? cause.name : 'unknown' });
      return apiError(res, 500, 'note_save_failed', 'The note could not be saved. Your previous version is still available.', req.requestId);
    }
  };
  router.post('/notes', signedIn, profile, noteUpload.array('images', 5), async (req, res) => { await saveNote(req, res, true); });
  router.patch('/notes/:id', signedIn, profile, noteUpload.array('images', 5), async (req, res) => { await saveNote(req, res, false); });

  router.delete('/notes/:id/assets/:assetId', signedIn, profile, async (req, res) => {
    try {
      if (!await library.deleteNoteAsset(req.user!.id, param(req, 'id'), param(req, 'assetId'))) return apiError(res, 404, 'not_found', 'Note image not found.', req.requestId);
      return res.status(204).end();
    } catch (cause) {
      console.error('note_asset_delete_failed', { requestId: req.requestId, errorType: cause instanceof Error ? cause.name : 'unknown' });
      return apiError(res, 500, 'asset_delete_failed', 'The note image could not be removed.', req.requestId);
    }
  });

  router.get('/assets/:id', signedIn, profile, async (req, res) => {
    const asset = await library.readAsset(req.user!.id, param(req, 'id'));
    if (!asset) return apiError(res, 404, 'not_found', 'Asset not found.', req.requestId);
    res.setHeader('Content-Type', asset.mime);
    res.setHeader('Content-Length', asset.bytes.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(asset.bytes);
  });

  router.get('/media/:id', signedIn, profile, async (req, res) => {
    const id = param(req, 'id');
    const media = await database.prepare(`SELECT storage_key,detected_mime FROM media_artifacts
      WHERE owner_id=? AND id=? AND active=1 AND status='ready'`).get(req.user!.id, id) as { storage_key: string | null; detected_mime: string | null } | undefined;
    if (!media?.storage_key || !media.detected_mime) return apiError(res, 404, 'not_found', 'Media not found.', req.requestId);
    try {
      const bytes = await mediaStorage.read(media.storage_key);
      res.setHeader('Content-Type', media.detected_mime); res.setHeader('Content-Length', bytes.length);
      res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(bytes);
    } catch {
      return apiError(res, 404, 'not_found', 'Media not found.', req.requestId);
    }
  });

  return router;
}
