import express from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import type { MediaStorage } from '../media/storage.js';
import { createLibraryService, LibraryServiceError } from './service.js';
import { findSimilarVisuals, type SimilarVisualProfile, type SimilarVisualVector } from './similar-visuals.js';
import { LOCAL_VISUAL_DISCLOSURE_VERSION } from '../ai/preferences.js';
import { recordAccountActivityEvent } from '../account/activity-events.js';

const noteUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 3, fieldSize: 50_000 } });
const updateItemSchema = z.object({ titleOverride: z.string().trim().max(240).nullable().optional(), descriptionOverride: z.string().trim().max(2000).nullable().optional() }).strict();
const searchFeedbackSchema = z.object({ searchEventId: z.string().uuid(), itemId: z.string().uuid(), rating: z.enum(['helpful','not_helpful']) }).strict();

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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function parseJsonStrings(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try { return stringArray(JSON.parse(value)); } catch { return []; }
}

export function createLibraryRouter(database: DatabaseHandle, storage: AssetStorage, mediaStorage: MediaStorage) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, storage);
  const library = createLibraryService(database, storage, mediaStorage);
  const similarVisualLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

  router.get('/items', signedIn, profile, async (req, res) => {
    const parsed = z.object({
      search: z.string().max(120).default(''), type: z.enum(['page', 'note']).optional(),
      status: z.enum(['queued', 'processing', 'retry_wait', 'cancel_requested', 'cancelled', 'paused', 'partial', 'ready', 'failed']).optional(), tagId: z.string().optional(),
      collectionId: z.string().optional(), sort: z.enum(['relevance', 'created_desc', 'created_asc', 'title_asc', 'title_desc']).default('created_desc'),
      matchMode: z.enum(['terms','phrase']).default('terms'),
      limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().max(2048).optional(),
    }).safeParse(req.query);
    if (!parsed.success) return apiError(res, 400, 'invalid_query', 'One or more library filters are invalid.', req.requestId);
    try {
      const { cursor, ...query } = parsed.data;
      return res.json(await library.list(req.user!.id, query, cursor));
    } catch (cause) {
      if (serviceError(res, cause, req.requestId)) return;
      await recordAccountActivityEvent(database, req.user!.id, 'search_failed').catch(() => undefined);
      throw cause;
    }
  });

  router.post('/search/feedback', signedIn, profile, async (req, res) => {
    const parsed = searchFeedbackSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'invalid_search_feedback', 'Choose a valid search result and helpfulness rating.', req.requestId);
    try { return res.status(201).json({ feedback: await library.recordSearchFeedback(req.user!.id, parsed.data) }); }
    catch (cause) {
      if (serviceError(res, cause, req.requestId)) return;
      throw cause;
    }
  });

  router.get('/items/:id', signedIn, profile, async (req, res) => {
    const item = await library.get(req.user!.id, param(req, 'id'));
    if (!item) return apiError(res, 404, 'not_found', 'Saved item not found.', req.requestId);
    return res.json({ item });
  });

  router.get('/items/:id/similar-visuals', signedIn, profile, similarVisualLimit, async (req, res) => {
    const parsed = z.object({ limit: z.coerce.number().int().min(1).max(20).default(8) }).safeParse(req.query);
    if (!parsed.success) return apiError(res, 400, 'invalid_query', 'The similar saves limit must be between 1 and 20.', req.requestId);
    const ownerId = req.user!.id;
    const sourceId = param(req, 'id');
    const sourceExists = await database.prepare('SELECT 1 FROM saved_items WHERE owner_id=? AND id=?').get(ownerId, sourceId);
    if (!sourceExists) return apiError(res, 404, 'not_found', 'Saved item not found.', req.requestId);
    const rows = await database.prepare(`SELECT saved_items.id,
        COALESCE(saved_items.title_override,saved_items.title) AS title,
        COALESCE(saved_items.description_override,saved_items.description,'') AS description,
        saved_items.created_at,saved_items.source_platform,saved_items.item_kind,
        analysis.visual_description,analysis.ocr_text,analysis.summary,analysis.keywords_json,
        ARRAY(SELECT tags.display_name FROM item_tags JOIN tags ON tags.owner_id=item_tags.owner_id AND tags.id=item_tags.tag_id
          WHERE item_tags.owner_id=saved_items.owner_id AND item_tags.item_id=saved_items.id ORDER BY tags.normalized_name) AS tags,
        ARRAY(SELECT collections.name FROM collection_items JOIN collections ON collections.owner_id=collection_items.owner_id AND collections.id=collection_items.collection_id
          WHERE collection_items.owner_id=saved_items.owner_id AND collection_items.item_id=saved_items.id ORDER BY collections.normalized_name) AS collections,
        EXISTS (SELECT 1 FROM media_artifacts media WHERE media.owner_id=saved_items.owner_id AND media.item_id=saved_items.id
          AND media.active=1 AND media.status='ready' AND media.detected_mime LIKE 'image/%')
          OR EXISTS (SELECT 1 FROM note_assets JOIN asset_objects ON asset_objects.owner_id=note_assets.owner_id AND asset_objects.id=note_assets.asset_id
            WHERE note_assets.owner_id=saved_items.owner_id AND note_assets.item_id=saved_items.id AND asset_objects.detected_mime LIKE 'image/%' AND asset_objects.state='ready') AS has_image
      FROM saved_items
      LEFT JOIN LATERAL (SELECT visual_description,ocr_text,summary,keywords_json FROM ai_analysis_results
        WHERE owner_id=saved_items.owner_id AND item_id=saved_items.id ORDER BY generation DESC LIMIT 1) analysis ON TRUE
      WHERE saved_items.owner_id=? AND (saved_items.id=? OR saved_items.id IN (
        SELECT id FROM saved_items WHERE owner_id=? ORDER BY created_at DESC,id LIMIT 250
      )) ORDER BY saved_items.created_at DESC,saved_items.id LIMIT 251`)
      .all(ownerId, sourceId, ownerId) as Array<Record<string, unknown>>;
    const profiles: SimilarVisualProfile[] = rows.map((row) => ({
      id: String(row.id), title: String(row.title ?? ''), description: String(row.description ?? ''),
      visualDescription: String(row.visual_description ?? ''), ocrText: String(row.ocr_text ?? ''), summary: String(row.summary ?? ''),
      keywords: parseJsonStrings(row.keywords_json), tags: stringArray(row.tags), collections: stringArray(row.collections),
      platform: row.source_platform == null ? null : String(row.source_platform),
      contentType: row.item_kind == null ? null : String(row.item_kind), hasImage: Boolean(row.has_image), createdAt: String(row.created_at ?? ''),
    }));
    const itemIds = profiles.map((item) => item.id);
    res.setHeader('Cache-Control', 'private, no-store');
    const visualConsent = await database.prepare(`SELECT local_visual_enabled,local_visual_consent_version
      FROM ai_analysis_preferences WHERE owner_id=?`).get(ownerId) as { local_visual_enabled: boolean | number; local_visual_consent_version: string | null } | undefined;
    const localVisualEnabled = Boolean(visualConsent?.local_visual_enabled && visualConsent.local_visual_consent_version === LOCAL_VISUAL_DISCLOSURE_VERSION);
    const indexing = localVisualEnabled ? Number((await database.prepare(`SELECT COUNT(*) AS count FROM visual_embedding_jobs
      WHERE owner_id=? AND status IN ('queued','processing')`).get(ownerId) as { count: number }).count) : 0;
    const sourceVectorRow = localVisualEnabled
      ? await database.prepare(`SELECT model FROM visual_item_embeddings WHERE owner_id=? AND item_id=?
        ORDER BY updated_at DESC LIMIT 1`).get(ownerId, sourceId) as { model: string } | undefined : undefined;
    const vectors = sourceVectorRow && itemIds.length ? await database.prepare(`SELECT item_id,model,embedding FROM visual_item_embeddings
      WHERE owner_id=? AND model=? AND item_id IN (${itemIds.map(() => '?').join(',')})`)
      .all(ownerId, sourceVectorRow.model, ...itemIds) as Array<{ item_id: string; model: string; embedding: number[] }> : [];
    const ranked = findSimilarVisuals(profiles, sourceId, vectors.map((row) => ({ itemId: row.item_id, model: row.model, embedding: row.embedding } satisfies SimilarVisualVector)), parsed.data.limit);
    const items = await Promise.all(ranked.map(async (entry) => ({ item: await library.get(ownerId, entry.itemId), similarity: entry.similarity })));
    return res.json({ items: items.filter((entry) => entry.item), localVisualEnabled, indexing });
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
