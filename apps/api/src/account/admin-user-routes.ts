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
const auditSources = ['security', 'deletion', 'admin_access'] as const;
const auditEventTypes = [
  'sign_in', 'sign_out', 'deletion_requested', 'deletion_cancelled',
  'requested', 'cancelled', 'approved', 'retry_requested', 'claim_acquired', 'step_started', 'step_completed', 'step_failed', 'completed',
  'admin_summary_viewed', 'admin_worker_status_viewed', 'admin_import_list_viewed', 'admin_audit_events_viewed', 'admin_user_list_viewed', 'admin_user_detail_viewed', 'admin_user_timeline_viewed',
] as const;
const timelineSources = ['security', 'deletion', 'export', 'import', 'admin_access'] as const;
const auditCursorSchema = z.object({
  version: z.literal(1), createdAt: z.iso.datetime(), id: z.string().min(1).max(128), source: z.enum(auditSources),
}).strict();
const timelineCursorSchema = z.object({
  version: z.literal(1), createdAt: z.iso.datetime(), id: z.string().min(1).max(128), source: z.enum(timelineSources),
}).strict();
const timelineSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(512).optional() }).strict();
const auditEventSchema = z.object({
  source: z.enum(auditSources).optional(),
  eventType: z.enum(auditEventTypes).optional(),
  targetUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
}).strict();

function error(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeAuditCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    const result = auditCursorSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch { return null; }
}

function encodeAuditCursor(value: { createdAt: string; id: string; source: typeof auditSources[number] }): string {
  return Buffer.from(JSON.stringify({ version: 1, ...value })).toString('base64url');
}

function decodeTimelineCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    const result = timelineCursorSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch { return null; }
}

function encodeTimelineCursor(value: { createdAt: string; id: string; source: typeof timelineSources[number] }): string {
  return Buffer.from(JSON.stringify({ version: 1, ...value })).toString('base64url');
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

  async function audit(actorId: string, eventType: 'admin_summary_viewed' | 'admin_worker_status_viewed' | 'admin_import_list_viewed' | 'admin_audit_events_viewed' | 'admin_user_list_viewed' | 'admin_user_detail_viewed' | 'admin_user_timeline_viewed', targetId: string | null,
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
      const [jobs, imports, aiJobs, visualJobs, exports] = await Promise.all([
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
          min(created_at) FILTER (WHERE status='queued') AS oldest_queued_at FROM visual_embedding_jobs`).get() as Promise<Record<string, unknown>>,
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
        visualEmbeddingJobs: queue(visualJobs),
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

  router.get('/admin/audit-events', auth, readLimit, async (req, res, next) => {
    try {
      if (!await requireAdmin(req.user!.id, res, req.requestId)) return;
      const parsed = auditEventSchema.safeParse(req.query);
      if (!parsed.success) return error(res, 400, 'invalid_audit_filter', 'Use supported source and event filters, an account ID, and a page size from 1 to 100.', req.requestId);
      const { source, eventType, targetUserId, limit, cursor: rawCursor } = parsed.data;
      const cursor = decodeAuditCursor(rawCursor);
      if (cursor === null) return error(res, 400, 'invalid_audit_cursor', 'The audit page cursor is invalid.', req.requestId);
      const branches: string[] = [];
      const parameters: unknown[] = [];
      const addBranch = (branchSource: typeof auditSources[number], table: string, actorSql: string, targetColumn: string, targetValue: string | null) => {
        const where: string[] = [];
        if (source && source !== branchSource) where.push('FALSE');
        if (eventType) { where.push('event_type=?'); parameters.push(eventType); }
        if (targetValue) { where.push(`${targetColumn}=?`); parameters.push(targetValue); }
        if (cursor) {
          where.push(`(created_at,id,'${branchSource}') < (?,?,?)`);
          parameters.push(cursor.createdAt, cursor.id, cursor.source);
        }
        branches.push(`SELECT id,created_at,'${branchSource}'::text AS source,event_type,${actorSql} AS actor_type,${targetColumn} AS target_id
          FROM ${table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`);
      };
      addBranch('security', 'account_security_events', "'owner'::text", 'owner_id', targetUserId ?? null);
      const hashedTarget = targetUserId ? hash(targetUserId) : null;
      addBranch('deletion', 'account_deletion_audit', 'actor_type', 'owner_hash', hashedTarget);
      addBranch('admin_access', 'admin_access_audit', "'admin'::text", 'target_hash', hashedTarget);
      parameters.push(limit + 1);
      const rows = await database.prepare(`SELECT id,created_at,source,event_type,actor_type,target_id FROM (${branches.join('\nUNION ALL\n')}) events
        ORDER BY created_at DESC,id DESC,source DESC LIMIT ?`).all(...parameters) as Array<{
          id: string; created_at: string; source: typeof auditSources[number]; event_type: string; actor_type: string; target_id: string | null;
        }>;
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).map((row) => ({
        reference: hash(`${row.source}:${row.id}`).slice(0, 16), source: row.source, eventType: row.event_type,
        actorType: row.actor_type, targetReference: row.target_id
          ? (/^[0-9a-f]{64}$/i.test(row.target_id) ? row.target_id : hash(row.target_id)).slice(0, 16)
          : null,
        createdAt: row.created_at,
      }));
      await audit(req.user!.id, 'admin_audit_events_viewed', null, {
        limit, hasSourceFilter: Boolean(source), hasEventTypeFilter: Boolean(eventType), hasTargetFilter: Boolean(targetUserId), hasCursor: Boolean(cursor), resultCount: page.length,
      });
      const last = page.at(-1);
      return res.json({ auditEvents: page, nextCursor: hasMore && last ? encodeAuditCursor({ createdAt: last.createdAt, id: rows[page.length - 1]!.id, source: last.source }) : null });
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

  router.get('/admin/users/:userId/timeline', auth, readLimit, async (req, res, next) => {
    const userId = req.params.userId;
    if (typeof userId !== 'string' || !userIdSchema.safeParse(userId).success) return error(res, 404, 'not_found', 'This account does not exist.', req.requestId);
    const parsed = timelineSchema.safeParse(req.query);
    if (!parsed.success) return error(res, 400, 'invalid_timeline_filter', 'Use a page size from 1 to 100 and a valid timeline cursor.', req.requestId);
    const cursor = decodeTimelineCursor(parsed.data.cursor);
    if (cursor === null) return error(res, 400, 'invalid_timeline_cursor', 'The timeline page cursor is invalid.', req.requestId);
    try {
      if (!await requireAdmin(req.user!.id, res, req.requestId)) return;
      const exists = await database.prepare('SELECT id FROM users WHERE id=?').get(userId) as { id: string } | undefined;
      if (!exists) return error(res, 404, 'not_found', 'This account does not exist.', req.requestId);
      const ownerHash = hash(userId);
      const branches: string[] = [];
      const parameters: unknown[] = [];
      const addBranch = (source: typeof timelineSources[number], table: string, timestampColumn: string, eventSql: string, actorSql: string,
        whereSql: string, whereParameters: unknown[]) => {
        const where = [whereSql];
        const branchParameters = [...whereParameters];
        if (cursor) {
          where.push(`(${timestampColumn},id,'${source}') < (?,?,?)`);
          branchParameters.push(cursor.createdAt, cursor.id, cursor.source);
        }
        branches.push(`SELECT id,created_at,'${source}'::text AS source,event_type,actor_type FROM (
          SELECT id,${timestampColumn} AS created_at,${eventSql} AS event_type,${actorSql} AS actor_type
          FROM ${table} WHERE ${where.join(' AND ')} ORDER BY ${timestampColumn} DESC,id DESC LIMIT ?
        ) ${source}`);
        parameters.push(...branchParameters, parsed.data.limit + 1);
      };
      addBranch('security', 'account_security_events', 'created_at', 'event_type', "'owner'::text", 'owner_id=? AND created_at>=?',
        [userId, new Date(Date.now() - ACCOUNT_ACTIVITY_RETENTION_MS).toISOString()]);
      addBranch('deletion', 'account_deletion_audit', 'created_at', 'event_type', 'actor_type', 'owner_hash=?', [ownerHash]);
      addBranch('export', 'account_data_exports', 'updated_at', `CASE status WHEN 'queued' THEN 'export_queued' WHEN 'processing' THEN 'export_processing' WHEN 'ready' THEN 'export_ready'
        WHEN 'failed' THEN 'export_failed' WHEN 'cancelled' THEN 'export_cancelled' WHEN 'expired' THEN 'export_expired' ELSE 'export_status' END`, "'owner'::text", 'owner_id=?', [userId]);
      addBranch('import', 'imports', 'updated_at', `CASE status WHEN 'uploading' THEN 'import_uploading' WHEN 'staged' THEN 'import_staged' WHEN 'parsing' THEN 'import_parsing'
        WHEN 'queued' THEN 'import_queued' WHEN 'processing' THEN 'import_processing' WHEN 'completed' THEN 'import_completed'
        WHEN 'partial' THEN 'import_partial' WHEN 'failed' THEN 'import_failed' WHEN 'expired' THEN 'import_expired' ELSE 'import_status' END`, "'owner'::text", 'owner_id=?', [userId]);
      addBranch('admin_access', 'admin_access_audit', 'created_at', 'event_type', "'admin'::text", "target_hash=? AND event_type<>'admin_user_timeline_viewed'", [ownerHash]);
      parameters.push(parsed.data.limit + 1);
      const rows = await database.prepare(`SELECT id,created_at,source,event_type,actor_type FROM (${branches.join('\nUNION ALL\n')}) timeline
        ORDER BY created_at DESC,id DESC,source DESC LIMIT ?`).all(...parameters) as Array<{
          id: string; created_at: string; source: typeof timelineSources[number]; event_type: string; actor_type: string;
        }>;
      const hasMore = rows.length > parsed.data.limit;
      const pageRows = rows.slice(0, parsed.data.limit);
      const timeline = pageRows.map((row) => ({
        reference: hash(`${row.source}:${row.id}`).slice(0, 16),
        source: row.source,
        eventType: row.event_type,
        actorType: row.actor_type,
        createdAt: row.created_at,
      }));
      await audit(req.user!.id, 'admin_user_timeline_viewed', userId, {
        limit: parsed.data.limit, hasCursor: Boolean(cursor), resultCount: timeline.length,
      });
      const last = pageRows.at(-1);
      return res.json({ timeline, nextCursor: hasMore && last ? encodeTimelineCursor({ createdAt: last.created_at, id: last.id, source: last.source }) : null });
    } catch (cause) { return next(cause); }
  });

  return router;
}
