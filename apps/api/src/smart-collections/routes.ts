import express from 'express';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import { createSmartCollectionService, SmartCollectionError } from './service.js';

const updateSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), pinned: z.boolean().optional(), hidden: z.boolean().optional() }).strict();
const overrideSchema = z.object({ action: z.enum(['include','exclude','reset']) }).strict();
function param(req: express.Request, key: string): string { const value = req.params[key]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function fail(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createSmartCollectionRouter(database: DatabaseHandle, storage: AssetStorage) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, storage);
  const smartCollections = createSmartCollectionService(database);
  const handle = (res: express.Response, cause: unknown, requestId?: string) => {
    if (!(cause instanceof SmartCollectionError)) return false;
    fail(res, cause.code === 'not_found' ? 404 : 400, cause.code, cause.message, requestId);
    return true;
  };

  router.get('/smart-collections', signedIn, profile, async (req, res) => {
    const parsed = z.object({ includeHidden: z.enum(['true','false']).default('false') }).safeParse(req.query);
    if (!parsed.success) return fail(res, 400, 'invalid_query', 'Smart collection filters are invalid.', req.requestId);
    return res.json(await smartCollections.list(req.user!.id, parsed.data.includeHidden === 'true'));
  });
  router.post('/smart-collections/refresh', signedIn, profile, async (req, res) => {
    const parsed = z.object({ includeHidden: z.enum(['true','false']).default('false') }).safeParse(req.query);
    if (!parsed.success) return fail(res, 400, 'invalid_query', 'Smart collection filters are invalid.', req.requestId);
    return res.json(await smartCollections.list(req.user!.id, parsed.data.includeHidden === 'true'));
  });
  router.get('/smart-collections/:collectionId/items', signedIn, profile, async (req, res) => {
    const parsed = z.object({ search: z.string().trim().max(120).default(''), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().max(2048).optional() }).safeParse(req.query);
    if (!parsed.success) return fail(res, 400, 'invalid_query', 'Smart collection search settings are invalid.', req.requestId);
    try { return res.json(await smartCollections.listItems(req.user!.id, param(req,'collectionId'), parsed.data.search, parsed.data.limit, parsed.data.cursor)); }
    catch (cause) { if (handle(res,cause,req.requestId)) return; throw cause; }
  });
  router.patch('/smart-collections/:collectionId', signedIn, profile, async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return fail(res, 400, 'invalid_smart_collection', 'Provide a valid name, pin, or visibility change.', req.requestId);
    try { return res.json({ collection: await smartCollections.update(req.user!.id, param(req,'collectionId'), parsed.data) }); }
    catch (cause) { if (handle(res,cause,req.requestId)) return; throw cause; }
  });
  router.put('/smart-collections/:collectionId/items/:itemId/override', signedIn, profile, async (req, res) => {
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_override', 'Choose include, exclude, or reset for this item.', req.requestId);
    try { return res.json(await smartCollections.setItemOverride(req.user!.id, param(req,'collectionId'), param(req,'itemId'), parsed.data.action)); }
    catch (cause) { if (handle(res,cause,req.requestId)) return; throw cause; }
  });

  return router;
}
