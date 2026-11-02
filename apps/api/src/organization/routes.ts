import express from 'express';
import { z } from 'zod';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import type { DatabaseHandle } from '../db/database.js';
import { createOrganizationService, OrganizationServiceError } from './service.js';

const tagSchema = z.object({ name: z.string().trim().min(1).max(40) }).strict();
function param(req: express.Request, key: string): string { const value = req.params[key]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function apiError(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createOrganizationRouter(database: DatabaseHandle, storage: AssetStorage) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, storage);
  const organization = createOrganizationService(database);
  const handleError = (res: express.Response, cause: unknown, requestId?: string) => {
    if (!(cause instanceof OrganizationServiceError)) return false;
    const status = cause.code === 'not_found' ? 404 : 409;
    apiError(res, status, cause.code, cause.message, requestId);
    return true;
  };

  router.get('/tags', signedIn, profile, async (req, res) => res.json({ tags: await organization.listTags(req.user!.id) }));
  router.post('/tags', signedIn, profile, async (req, res) => {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'invalid_tag', 'Tag name must be 1–40 characters.', req.requestId);
    try { return res.status(201).json({ tag: await organization.createTag(req.user!.id, parsed.data.name) }); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.patch('/tags/:tagId', signedIn, profile, async (req, res) => {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'invalid_tag', 'Tag name must be 1–40 characters.', req.requestId);
    try { return res.json({ tag: await organization.renameTag(req.user!.id,param(req,'tagId'),parsed.data.name) }); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.delete('/tags/:tagId', signedIn, profile, async (req,res) => {
    try { await organization.deleteTag(req.user!.id,param(req,'tagId')); return res.status(204).end(); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.put('/items/:itemId/tags/:tagId', signedIn, profile, async (req,res) => {
    try { await organization.addTag(req.user!.id,param(req,'itemId'),param(req,'tagId')); return res.status(204).end(); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.delete('/items/:itemId/tags/:tagId', signedIn, profile, async (req,res) => {
    await organization.removeTag(req.user!.id,param(req,'itemId'),param(req,'tagId')); return res.status(204).end();
  });

  return router;
}
