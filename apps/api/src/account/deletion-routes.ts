import { rateLimit } from 'express-rate-limit';
import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAccountLifecycleUser, requireUser } from '../auth/sessions.js';
import type { DatabaseHandle } from '../db/database.js';
import { AccountDeletionError } from './deletion-service.js';

const uuid = z.string().uuid();
const requestSchema = z.object({ exportConfirmed: z.literal(true) }).strict();
const operatorActionSchema = z.object({ confirm: z.literal(true) }).strict();
const error = (res: express.Response, status: number, code: string, message: string, requestId?: string) =>
  res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });

type DeletionService = ReturnType<typeof import('./deletion-service.js').createAccountDeletionService>;

export function createAccountDeletionRouter(database: DatabaseHandle, service: DeletionService) {
  const router = express.Router();
  const auth = requireAccountLifecycleUser(database) as RequestHandler;
  const createLimit = rateLimit({ windowMs: 60 * 60_000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false });
  const readLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  const mutateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false });

  router.use('/account/deletion', (_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' });
    next();
  });
  router.get('/account/deletion', auth, readLimit, async (req, res, next) => {
    try { return res.json({ deletion: await service.getForOwner(req.user!.id) }); }
    catch (cause) { return next(cause); }
  });
  router.post('/account/deletion', auth, createLimit, async (req, res, next) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 400, 'export_confirmation_required', 'Confirm that you exported or intentionally skipped exporting your data first.', req.requestId);
    try {
      const result = await service.request(req.user!.id, parsed.data.exportConfirmed);
      return res.status(result.created ? 202 : 200).json({ deletion: result.deletion });
    } catch (cause) {
      if (cause instanceof AccountDeletionError) {
        const status = cause.code === 'account_not_found' ? 404 : cause.code === 'account_inactive' ? 403 : 409;
        return error(res, status, cause.code, 'The account deletion request could not be started.', req.requestId);
      }
      return next(cause);
    }
  });
  router.post('/account/deletion/cancel', auth, mutateLimit, async (req, res, next) => {
    try {
      const deletion = await service.cancelForOwner(req.user!.id);
      if (!deletion) return error(res, 409, 'deletion_not_cancellable', 'This deletion request can no longer be cancelled.', req.requestId);
      return res.json({ deletion });
    } catch (cause) { return next(cause); }
  });
  return router;
}

export function createAccountDeletionAdminRouter(database: DatabaseHandle, service: DeletionService) {
  const router = express.Router();
  const auth = requireUser(database) as RequestHandler;
  const readLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  const mutateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  router.get('/admin/role', auth, readLimit, async (req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' });
    try { return res.json({ role: await service.roleFor(req.user!.id) }); }
    catch (cause) { return next(cause); }
  });
  router.use('/admin/account-deletions', (_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' });
    next();
  });
  const requireRole = (minimum: 'support' | 'admin'): RequestHandler => async (req, res, next) => {
    try {
      const role = await service.roleFor(req.user!.id);
      if (role !== 'admin' && !(minimum === 'support' && role === 'support')) {
        error(res, 403, 'admin_role_required', 'This action requires an authorized operator role.', req.requestId);
        return;
      }
      next();
    } catch (cause) { next(cause); }
  };
  router.get('/admin/account-deletions', auth, requireRole('support'), readLimit, async (req, res, next) => {
    try {
      const parsed = z.coerce.number().int().min(1).max(50).safeParse(req.query.limit ?? 50);
      if (!parsed.success) return error(res, 400, 'invalid_limit', 'Limit must be between 1 and 50.', req.requestId);
      return res.json({ deletions: await service.listPending(parsed.data) });
    } catch (cause) { return next(cause); }
  });
  router.get('/admin/account-deletions/:id/audit', auth, requireRole('support'), readLimit, async (req, res, next) => {
    const requestId = req.params.id;
    if (typeof requestId !== 'string' || !uuid.safeParse(requestId).success) return error(res, 404, 'not_found', 'This deletion request does not exist.', req.requestId);
    try {
      const events = await service.listAudit(requestId);
      if (!events) return error(res, 404, 'not_found', 'This deletion request does not exist.', req.requestId);
      return res.json({ events });
    } catch (cause) { return next(cause); }
  });
  for (const action of ['approve', 'retry'] as const) {
    router.post(`/admin/account-deletions/:id/${action}`, auth, requireRole('admin'), mutateLimit, async (req, res, next) => {
      const requestId = req.params.id;
      if (typeof requestId !== 'string' || !uuid.safeParse(requestId).success) return error(res, 404, 'not_found', 'This deletion request does not exist.', req.requestId);
      if (!operatorActionSchema.safeParse(req.body).success) return error(res, 400, 'confirmation_required', 'Confirm this account deletion action.', req.requestId);
      try {
        const deletion = action === 'approve'
          ? await service.approve(requestId, req.user!.id)
          : await service.retry(requestId, req.user!.id);
        return res.json({ deletion });
      } catch (cause) {
        if (cause instanceof AccountDeletionError) {
          const status = cause.code === 'deletion_not_found' ? 404 : 409;
          return error(res, status, cause.code, 'This deletion request cannot be processed in its current state.', req.requestId);
        }
        return next(cause);
      }
    });
  }
  return router;
}
