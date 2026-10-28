import express from 'express';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import { createJobRepository } from './repository.js';

function param(req: express.Request, key: string): string { const value = req.params[key]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function respond(res: express.Response, outcome: unknown, requestId?: string) {
  if (outcome === 'not_found') return res.status(404).json({ error: { code: 'not_found', message: 'Processing job not found.', ...(requestId ? { requestId } : {}) } });
  if (outcome === 'not_cancellable' || outcome === 'not_retryable' || outcome === 'not_reprocessable') {
    return res.status(409).json({ error: { code: outcome, message: 'This recovery action is not available for the current job state.', ...(requestId ? { requestId } : {}) } });
  }
  return res.json({ job: outcome });
}

export function createJobRouter(database: DatabaseHandle, storage: AssetStorage) {
  const router = express.Router(); const signedIn = requireUser(database); const profile = createProfileGate(database, storage); const jobs = createJobRepository(database);
  router.get('/items/:id/job', signedIn, profile, async (req, res) => respond(res, await jobs.get(req.user!.id, param(req, 'id')) ?? 'not_found', req.requestId));
  router.post('/items/:id/job/cancel', signedIn, profile, async (req, res) => respond(res, await jobs.cancel(req.user!.id, param(req, 'id')), req.requestId));
  router.post('/items/:id/job/retry', signedIn, profile, async (req, res) => respond(res, await jobs.retry(req.user!.id, param(req, 'id')), req.requestId));
  router.post('/items/:id/job/reprocess', signedIn, profile, async (req, res) => respond(res, await jobs.reprocess(req.user!.id, param(req, 'id')), req.requestId));
  return router;
}
