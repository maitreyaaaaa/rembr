import { createHash, randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireUser } from '../auth/sessions.js';
import type { DatabaseHandle } from '../db/database.js';
import { createAccountDataMapService } from './data-map-service.js';
import { ACCOUNT_ACTIVITY_RETENTION_MS } from './retention-service.js';

const MAX_USER_OFFSET = 100_000;
const searchSchema = z.object({
  query: z.string().trim().min(3).max(254),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(MAX_USER_OFFSET).default(0),
}).strict();
const userIdSchema = z.string().uuid();

function error(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createAdminUserRouter(database: DatabaseHandle) {
  const router = express.Router();
  const auth = requireUser(database) as RequestHandler;
  const readLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  const dataMap = createAccountDataMapService(database);

  router.use('/admin', (_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' });
    next();
  });

  async function requireAdmin(userId: string, res: express.Response, requestId?: string): Promise<boolean> {
    const role = await database.prepare('SELECT role FROM admin_roles WHERE user_id=?').get(userId) as { role: string } | undefined;
    if (role?.role === 'admin') return true;
    error(res, 403, 'admin_role_required', 'This action requires an administrator role.', requestId);
    return false;
  }

  async function audit(actorId: string, eventType: 'admin_summary_viewed' | 'admin_worker_status_viewed' | 'admin_import_list_viewed' | 'admin_user_list_viewed' | 'admin_user_detail_viewed', targetId: string | null,
    metadata: Record<string, boolean | number>, now = new Date()) {
    await database.prepare(`INSERT INTO admin_access_audit (id,actor_user_id,event_type,target_hash,metadata,created_at)
      VALUES (?,?,?,?,?,?)`).run(randomUUID(), actorId, eventType, targetId ? hash(targetId) : null, JSON.stringify(metadata), now.toISOString());
  }

  router.get('/admin/summary', auth, readLimit, async (req, res, next) => {
    try {
      if (!await requireAdmin(req.user!.id, res, req.requestId)) return;
      const now = Date.now();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [accounts, savedItems, jobs, imports, deletions] = await Promise.all([
        database.prepare(`SELECT count(*) AS total,
          count(*) FILTER (WHERE account_status='active') AS active,
          count(*) FILTER (WHERE account_status='disabled') AS disabled,
          count(*) FILTER (WHERE created_at>=?) AS new_last_24_hours,
          count(*) FILTER (WHERE created_at>=?) AS new_last_7_days FROM users`).get(dayAgo, weekAgo) as Promise<Record<string, unknown>>,
        database.prepare('SELECT status,count(*) AS count FROM saved_items GROUP BY status').all() as Promise<Array<{ status: string; count: string | number }>>,
        database.prepare('SELECT status,count(*) AS count FROM processing_jobs GROUP BY status').all() as Promise<Array<{ status: string; count: string | number }>>,
        database.prepare('SELECT status,count(*) AS count FROM imports GROUP BY status').all() as Promise<Array<{ status: string; count: string | number }>>,
        database.prepare('SELECT status,count(*) AS count FROM account_deletion_requests GROUP BY status').all() as Promise<Array<{ status: string; count: string | number }>>,
      ]);
      const statusCounts = (rows: Array<{ status: string; count: string | number }>) =>
        Object.fromEntries(rows.map(({ status, count }) => [status, Number(count)]));
      await audit(req.user!.id, 'admin_summary_viewed', null, {});
      return res.json({ summary: {
        accounts: Object.fromEntries(Object.entries(accounts).map(([key, value]) => [key, Number(value)])),
        savedItems: { total: Object.values(statusCounts(savedItems)).reduce((total, count) => total + count, 0), byStatus: statusCounts(savedItems) },
        processingJobs: { total: Object.values(statusCounts(jobs)).reduce((total, count) => total + count, 0), byStatus: statusCounts(jobs) },
        imports: { total: Object.values(statusCounts(imports)).reduce((total, count) => total + count, 0), byStatus: statusCounts(imports) },
        deletionRequests: { total: Object.values(statusCounts(deletions)).reduce((total, count) => total + count, 0), byStatus: statusCounts(deletions) },
      } });
    } catch (cause) { return next(cause); }
  });

  router.get('/admin/worker/status', auth, readLimit, async (req, res, next) => {
    try {
      if (!await requireAdmin(req.user!.id, res, req.requestId)) return;
      const sampledAt = new Date().toISOString();
      const [jobs, imports, aiJobs, exports] = await Promise.all([
        database.prepare(`SELECT count(*) FILTER (WHERE status IN ('queued','retry_wait','cancel_requested')) AS waiting,
          count(*) FILTER (WHERE status='processing') AS processing,
          min(created_at) FILTER (WHERE status IN ('queued','retry_wait','cancel_requested')) AS oldest_queued_at FROM processing_jobs`).get() as Promise<Record<string, unknown>>,
        database.prepare(`SELECT count(*) FILTER (WHERE status='queued') AS waiting,
          count(*) FILTER (WHERE status='processing') AS processing,
          min(created_at) FILTER (WHERE status='queued') AS oldest_queued_at FROM imports`).get() as Promise<Record<string, unknown>>,
        database.prepare(`SELECT count(*) FILTER (WHERE status='queued') AS waiting,
          count(*) FILTER (WHERE status='processing') AS processing,
          min(created_at) FILTER (WHERE status='queued') AS oldest_queued_at FROM ai_analysis_jobs`).get() as Promise<Record<string, unknown>>,
        database.prepare(`SELECT count(*) FILTER (WHERE status='queued') AS waiting,
          count(*) FILTER (WHERE status='processing') AS processing,
          min(created_at) FILTER (WHERE status='queued') AS oldest_queued_at FROM account_data_exports`).get() as Promise<Record<string, unknown>>,
      ]);
      const queue = (row: Record<string, unknown>) => ({
        waiting: Number(row.waiting ?? 0),
        processing: Number(row.processing ?? 0),
        oldestQueuedAt: typeof row.oldest_queued_at === 'string' ? row.oldest_queued_at : null,
      });
      await audit(req.user!.id, 'admin_worker_status_viewed', null, {});
      return res.json({ workerStatus: {
        sampledAt,
        processingJobs: queue(jobs),
        imports: queue(imports),
        aiAnalysisJobs: queue(aiJobs),
        exports: queue(exports),
      } });
    } catch (cause) { return next(cause); }
  });

  router.get('/admin/imports', auth, readLimit, async (req, res, next) => {
    try {
      if (!await requireAdmin(req.user!.id, res, req.requestId)) return;
      const rows = await database.prepare(`WITH recent_imports AS (
          SELECT id,owner_id,source,status,created_at,completed_at,file_count,total_bytes,parsed_count,new_count,duplicate_count,skipped_count,failed_count
          FROM imports ORDER BY created_at DESC,id DESC LIMIT 50
        )
        SELECT i.id,i.source,i.status,i.created_at,i.completed_at,i.file_count,i.total_bytes,
          i.parsed_count,i.new_count,i.duplicate_count,i.skipped_count,i.failed_count,
          entries.accepted AS accepted_entries,entries.duplicate AS duplicate_entries,
          entries.skipped AS skipped_entries,entries.failed AS failed_entries,
          jobs.waiting AS waiting_jobs,jobs.processing AS processing_jobs,
          jobs.completed AS completed_jobs,jobs.failed AS failed_jobs
        FROM recent_imports i
        LEFT JOIN LATERAL (SELECT
          count(*) FILTER (WHERE status='queued') AS accepted,
          count(*) FILTER (WHERE status='duplicate') AS duplicate,
          count(*) FILTER (WHERE status='skipped') AS skipped,
          count(*) FILTER (WHERE status='failed') AS failed
          FROM import_entries WHERE owner_id=i.owner_id AND import_id=i.id) entries ON TRUE
        LEFT JOIN LATERAL (SELECT
          count(*) FILTER (WHERE status IN ('queued','retry_wait','cancel_requested')) AS waiting,
          count(*) FILTER (WHERE status='processing') AS processing,
          count(*) FILTER (WHERE status IN ('completed','partial')) AS completed,
          count(*) FILTER (WHERE status='failed') AS failed
          FROM processing_jobs WHERE owner_id=i.owner_id AND import_id=i.id) jobs ON TRUE
        ORDER BY i.created_at DESC,i.id DESC`).all() as Array<Record<string, unknown> & { id: string; source: string; status: string; created_at: string; completed_at: string | null }>;
      const count = (value: unknown) => Number(value ?? 0);
      const imports = rows.map((row) => ({
        reference: hash(row.id).slice(0, 16), source: row.source, status: row.status,
        createdAt: row.created_at, completedAt: row.completed_at,
        fileCount: count(row.file_count), totalBytes: count(row.total_bytes),
        parsedCount: count(row.parsed_count), newCount: count(row.new_count), duplicateCount: count(row.duplicate_count),
        skippedCount: count(row.skipped_count), failedCount: count(row.failed_count),
        entries: { accepted: count(row.accepted_entries), duplicate: count(row.duplicate_entries), skipped: count(row.skipped_entries), failed: count(row.failed_entries) },
        jobs: { waiting: count(row.waiting_jobs), processing: count(row.processing_jobs), completed: count(row.completed_jobs), failed: count(row.failed_jobs) },
      }));
      await audit(req.user!.id, 'admin_import_list_viewed', null, { limit: 50, resultCount: imports.length });
      return res.json({ imports });
    } catch (cause) { return next(cause); }
  });

  router.get('/admin/users', auth, readLimit, async (req, res, next) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) return error(res, 400, 'invalid_search', 'Enter at least three characters and use a page size from 1 to 50.', req.requestId);
    try {
      if (!await requireAdmin(req.user!.id, res, req.requestId)) return;
      const { query, limit, offset } = parsed.data;
      const escaped = query.replace(/[!%_]/g, (character) => `!${character}`);
      const rows = await database.prepare(`SELECT id,email,account_status,created_at FROM users
        WHERE lower(email) LIKE lower(?) ESCAPE '!'
        ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).all(`${escaped}%`, limit + 1, offset) as Array<{
          id: string; email: string; account_status: string; created_at: string;
        }>;
      const hasMore = rows.length > limit;
      const users = rows.slice(0, limit).map((row) => ({
        userId: row.id,
        email: row.email,
        accountStatus: row.account_status,
        createdAt: row.created_at,
      }));
      await audit(req.user!.id, 'admin_user_list_viewed', null, {
        hasQuery: true, queryLength: query.length, limit, offset, resultCount: users.length,
      });
      const nextOffset = hasMore && offset + limit <= MAX_USER_OFFSET ? offset + limit : null;
      return res.json({ users, nextOffset });
    } catch (cause) { return next(cause); }
  });

  router.get('/admin/users/:userId', auth, readLimit, async (req, res, next) => {
    const userId = req.params.userId;
    if (typeof userId !== 'string' || !userIdSchema.safeParse(userId).success) return error(res, 404, 'not_found', 'This account does not exist.', req.requestId);
    try {
      if (!await requireAdmin(req.user!.id, res, req.requestId)) return;
      const user = await database.prepare(`SELECT account.id,account.email,account.account_status,account.created_at,
        profile.username,operator.role AS operator_role FROM users account
        LEFT JOIN profiles profile ON profile.user_id=account.id
        LEFT JOIN admin_roles operator ON operator.user_id=account.id WHERE account.id=?`).get(userId) as {
          id: string; email: string; account_status: string; created_at: string; username: string | null; operator_role: string | null;
        } | undefined;
      if (!user) return error(res, 404, 'not_found', 'This account does not exist.', req.requestId);

      const [map, activity, deletion] = await Promise.all([
        dataMap.getForOwner(userId),
        database.prepare(`SELECT event_type,created_at FROM account_security_events WHERE owner_id=? AND created_at>=?
          ORDER BY created_at DESC,id DESC LIMIT 20`).all(userId, new Date(Date.now() - ACCOUNT_ACTIVITY_RETENTION_MS).toISOString()) as Promise<Array<{ event_type: string; created_at: string }>>,
        database.prepare(`SELECT status,requested_at,completed_at FROM account_deletion_requests WHERE owner_id=?
          ORDER BY requested_at DESC,id DESC LIMIT 1`).get(userId) as Promise<{ status: string; requested_at: string; completed_at: string | null } | undefined>,
      ]);
      await audit(req.user!.id, 'admin_user_detail_viewed', userId, {});
      return res.json({ user: {
        userId: user.id,
        email: user.email,
        accountStatus: user.account_status,
        createdAt: user.created_at,
        username: user.username,
        operatorRole: user.operator_role,
        dataCategories: map.categories.map(({ id, label, rowCount }) => ({ id, label, rowCount })),
        recentSecurityActivity: activity.map((event) => ({ eventType: event.event_type, createdAt: event.created_at })),
        latestDeletion: deletion ? { status: deletion.status, requestedAt: deletion.requested_at, completedAt: deletion.completed_at } : null,
      } });
    } catch (cause) { return next(cause); }
  });

  return router;
}
