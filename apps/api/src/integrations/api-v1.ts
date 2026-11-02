import { rateLimit } from 'express-rate-limit';
import express from 'express';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import type { AssetStorage } from '../assets/storage.js';
import type { MediaStorage } from '../media/storage.js';
import { createProfileGate } from '../account/routes.js';
import { createApiKeyRouter, requireApiKey } from '../auth/api-keys.js';
import { createLibraryService } from '../library/service.js';
import { CaptureError, validatePublicUrl } from '../items/safe-fetch.js';

function failure(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createIntegrationRouters(database: DatabaseHandle, storage: AssetStorage, mediaStorage: MediaStorage,
  validateUrl: typeof validatePublicUrl = validatePublicUrl) {
  const management = createApiKeyRouter(database);
  const publicApi = express.Router();
  const library = createLibraryService(database, storage, mediaStorage);
  const profile = createProfileGate(database, storage);
  const rateLimitPerKey = rateLimit({
    windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => req.apiKeyId!,
  });

  const listItems = z.object({ search: z.string().max(120).default(''), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().max(2048).optional() }).strict();
  publicApi.get('/items', requireApiKey(database, 'library:read'), rateLimitPerKey, async (req, res) => {
    const parsed = listItems.safeParse(req.query);
    if (!parsed.success) return failure(res, 400, 'invalid_query', 'Search, limit, or cursor is invalid.', req.requestId);
    return res.json(await library.list(req.user!.id, { search: parsed.data.search, limit: parsed.data.limit, sort: 'created_desc' }, parsed.data.cursor));
  });

  publicApi.get('/items/:id', requireApiKey(database, 'library:read'), rateLimitPerKey, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] ?? '' : req.params.id ?? '';
    if (!id) return failure(res, 400, 'invalid_id', 'Saved item ID is required.', req.requestId);
    const item = await library.get(req.user!.id, id);
    if (!item) return failure(res, 404, 'not_found', 'Saved item not found.', req.requestId);
    return res.json({ item });
  });

  publicApi.post('/items', requireApiKey(database, 'library:write'), profile, rateLimitPerKey, async (req, res, next) => {
    const parsed = z.object({ url: z.string().trim().min(8).max(2048) }).strict().safeParse(req.body);
    if (!parsed.success) return failure(res, 400, 'invalid_url', 'Enter a complete URL to a public web page.', req.requestId);
    try {
      const validated = await validateUrl(parsed.data.url);
      validated.url.hash = '';
      const result = await library.createPage(req.user!.id, parsed.data.url, validated.url.toString(), validated.url.hostname, req.requestId);
      return res.status(result.duplicate ? 200 : 202).json(result);
    } catch (cause) {
      if (cause instanceof CaptureError) return failure(res, 400, cause.code, cause.message, req.requestId);
      return next(cause);
    }
  });

  publicApi.get('/collections', requireApiKey(database, 'collections:read'), rateLimitPerKey, async (req, res) => {
    const collections = await database.prepare(`SELECT c.id,c.name,c.description,c.created_at AS "createdAt",
      count(ci.item_id)::int AS "itemCount" FROM collections c
      LEFT JOIN collection_items ci ON ci.owner_id=c.owner_id AND ci.collection_id=c.id
      WHERE c.owner_id=? GROUP BY c.id ORDER BY c.name`).all(req.user!.id);
    return res.json({ collections });
  });

  return { management, publicApi };
}
