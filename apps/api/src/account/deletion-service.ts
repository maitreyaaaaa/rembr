import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { ACCOUNT_OWNER_TABLES } from './data-map-service.js';
import type { AssetStorage } from '../assets/storage.js';
import type { ImportStorage } from '../imports/storage.js';
import type { MediaStorage } from '../media/storage.js';
import type { PrivateExportArtifactStorage } from './data-export-service.js';
import { recordAccountSecurityEvent } from './security-activity.js';

const DELETION_STEPS = ['quiesce_workers', 'revoke_access', 'remove_storage', 'delete_owner_records', 'delete_identity'] as const;
const DELETION_CODES = ['account_inactive', 'account_not_found', 'admin_role_required', 'attempts_exhausted', 'claim_lost',
  'deletion_not_approvable', 'deletion_not_found', 'deletion_not_retryable', 'deletion_step_failed', 'export_confirmation_required',
  'owner_missing', 'storage_cleanup_failed', 'storage_cursor_invalid'] as const;
const DELETION_EVENTS = ['requested', 'cancelled', 'approved', 'retry_requested', 'claim_acquired', 'step_started', 'step_completed', 'step_failed', 'completed'] as const;
const AUDIT_ACTORS = ['owner', 'admin', 'worker'] as const;
const ACTIVE_STATUSES = ['pending_approval', 'approved', 'processing', 'partial_failed', 'failed'] as const;
const DELETION_LEASE_MS = 30 * 60_000;
const DELETION_STORAGE_BATCH_SIZE = 20;
const QUIESCE_RETRY_MS = 30_000;
const UPLOAD_GRACE_MS = 10 * 60_000;

type DeletionStatus = typeof ACTIVE_STATUSES[number] | 'completed' | 'cancelled';
type DeletionRow = {
  id: string;
  owner_id: string | null;
  owner_hash: string;
  status: DeletionStatus;
  export_confirmed: boolean | number;
  requested_at: string;
  approved_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  error_code: string | null;
};

export interface AccountDeletionClaim {
  id: string;
  ownerId: string | null;
  ownerHash: string;
  attemptCount: number;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface AccountDeletionStorage {
  assets: Pick<AssetStorage, 'remove'>;
  imports: Pick<ImportStorage, 'removeFile'>;
  media: Pick<MediaStorage, 'remove'>;
  exports: Pick<PrivateExportArtifactStorage, 'remove'>;
}

export class AccountDeletionError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = 'AccountDeletionError'; }
}

function ownerHash(ownerId: string): string {
  return createHash('sha256').update(ownerId).digest('hex');
}

function toPublic(row: DeletionRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    exportConfirmed: Boolean(row.export_confirmed),
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    errorCode: row.error_code,
    canCancel: row.status === 'pending_approval',
  };
}

async function addAudit(database: DatabaseHandle, input: {
  requestId: string; ownerHash: string; actorType: 'owner' | 'admin' | 'worker'; actorUserId?: string | null;
  actorHash?: string | null; eventType: 'requested' | 'cancelled' | 'approved' | 'retry_requested' | 'claim_acquired' | 'step_started' | 'step_completed' | 'step_failed' | 'completed';
  metadata?: Record<string, string | number | boolean | null>; now: string;
}) {
  await database.prepare(`INSERT INTO account_deletion_audit
    (id,request_id,owner_hash,actor_type,actor_user_id,actor_hash,event_type,metadata,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(), input.requestId, input.ownerHash, input.actorType,
    input.actorUserId ?? null, input.actorHash ?? null, input.eventType, JSON.stringify(input.metadata ?? {}), input.now);
}

export function createAccountDeletionService(database: DatabaseHandle) {
  async function getById(requestId: string): Promise<DeletionRow | undefined> {
    return database.prepare('SELECT * FROM account_deletion_requests WHERE id=?').get(requestId) as Promise<DeletionRow | undefined>;
  }

  function safeAuditMetadata(value: unknown): Record<string, string | number> | undefined {
    let source: unknown = value;
    if (typeof source === 'string') {
      try { source = JSON.parse(source) as unknown; } catch { return undefined; }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
    const metadata = source as Record<string, unknown>;
    const safe: Record<string, string | number> = {};
    if (typeof metadata.step === 'string' && DELETION_STEPS.includes(metadata.step as typeof DELETION_STEPS[number])) safe.step = metadata.step;
    if (typeof metadata.code === 'string' && DELETION_CODES.includes(metadata.code as typeof DELETION_CODES[number])) safe.code = metadata.code;
    if (typeof metadata.attempt === 'number' && Number.isSafeInteger(metadata.attempt) && metadata.attempt >= 0 && metadata.attempt <= 8) safe.attempt = metadata.attempt;
    return Object.keys(safe).length ? safe : undefined;
  }

  async function ownsLiveClaim(claim: AccountDeletionClaim, now: string): Promise<boolean> {
    const row = await database.prepare(`SELECT id FROM account_deletion_requests WHERE id=? AND status='processing'
      AND lease_token=? AND lease_expires_at>?`).get(claim.id, claim.leaseToken, now);
    return Boolean(row);
  }

  async function hasInFlightWork(ownerId: string, now: Date): Promise<boolean> {
    const timestamp = now.toISOString();
    const uploadCutoff = new Date(now.getTime() - UPLOAD_GRACE_MS).toISOString();
    const rows = await Promise.all([
      database.prepare(`SELECT 1 FROM processing_jobs WHERE owner_id=? AND status IN ('processing','cancel_requested') AND lease_expires_at>? LIMIT 1`).get(ownerId, timestamp),
      database.prepare(`SELECT 1 FROM ai_analysis_jobs WHERE owner_id=? AND status='processing' AND lease_expires_at>? LIMIT 1`).get(ownerId, timestamp),
      database.prepare(`SELECT 1 FROM imports WHERE owner_id=? AND status='parsing' AND lease_expires_at>? LIMIT 1`).get(ownerId, timestamp),
      database.prepare(`SELECT 1 FROM account_data_exports WHERE owner_id=? AND status='processing' AND lease_expires_at>? LIMIT 1`).get(ownerId, timestamp),
      database.prepare('SELECT 1 FROM account_owner_work_leases WHERE owner_id=? AND expires_at>? LIMIT 1').get(ownerId, timestamp),
      database.prepare(`SELECT 1 FROM asset_objects WHERE owner_id=? AND state='staging' AND updated_at>? LIMIT 1`).get(ownerId, uploadCutoff),
      database.prepare(`SELECT 1 FROM import_upload_files WHERE owner_id=? AND state='uploading' AND updated_at>? LIMIT 1`).get(ownerId, uploadCutoff),
    ]);
    return rows.some(Boolean);
  }

  async function renewClaim(claim: AccountDeletionClaim): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DELETION_LEASE_MS).toISOString();
    const result = await database.prepare(`UPDATE account_deletion_requests SET lease_expires_at=?,updated_at=?
      WHERE id=? AND status='processing' AND lease_token=? AND lease_expires_at>?`)
      .run(expiresAt, now.toISOString(), claim.id, claim.leaseToken, now.toISOString());
    if (result.changes !== 1) throw new AccountDeletionError('claim_lost');
  }

  async function removeOwnerStorage(ownerId: string, claim: AccountDeletionClaim, storage: AccountDeletionStorage): Promise<void> {
    const cursorRow = await database.prepare(`SELECT progress_cursor FROM account_deletion_steps
      WHERE request_id=? AND step_key='remove_storage'`).get(claim.id) as { progress_cursor: string | null } | undefined;
    let cursors: Record<string, string> = {};
    try { cursors = cursorRow?.progress_cursor ? JSON.parse(cursorRow.progress_cursor) as Record<string, string> : {}; }
    catch { throw new AccountDeletionError('storage_cursor_invalid'); }

    const buckets = [
      { name: 'assets', query: 'SELECT id,storage_key AS storage_key FROM asset_objects WHERE owner_id=? AND id>? ORDER BY id LIMIT ?', remove: (key: string) => storage.assets.remove(key) },
      { name: 'imports', query: 'SELECT id,storage_key AS storage_key FROM import_upload_files WHERE owner_id=? AND id>? ORDER BY id LIMIT ?', remove: (key: string) => storage.imports.removeFile(key) },
      { name: 'media', query: 'SELECT id,storage_key AS storage_key FROM media_artifacts WHERE owner_id=? AND id>? ORDER BY id LIMIT ?', remove: (key: string) => storage.media.remove(key) },
      { name: 'media_cleanup_queue', query: 'SELECT storage_key AS id,storage_key FROM media_cleanup_queue WHERE owner_id=? AND storage_key>? ORDER BY storage_key LIMIT ?', remove: (key: string) => storage.media.remove(key) },
      { name: 'exports', query: 'SELECT id,artifact_key AS storage_key FROM account_data_exports WHERE owner_id=? AND artifact_key IS NOT NULL AND id>? ORDER BY id LIMIT ?', remove: (key: string) => storage.exports.remove(ownerId, key) },
    ] as const;

    for (const bucket of buckets) {
      let cursor = cursors[bucket.name] ?? '';
      while (true) {
        await renewClaim(claim);
        const rows = await database.prepare(bucket.query).all(ownerId, cursor, DELETION_STORAGE_BATCH_SIZE) as Array<{ id: string; storage_key: string }>;
        if (rows.length === 0) break;
        let renewalError: unknown;
        let renewalRunning = false;
        const heartbeat = setInterval(() => {
          if (renewalRunning || renewalError) return;
          renewalRunning = true;
          void renewClaim(claim).catch((cause: unknown) => { renewalError = cause; }).finally(() => { renewalRunning = false; });
        }, Math.floor(DELETION_LEASE_MS / 3));
        heartbeat.unref();
        let outcomes: PromiseSettledResult<void>[];
        try {
          outcomes = await Promise.allSettled(rows.map((row) => bucket.remove(row.storage_key)));
        } finally {
          clearInterval(heartbeat);
        }
        if (renewalError) throw renewalError;
        if (outcomes.some((result) => result.status === 'rejected')) throw new AccountDeletionError('storage_cleanup_failed');
        await database.transaction(async () => {
          await renewClaim(claim);
          if (bucket.name === 'media' || bucket.name === 'media_cleanup_queue') {
            for (const row of rows) await database.prepare('DELETE FROM media_cleanup_queue WHERE storage_key=? AND (owner_id=? OR owner_id IS NULL)')
              .run(row.storage_key, ownerId);
          }
          cursor = rows[rows.length - 1]!.id;
          cursors[bucket.name] = cursor;
          await database.prepare(`UPDATE account_deletion_steps SET progress_cursor=?,updated_at=?
            WHERE request_id=? AND step_key='remove_storage' AND status='running'`)
            .run(JSON.stringify(cursors), new Date().toISOString(), claim.id);
        })();
      }
    }
  }

  async function executeStep(claim: AccountDeletionClaim, stepKey: typeof DELETION_STEPS[number], storage: AccountDeletionStorage, now: Date) {
    const ownerId = claim.ownerId;
    if (stepKey === 'quiesce_workers') {
      if (!ownerId) throw new AccountDeletionError('owner_missing');
      if (await hasInFlightWork(ownerId, now)) return false;
      return true;
    }
    if (stepKey === 'revoke_access') {
      if (!ownerId) throw new AccountDeletionError('owner_missing');
      await database.transaction(async () => {
        const owner = await database.prepare('SELECT account_status FROM users WHERE id=? FOR UPDATE').get(ownerId) as { account_status: string } | undefined;
        if (!owner || owner.account_status !== 'disabled') throw new AccountDeletionError('owner_missing');
        await database.prepare('DELETE FROM sessions WHERE user_id=?').run(ownerId);
      })();
      return true;
    }
    if (stepKey === 'remove_storage') {
      if (!ownerId) throw new AccountDeletionError('owner_missing');
      await removeOwnerStorage(ownerId, claim, storage);
      return true;
    }
    if (stepKey === 'delete_owner_records') {
      if (!ownerId) throw new AccountDeletionError('owner_missing');
      await database.transaction(async () => {
        const owner = await database.prepare('SELECT account_status FROM users WHERE id=? FOR UPDATE').get(ownerId) as { account_status: string } | undefined;
        if (!owner || owner.account_status !== 'disabled') throw new AccountDeletionError('owner_missing');
        for (const table of ACCOUNT_OWNER_TABLES) {
          if (table.table === 'users' || table.table === 'account_deletion_requests') continue;
          await database.prepare(`DELETE FROM ${table.table} WHERE ${table.ownerColumn}=?`).run(ownerId);
        }
        await database.prepare('DELETE FROM account_owner_work_leases WHERE owner_id=? AND expires_at<=?').run(ownerId, new Date().toISOString());
      })();
      return true;
    }
    if (stepKey === 'delete_identity') {
      await database.transaction(async () => {
        if (!ownerId) {
          const prior = await database.prepare(`SELECT status FROM account_deletion_steps WHERE request_id=? AND step_key='delete_owner_records'`)
            .get(claim.id) as { status: string } | undefined;
          if (prior?.status !== 'completed') throw new AccountDeletionError('owner_missing');
          return;
        }
        const owner = await database.prepare('SELECT account_status FROM users WHERE id=? FOR UPDATE').get(ownerId) as { account_status: string } | undefined;
        if (!owner || owner.account_status !== 'disabled') throw new AccountDeletionError('owner_missing');
        await database.prepare('DELETE FROM users WHERE id=?').run(ownerId);
      })();
      return true;
    }
    return true;
  }

  return {
    async request(ownerId: string, exportConfirmed: boolean, now = new Date()) {
      if (exportConfirmed !== true) throw new AccountDeletionError('export_confirmation_required');
      const timestamp = now.toISOString();
      return database.transaction(async () => {
        const owner = await database.prepare('SELECT account_status FROM users WHERE id=? FOR UPDATE').get(ownerId) as { account_status: string } | undefined;
        if (!owner) throw new AccountDeletionError('account_not_found');
        const prior = await database.prepare(`SELECT * FROM account_deletion_requests WHERE owner_id=? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
          ORDER BY requested_at DESC LIMIT 1`).get(ownerId, ...ACTIVE_STATUSES) as DeletionRow | undefined;
        if (prior) return { created: false, deletion: toPublic(prior) };
        if (owner.account_status !== 'active') throw new AccountDeletionError('account_inactive');

        const id = randomUUID();
        const hash = ownerHash(ownerId);
        await database.prepare(`INSERT INTO account_deletion_requests
          (id,owner_id,owner_hash,status,export_confirmed,attempt_count,max_attempts,requested_at,available_at,created_at,updated_at)
          VALUES (?,?,?,'pending_approval',TRUE,0,8,?,?,?,?)`).run(id, ownerId, hash, timestamp, timestamp, timestamp, timestamp);
        const disabled = await database.prepare(`UPDATE users SET account_status='disabled' WHERE id=? AND account_status='active'`).run(ownerId);
        if (disabled.changes !== 1) throw new AccountDeletionError('account_inactive');
        for (const stepKey of DELETION_STEPS) {
          await database.prepare(`INSERT INTO account_deletion_steps (id,request_id,step_key,status,attempt_count,updated_at)
            VALUES (?,?,?,'pending',0,?)`).run(randomUUID(), id, stepKey, timestamp);
        }
        await addAudit(database, { requestId: id, ownerHash: hash, actorType: 'owner', actorUserId: ownerId, eventType: 'requested', now: timestamp });
        await recordAccountSecurityEvent(database, ownerId, 'deletion_requested', now);
        return { created: true, deletion: toPublic(await database.prepare('SELECT * FROM account_deletion_requests WHERE id=?').get(id) as DeletionRow) };
      })();
    },

    async getForOwner(ownerId: string) {
      const row = await database.prepare(`SELECT * FROM account_deletion_requests WHERE owner_id=?
        ORDER BY requested_at DESC,id DESC LIMIT 1`).get(ownerId) as DeletionRow | undefined;
      return toPublic(row);
    },

    async cancelForOwner(ownerId: string, now = new Date()) {
      const timestamp = now.toISOString();
      return database.transaction(async () => {
        const owner = await database.prepare('SELECT account_status FROM users WHERE id=? FOR UPDATE').get(ownerId) as { account_status: string } | undefined;
        if (!owner) return null;
        const row = await database.prepare(`SELECT * FROM account_deletion_requests WHERE owner_id=? AND status='pending_approval'
          ORDER BY requested_at DESC LIMIT 1 FOR UPDATE`).get(ownerId) as DeletionRow | undefined;
        if (!row || owner.account_status !== 'disabled') return null;
        const changed = await database.prepare(`UPDATE account_deletion_requests SET status='cancelled',cancelled_at=?,updated_at=?,error_code=NULL
          WHERE id=? AND status='pending_approval'`).run(timestamp, timestamp, row.id);
        if (changed.changes !== 1) return null;
        await database.prepare(`UPDATE users SET account_status='active' WHERE id=? AND account_status='disabled'`).run(ownerId);
        await addAudit(database, { requestId: row.id, ownerHash: row.owner_hash, actorType: 'owner', actorUserId: ownerId, eventType: 'cancelled', now: timestamp });
        await recordAccountSecurityEvent(database, ownerId, 'deletion_cancelled', now);
        const updated = await database.prepare('SELECT * FROM account_deletion_requests WHERE id=?').get(row.id) as DeletionRow;
        return toPublic(updated);
      })();
    },

    async roleFor(userId: string): Promise<'support' | 'admin' | null> {
      const row = await database.prepare('SELECT role FROM admin_roles WHERE user_id=?').get(userId) as { role: 'support' | 'admin' } | undefined;
      return row?.role ?? null;
    },

    async listPending(limit = 50) {
      const bounded = Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, 50)) : 50;
      const rows = await database.prepare(`SELECT deletion.id,deletion.owner_hash,deletion.status,deletion.requested_at,deletion.export_confirmed,
          deletion.owner_id,CASE WHEN deletion.owner_id IS NOT NULL THEN TRUE ELSE EXISTS (
            SELECT 1 FROM account_deletion_steps step WHERE step.request_id=deletion.id
              AND step.step_key='delete_owner_records' AND step.status='completed'
          ) END AS owner_cleanup_complete
        FROM account_deletion_requests deletion WHERE deletion.status IN ('pending_approval','approved','processing','partial_failed','failed')
        ORDER BY CASE deletion.status WHEN 'pending_approval' THEN 0 WHEN 'partial_failed' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,
          deletion.requested_at,deletion.id LIMIT ?`).all(bounded) as Array<{
            id: string; owner_hash: string; status: string; requested_at: string; export_confirmed: boolean | number;
            owner_id: string | null; owner_cleanup_complete: boolean | number;
          }>;
      return rows.map((row) => ({
        id: String(row.id), ownerReference: String(row.owner_hash).slice(0, 12), status: String(row.status),
        requestedAt: String(row.requested_at), exportConfirmed: Boolean(row.export_confirmed),
        canRetry: ['partial_failed', 'failed'].includes(String(row.status)) && (row.owner_id !== null || Boolean(row.owner_cleanup_complete)),
      }));
    },

    async listAudit(requestId: string, limit = 100) {
      const bounded = Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 100;
      const exists = await database.prepare('SELECT id FROM account_deletion_requests WHERE id=?').get(requestId);
      if (!exists) return null;
      const rows = await database.prepare(`SELECT event_type,actor_type,metadata,created_at FROM account_deletion_audit
        WHERE request_id=? ORDER BY created_at,id LIMIT ?`).all(requestId, bounded) as Array<{
          event_type: string; actor_type: string; metadata: unknown; created_at: string;
        }>;
      return rows.flatMap((row) => {
        if (!DELETION_EVENTS.includes(row.event_type as typeof DELETION_EVENTS[number]) || !AUDIT_ACTORS.includes(row.actor_type as typeof AUDIT_ACTORS[number])) return [];
        const createdAt = new Date(row.created_at);
        if (Number.isNaN(createdAt.getTime())) return [];
        const metadata = safeAuditMetadata(row.metadata);
        return [{ eventType: row.event_type, actorType: row.actor_type, createdAt: createdAt.toISOString(), ...(metadata ? { metadata } : {}) }];
      });
    },

    async approve(requestId: string, adminId: string, now = new Date()) {
      const timestamp = now.toISOString();
      const candidate = await database.prepare('SELECT owner_id FROM account_deletion_requests WHERE id=?').get(requestId) as { owner_id: string | null } | undefined;
      if (!candidate) throw new AccountDeletionError('deletion_not_found');
      if (!candidate.owner_id) throw new AccountDeletionError('owner_missing');
      return database.transaction(async () => {
        const actor = await database.prepare('SELECT role FROM admin_roles WHERE user_id=? FOR UPDATE').get(adminId) as { role: string } | undefined;
        if (actor?.role !== 'admin') throw new AccountDeletionError('admin_role_required');
        const owner = await database.prepare('SELECT account_status FROM users WHERE id=? FOR UPDATE').get(candidate.owner_id!) as { account_status: string } | undefined;
        const row = await database.prepare(`SELECT * FROM account_deletion_requests WHERE id=? FOR UPDATE`).get(requestId) as DeletionRow | undefined;
        if (!owner || !row || row.owner_id !== candidate.owner_id || row.status !== 'pending_approval' || owner.account_status !== 'disabled') {
          throw new AccountDeletionError('deletion_not_approvable');
        }
        await database.prepare(`UPDATE account_deletion_requests SET status='approved',approved_at=?,approved_by=?,available_at=?,updated_at=?,error_code=NULL WHERE id=?`)
          .run(timestamp, adminId, timestamp, timestamp, requestId);
        await addAudit(database, { requestId, ownerHash: row.owner_hash, actorType: 'admin', actorUserId: adminId,
          actorHash: ownerHash(adminId), eventType: 'approved', now: timestamp });
        return toPublic(await database.prepare('SELECT * FROM account_deletion_requests WHERE id=?').get(requestId) as DeletionRow);
      })();
    },

    async retry(requestId: string, adminId: string, now = new Date()) {
      const timestamp = now.toISOString();
      return database.transaction(async () => {
        const actor = await database.prepare('SELECT role FROM admin_roles WHERE user_id=? FOR UPDATE').get(adminId) as { role: string } | undefined;
        if (actor?.role !== 'admin') throw new AccountDeletionError('admin_role_required');
        const row = await database.prepare(`SELECT * FROM account_deletion_requests WHERE id=? FOR UPDATE`).get(requestId) as DeletionRow & { attempt_count: number; max_attempts: number } | undefined;
        if (!row) throw new AccountDeletionError('deletion_not_found');
        if (!['failed', 'partial_failed'].includes(row.status)) {
          throw new AccountDeletionError('deletion_not_retryable');
        }
        if (!row.owner_id) {
          const ownerCleanup = await database.prepare(`SELECT status FROM account_deletion_steps
            WHERE request_id=? AND step_key='delete_owner_records'`).get(requestId) as { status: string } | undefined;
          if (ownerCleanup?.status !== 'completed') throw new AccountDeletionError('deletion_not_retryable');
        }
        await database.prepare(`UPDATE account_deletion_requests SET status='approved',attempt_count=0,operator_retry_count=operator_retry_count+1,
          available_at=?,updated_at=?,error_code=NULL WHERE id=?`).run(timestamp, timestamp, requestId);
        await addAudit(database, { requestId, ownerHash: row.owner_hash, actorType: 'admin', actorUserId: adminId,
          actorHash: ownerHash(adminId), eventType: 'retry_requested', metadata: { automatedAttemptsReset: true }, now: timestamp });
        return toPublic(await database.prepare('SELECT * FROM account_deletion_requests WHERE id=?').get(requestId) as DeletionRow);
      })();
    },

    async claimNext(now = new Date()): Promise<AccountDeletionClaim | null> {
      const timestamp = now.toISOString();
      await database.transaction(async () => {
        await database.prepare(`UPDATE account_deletion_requests SET status='failed',lease_token=NULL,lease_expires_at=NULL,
          error_code='attempts_exhausted',updated_at=? WHERE status='processing' AND lease_expires_at<=? AND attempt_count>=max_attempts`)
          .run(timestamp, timestamp);
      })();
      const leaseToken = randomUUID();
      const leaseExpiresAt = new Date(now.getTime() + DELETION_LEASE_MS).toISOString();
      const row = await database.transaction(async () => {
        let claimed = await database.prepare(`WITH owner_candidate AS MATERIALIZED (
          SELECT owner.id FROM account_deletion_requests deletion JOIN users owner ON owner.id=deletion.owner_id
          WHERE owner.account_status='disabled' AND deletion.available_at<=? AND deletion.attempt_count<deletion.max_attempts
            AND (deletion.status='approved' OR (deletion.status='processing' AND deletion.lease_expires_at<=?))
          ORDER BY deletion.requested_at,deletion.id LIMIT 1 FOR UPDATE OF owner SKIP LOCKED
        ), request_candidate AS MATERIALIZED (
          SELECT deletion.id FROM account_deletion_requests deletion JOIN owner_candidate owner ON owner.id=deletion.owner_id
          WHERE deletion.available_at<=? AND deletion.attempt_count<deletion.max_attempts
            AND (deletion.status='approved' OR (deletion.status='processing' AND deletion.lease_expires_at<=?))
          ORDER BY deletion.requested_at,deletion.id LIMIT 1 FOR UPDATE OF deletion SKIP LOCKED
        )
        UPDATE account_deletion_requests AS deletion SET status='processing',attempt_count=deletion.attempt_count+1,
          lease_token=?,lease_expires_at=?,updated_at=?,error_code=NULL
        FROM request_candidate candidate WHERE deletion.id=candidate.id
        RETURNING deletion.id,deletion.owner_id,deletion.owner_hash,deletion.attempt_count,deletion.lease_token,deletion.lease_expires_at`)
          .get(timestamp, timestamp, timestamp, timestamp, leaseToken, leaseExpiresAt, timestamp) as
          { id: string; owner_id: string | null; owner_hash: string; attempt_count: number; lease_token: string; lease_expires_at: string } | undefined;
        if (!claimed) claimed = await database.prepare(`WITH candidate AS MATERIALIZED (
          SELECT deletion.id FROM account_deletion_requests deletion
          JOIN account_deletion_steps step ON step.request_id=deletion.id AND step.step_key='delete_owner_records' AND step.status='completed'
          WHERE deletion.owner_id IS NULL AND deletion.available_at<=? AND deletion.attempt_count<deletion.max_attempts
            AND (deletion.status='approved' OR (deletion.status='processing' AND deletion.lease_expires_at<=?))
          ORDER BY deletion.requested_at,deletion.id LIMIT 1 FOR UPDATE OF deletion SKIP LOCKED
        )
        UPDATE account_deletion_requests AS deletion SET status='processing',attempt_count=deletion.attempt_count+1,
          lease_token=?,lease_expires_at=?,updated_at=?,error_code=NULL FROM candidate WHERE deletion.id=candidate.id
        RETURNING deletion.id,deletion.owner_id,deletion.owner_hash,deletion.attempt_count,deletion.lease_token,deletion.lease_expires_at`)
          .get(timestamp, timestamp, leaseToken, leaseExpiresAt, timestamp) as
          { id: string; owner_id: string | null; owner_hash: string; attempt_count: number; lease_token: string; lease_expires_at: string } | undefined;
        if (claimed) await addAudit(database, { requestId: claimed.id, ownerHash: claimed.owner_hash, actorType: 'worker',
          eventType: 'claim_acquired', metadata: { attempt: Number(claimed.attempt_count) }, now: timestamp });
        return claimed;
      })();
      if (!row) return null;
      return { id: row.id, ownerId: row.owner_id, ownerHash: row.owner_hash, attemptCount: Number(row.attempt_count), leaseToken: row.lease_token, leaseExpiresAt: row.lease_expires_at };
    },

    async processClaim(claim: AccountDeletionClaim, storage: AccountDeletionStorage, now = new Date()) {
      const timestamp = now.toISOString();
      if (!await ownsLiveClaim(claim, timestamp)) return toPublic(await getById(claim.id));
      const completed = new Set((await database.prepare(`SELECT step_key FROM account_deletion_steps WHERE request_id=? AND status='completed'`)
        .all(claim.id) as Array<{ step_key: typeof DELETION_STEPS[number] }>).map((row) => row.step_key));
      for (const stepKey of DELETION_STEPS) {
        if (completed.has(stepKey)) continue;
        const current = new Date();
        if (!await database.transaction(async () => {
          const update = await database.prepare(`UPDATE account_deletion_requests SET lease_expires_at=?,updated_at=?
            WHERE id=? AND status='processing' AND lease_token=? AND lease_expires_at>?`)
            .run(new Date(current.getTime() + DELETION_LEASE_MS).toISOString(), current.toISOString(), claim.id, claim.leaseToken, current.toISOString());
          if (update.changes !== 1) return false;
          await database.prepare(`UPDATE account_deletion_steps SET status='running',attempt_count=attempt_count+1,started_at=?,updated_at=?,error_code=NULL
            WHERE request_id=? AND step_key=? AND status!='completed'`).run(current.toISOString(), current.toISOString(), claim.id, stepKey);
          await addAudit(database, { requestId: claim.id, ownerHash: claim.ownerHash, actorType: 'worker', eventType: 'step_started', metadata: { step: stepKey }, now: current.toISOString() });
          return true;
        })()) return toPublic(await getById(claim.id));

        try {
          const success = await executeStep(claim, stepKey, storage, current);
          if (!success) {
            await database.transaction(async () => {
              await database.prepare(`UPDATE account_deletion_requests SET status='approved',available_at=?,attempt_count=GREATEST(attempt_count-1,0),
                lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND status='processing' AND lease_token=?`)
                .run(new Date(current.getTime() + QUIESCE_RETRY_MS).toISOString(), current.toISOString(), claim.id, claim.leaseToken);
            })();
            return toPublic(await getById(claim.id));
          }
          await database.transaction(async () => {
            const owner = await database.prepare(`SELECT id FROM account_deletion_requests WHERE id=? AND status='processing'
              AND lease_token=? AND lease_expires_at>? FOR UPDATE`).get(claim.id, claim.leaseToken, new Date().toISOString());
            if (!owner) throw new AccountDeletionError('claim_lost');
            await database.prepare(`UPDATE account_deletion_steps SET status='completed',completed_at=?,updated_at=?,error_code=NULL
              WHERE request_id=? AND step_key=?`).run(new Date().toISOString(), new Date().toISOString(), claim.id, stepKey);
            await addAudit(database, { requestId: claim.id, ownerHash: claim.ownerHash, actorType: 'worker', eventType: 'step_completed', metadata: { step: stepKey }, now: new Date().toISOString() });
          })();
          completed.add(stepKey);
        } catch (cause) {
          const code = cause instanceof AccountDeletionError ? cause.code : 'deletion_step_failed';
          await database.transaction(async () => {
            const changed = await database.prepare(`UPDATE account_deletion_requests SET status='partial_failed',lease_token=NULL,
              lease_expires_at=NULL,error_code=?,updated_at=? WHERE id=? AND status='processing' AND lease_token=?`)
              .run(code, new Date().toISOString(), claim.id, claim.leaseToken);
            if (changed.changes !== 1) return;
            await database.prepare(`UPDATE account_deletion_steps SET status='failed',error_code=?,updated_at=? WHERE request_id=? AND step_key=?`)
              .run(code, new Date().toISOString(), claim.id, stepKey);
            await addAudit(database, { requestId: claim.id, ownerHash: claim.ownerHash, actorType: 'worker', eventType: 'step_failed', metadata: { step: stepKey, code }, now: new Date().toISOString() });
          })();
          return toPublic(await getById(claim.id));
        }
      }
      await database.transaction(async () => {
        const changed = await database.prepare(`UPDATE account_deletion_requests SET status='completed',completed_at=?,lease_token=NULL,
          lease_expires_at=NULL,error_code=NULL,updated_at=? WHERE id=? AND status='processing' AND lease_token=?`)
          .run(new Date().toISOString(), new Date().toISOString(), claim.id, claim.leaseToken);
        if (changed.changes !== 1) throw new AccountDeletionError('claim_lost');
        await addAudit(database, { requestId: claim.id, ownerHash: claim.ownerHash, actorType: 'worker', eventType: 'completed', now: new Date().toISOString() });
      })();
      return toPublic(await getById(claim.id));
    },
  };
}
