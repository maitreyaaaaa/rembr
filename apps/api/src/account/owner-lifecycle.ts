import type { DatabaseHandle } from '../db/database.js';
import { randomUUID } from 'node:crypto';

export const OWNER_WORK_LEASE_TTL_MS = 15 * 60_000;
export const OWNER_WORK_LEASE_HEARTBEAT_MS = OWNER_WORK_LEASE_TTL_MS / 3;

export type OwnerWorkType = 'ai_analysis' | 'visual_search' | 'grounded_answer' | 'semantic_embedding' | 'asset_upload' | 'import_upload' | 'media_upload' | 'export_write';

export class OwnerLifecycleError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'OwnerLifecycleError'; }
}

/** Serializes owner data writes with an account freeze or deletion transaction. */
export async function lockActiveOwner(database: DatabaseHandle, ownerId: string): Promise<boolean> {
  const owner = await database.prepare(`SELECT id FROM users WHERE id=? AND account_status='active' FOR UPDATE`).get(ownerId);
  return Boolean(owner);
}

/** Blocks new external work after freeze and leaves an expiring drain record while a provider call is active. */
export async function withOwnerWorkLease<T>(database: DatabaseHandle, ownerId: string, workType: OwnerWorkType,
  operation: (signal: AbortSignal) => Promise<T>, now = new Date(), heartbeatIntervalMs = OWNER_WORK_LEASE_HEARTBEAT_MS): Promise<T> {
  if (!Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1 || heartbeatIntervalMs >= OWNER_WORK_LEASE_TTL_MS) {
    throw new TypeError('Owner work lease heartbeat interval is invalid.');
  }
  const id = randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + OWNER_WORK_LEASE_TTL_MS).toISOString();
  await database.transaction(async () => {
    if (!await lockActiveOwner(database, ownerId)) throw new OwnerLifecycleError('account_inactive');
    await database.prepare(`INSERT INTO account_owner_work_leases (id,owner_id,work_type,expires_at,created_at) VALUES (?,?,?,?,?)`)
      .run(id, ownerId, workType, expiresAt, createdAt);
  })();
  const abortController = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectLeaseLost!: (cause: unknown) => void;
  const leaseLost = new Promise<never>((_resolve, reject) => { rejectLeaseLost = reject; });
  const scheduleRenew = (delayMs: number) => {
    if (!stopped) timer = setTimeout(() => { void renew(); }, delayMs);
  };
  const renew = async () => {
    if (stopped) return;
    const heartbeatAt = new Date();
    const nextExpiry = new Date(heartbeatAt.getTime() + OWNER_WORK_LEASE_TTL_MS).toISOString();
    try {
      const renewed = await database.prepare(`UPDATE account_owner_work_leases SET expires_at=?
        WHERE id=? AND owner_id=? AND work_type=? AND expires_at>? RETURNING id`)
        .get(nextExpiry, id, ownerId, workType, heartbeatAt.toISOString());
      if (!renewed) {
        const cause = new OwnerLifecycleError('work_lease_lost');
        stopped = true;
        abortController.abort(cause);
        rejectLeaseLost(cause);
        return;
      }
      scheduleRenew(heartbeatIntervalMs);
    } catch {
      if (stopped) return;
      // A database error is not proof that the lease was lost. Retry promptly;
      // object-store and provider requests are independently bounded below the TTL.
      scheduleRenew(Math.min(1_000, heartbeatIntervalMs));
    }
  };
  scheduleRenew(heartbeatIntervalMs);
  const work = Promise.resolve().then(() => operation(abortController.signal));
  try {
    return await Promise.race([work, leaseLost]);
  } catch (cause) {
    if (abortController.signal.aborted) await work.catch(() => undefined);
    throw cause;
  } finally {
    stopped = true;
    if (timer) clearTimeout(timer);
    // An expired record is safe to drain if the process dies before this cleanup runs.
    await database.prepare('DELETE FROM account_owner_work_leases WHERE id=? AND owner_id=?').run(id, ownerId).catch(() => undefined);
  }
}
