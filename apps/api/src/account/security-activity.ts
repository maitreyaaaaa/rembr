import { createHash, randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireAccountLifecycleUser } from '../auth/sessions.js';
import { ACCOUNT_ACTIVITY_RETENTION_MS } from './retention-service.js';
import type { AccountActivityEventType } from './activity-events.js';

export type AccountSecurityEventType = 'sign_in' | 'sign_out' | 'deletion_requested' | 'deletion_cancelled';

export async function recordAccountSecurityEvent(database: DatabaseHandle, ownerId: string,
  eventType: AccountSecurityEventType, now = new Date()): Promise<void> {
  const createdAt = now.toISOString();
  const cutoff = new Date(now.getTime() - ACCOUNT_ACTIVITY_RETENTION_MS).toISOString();
  await database.transaction(async () => {
    await database.prepare(`INSERT INTO account_security_events (id,owner_id,event_type,created_at) VALUES (?,?,?,?)`)
      .run(randomUUID(), ownerId, eventType, createdAt);
    await database.prepare('DELETE FROM account_security_events WHERE owner_id=? AND created_at<?').run(ownerId, cutoff);
  })();
}

export function createAccountSecurityActivityRouter(database: DatabaseHandle) {
  const router = express.Router();
  const auth = requireAccountLifecycleUser(database) as RequestHandler;
  const readLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  router.use('/account/security-activity', (_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' });
    next();
  });
  router.get('/account/security-activity', auth, readLimit, async (req, res, next) => {
    const parsedLimit = z.coerce.number().int().min(1).max(50).safeParse(req.query.limit ?? 20);
    if (!parsedLimit.success) {
      res.status(400).json({ error: { code: 'invalid_limit', message: 'Limit must be between 1 and 50.', requestId: req.requestId } });
      return;
    }
    try {
      const cutoff = new Date(Date.now() - ACCOUNT_ACTIVITY_RETENTION_MS).toISOString();
      const ownerHash = createHash('sha256').update(req.user!.id).digest('hex');
      const [securityRows, activityRows, deletionRows] = await Promise.all([
        database.prepare(`SELECT id,event_type,created_at FROM account_security_events
        WHERE owner_id=? AND created_at>=? ORDER BY created_at DESC,id DESC LIMIT ?`)
          .all(req.user!.id, cutoff, parsedLimit.data) as Promise<Array<{ id: string; event_type: AccountSecurityEventType; created_at: string }>>,
        database.prepare(`SELECT id,event_type,created_at FROM account_activity_events
          WHERE owner_id=? AND created_at>=? ORDER BY created_at DESC,id DESC LIMIT ?`)
          .all(req.user!.id, cutoff, parsedLimit.data) as Promise<Array<{ id: string; event_type: AccountActivityEventType; created_at: string }>>,
        database.prepare(`SELECT id,event_type,created_at FROM account_deletion_audit
          WHERE owner_hash=? AND created_at>=? AND event_type IN ('approved','retry_requested','claim_acquired','step_failed','completed')
          ORDER BY created_at DESC,id DESC LIMIT ?`)
          .all(ownerHash, cutoff, parsedLimit.data) as Promise<Array<{ id: string; event_type: 'approved' | 'retry_requested' | 'claim_acquired' | 'step_failed' | 'completed'; created_at: string }>>,
      ]);
      const deletionLabels = {
        approved: 'deletion_approved', retry_requested: 'deletion_retried', claim_acquired: 'deletion_processing',
        step_failed: 'deletion_failed', completed: 'deletion_completed',
      } as const;
      const deletionActivity = deletionRows.map((row) => ({ ...row, event_type: deletionLabels[row.event_type] }));
      const activity = [...securityRows, ...activityRows, ...deletionActivity]
        .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
        .slice(0, parsedLimit.data)
        .map((row) => ({ id: row.id, eventType: row.event_type, createdAt: row.created_at }));
      res.json({ activity });
    } catch (cause) { next(cause); }
  });
  return router;
}
