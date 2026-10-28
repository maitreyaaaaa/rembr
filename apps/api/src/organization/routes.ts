import express from 'express';
import { z } from 'zod';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import { LocalAssetStorage } from '../assets/storage.js';
import type { DatabaseHandle } from '../db/database.js';
import { createOrganizationService, OrganizationServiceError } from './service.js';

const tagSchema = z.object({ name: z.string().trim().min(1).max(40) }).strict();
const collectionSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), description: z.string().trim().max(500).optional() }).strict();
function param(req: express.Request, key: string): string { const value = req.params[key]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function apiError(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createOrganizationRouter(database: DatabaseHandle, storage: LocalAssetStorage) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, storage);
  const organization = createOrganizationService(database);
  const handleError = (res: express.Response, cause: unknown, requestId?: string) => {
    if (!(cause instanceof OrganizationServiceError)) return false;
    const status = cause.code === 'not_found' ? 404 : cause.code === 'invalid_cursor' ? 400 : 409;
    apiError(res, status, cause.code, cause.message, requestId);
    return true;
  };

  router.get('/tags', signedIn, profile, (req, res) => res.json({ tags: organization.listTags(req.user!.id) }));
  router.post('/tags', signedIn, profile, (req, res) => {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'invalid_tag', 'Tag name must be 1–40 characters.', req.requestId);
    try { return res.status(201).json({ tag: organization.createTag(req.user!.id, parsed.data.name) }); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.patch('/tags/:tagId', signedIn, profile, (req, res) => {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'invalid_tag', 'Tag name must be 1–40 characters.', req.requestId);
    try { return res.json({ tag: organization.renameTag(req.user!.id,param(req,'tagId'),parsed.data.name) }); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.delete('/tags/:tagId', signedIn, profile, (req,res) => {
    try { organization.deleteTag(req.user!.id,param(req,'tagId')); return res.status(204).end(); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.put('/items/:itemId/tags/:tagId', signedIn, profile, (req,res) => {
    try { organization.addTag(req.user!.id,param(req,'itemId'),param(req,'tagId')); return res.status(204).end(); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.delete('/items/:itemId/tags/:tagId', signedIn, profile, (req,res) => {
    organization.removeTag(req.user!.id,param(req,'itemId'),param(req,'tagId')); return res.status(204).end();
  });

  router.get('/collections', signedIn, profile, (req,res) => res.json({ collections: organization.listCollections(req.user!.id) }));
  router.post('/collections', signedIn, profile, (req,res) => {
    const parsed = collectionSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.name) return apiError(res,400,'invalid_collection','Collection name must be 1–80 characters.',req.requestId);
    try { return res.status(201).json({ collection: organization.createCollection(req.user!.id,parsed.data.name,parsed.data.description ?? '') }); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.get('/collections/:collectionId/items', signedIn, profile, (req,res) => {
    const parsed = z.object({limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.string().max(2048).optional()}).safeParse(req.query);
    if (!parsed.success) return apiError(res,400,'invalid_query','Collection page settings are invalid.',req.requestId);
    try { return res.json(organization.listCollectionItems(req.user!.id,param(req,'collectionId'),parsed.data.limit,parsed.data.cursor)); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.get('/collections/:collectionId', signedIn, profile, (req,res) => {
    try { return res.json(organization.getCollection(req.user!.id,param(req,'collectionId'))); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.patch('/collections/:collectionId', signedIn, profile, (req,res) => {
    const parsed = collectionSchema.safeParse(req.body);
    if (!parsed.success || (!parsed.data.name && parsed.data.description === undefined)) return apiError(res,400,'invalid_collection','Provide a valid collection name or description.',req.requestId);
    try { return res.json({collection:organization.updateCollection(req.user!.id,param(req,'collectionId'),parsed.data)}); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.delete('/collections/:collectionId', signedIn, profile, (req,res) => {
    try { organization.deleteCollection(req.user!.id,param(req,'collectionId')); return res.status(204).end(); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.put('/collections/:collectionId/items/:itemId', signedIn, profile, (req,res) => {
    try { organization.addCollectionItem(req.user!.id,param(req,'collectionId'),param(req,'itemId')); return res.status(204).end(); }
    catch (cause) { if (handleError(res,cause,req.requestId)) return; throw cause; }
  });
  router.delete('/collections/:collectionId/items/:itemId', signedIn, profile, (req,res) => {
    organization.removeCollectionItem(req.user!.id,param(req,'collectionId'),param(req,'itemId')); return res.status(204).end();
  });
  return router;
}
