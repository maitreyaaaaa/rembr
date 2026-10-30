import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireAccountLifecycleUser } from '../auth/sessions.js';
import { ACCOUNT_ACTIVITY_RETENTION_MS } from './retention-service.js';

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
      const rows = await database.prepare(`SELECT id,event_type,created_at FROM account_security_events
        WHERE owner_id=? AND created_at>=? ORDER BY created_at DESC,id DESC LIMIT ?`)
        .all(req.user!.id, cutoff, parsedLimit.data) as Array<{ id: string; event_type: AccountSecurityEventType; created_at: string }>;
      res.json({ activity: rows.map((row) => ({ id: row.id, eventType: row.event_type, createdAt: row.created_at })) });
    } catch (cause) { next(cause); }
  });
  return router;
}
