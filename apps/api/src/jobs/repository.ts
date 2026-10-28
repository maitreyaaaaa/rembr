import type { DatabaseHandle } from '../db/database.js';

export type JobActionError = 'not_found' | 'not_cancellable' | 'not_retryable' | 'not_reprocessable';

export function createJobRepository(database: DatabaseHandle) {
  function find(ownerId: string, itemId: string) {
    return database.prepare(`SELECT processing_jobs.*, job_pause_states.pause_cause
      FROM processing_jobs LEFT JOIN job_pause_states
        ON job_pause_states.owner_id=processing_jobs.owner_id AND job_pause_states.job_id=processing_jobs.id
      WHERE processing_jobs.owner_id=? AND processing_jobs.item_id=?`).get(ownerId, itemId) as Record<string, unknown> | undefined;
  }

  return {
    get(ownerId: string, itemId: string) {
      const job = find(ownerId, itemId); if (!job) return undefined;
      const attempts = database.prepare(`SELECT generation,attempt_number,status,error_code,started_at,finished_at
        FROM job_attempts WHERE owner_id=? AND job_id=? ORDER BY generation DESC,attempt_number DESC LIMIT 20`).all(ownerId, String(job.id));
      return { id: String(job.id), itemId: String(job.item_id), status: job.pause_cause ? 'paused' : String(job.status),
        pauseCause: job.pause_cause ? String(job.pause_cause) : null, attempts: Number(job.attempts), maxAttempts: Number(job.max_attempts),
        generation: Number(job.generation), availableAt: String(job.available_at), errorCode: job.error_code ? String(job.error_code) : null,
        updatedAt: String(job.updated_at), attemptHistory: attempts };
    },

    cancel(ownerId: string, itemId: string): { status: string } | JobActionError {
      const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        const job = find(ownerId, itemId); if (!job) return 'not_found' as const;
        const status = String(job.status);
        if (status === 'cancelled') return { status };
        if (!['queued', 'retry_wait', 'processing'].includes(status)) return 'not_cancellable' as const;
        if (status === 'processing') {
          database.prepare(`UPDATE processing_jobs SET status='cancel_requested',updated_at=? WHERE owner_id=? AND id=? AND lease_token=?`)
            .run(now, ownerId, String(job.id), String(job.lease_token));
          return { status: 'cancel_requested' };
        }
        database.prepare(`UPDATE processing_jobs SET status='cancelled',error_code='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=?
          WHERE owner_id=? AND id=?`).run(now, ownerId, String(job.id));
        database.prepare(`UPDATE saved_items SET status='failed',error_code='cancelled',updated_at=? WHERE owner_id=? AND id=?`).run(now, ownerId, itemId);
        database.prepare('DELETE FROM job_pause_states WHERE owner_id=? AND job_id=?').run(ownerId, String(job.id));
        return { status: 'cancelled' };
      });
      return transaction.immediate();
    },

    retry(ownerId: string, itemId: string): { status: string; generation: number } | JobActionError {
      const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        const job = find(ownerId, itemId); if (!job) return 'not_found' as const;
        const retryable = ['dns_failed', 'page_timeout', 'page_unavailable', 'fetch_failed', 'worker_interrupted', 'storage_unavailable'];
        if (String(job.status) !== 'failed' || !retryable.includes(String(job.error_code))) return 'not_retryable' as const;
        const generation = Number(job.generation) + 1;
        database.prepare(`UPDATE processing_jobs SET generation=?,status='queued',attempts=0,available_at=?,lease_token=NULL,
          lease_expires_at=NULL,heartbeat_at=NULL,error_code=NULL,updated_at=? WHERE owner_id=? AND id=?`)
          .run(generation, now, now, ownerId, String(job.id));
        database.prepare(`UPDATE saved_items SET status='queued',error_code=NULL,updated_at=? WHERE owner_id=? AND id=?`).run(now, ownerId, itemId);
        database.prepare('DELETE FROM job_pause_states WHERE owner_id=? AND job_id=?').run(ownerId, String(job.id));
        return { status: 'queued', generation };
      });
      return transaction.immediate();
    },

    reprocess(ownerId: string, itemId: string): { status: string; generation: number } | JobActionError {
      const now = new Date().toISOString();
      const transaction = database.transaction(() => {
        const job = find(ownerId, itemId); if (!job) return 'not_found' as const;
        if (!['completed', 'partial'].includes(String(job.status))) return 'not_reprocessable' as const;
        const generation = Number(job.generation) + 1;
        database.prepare(`UPDATE processing_jobs SET generation=?,status='queued',attempts=0,available_at=?,lease_token=NULL,
          lease_expires_at=NULL,heartbeat_at=NULL,error_code=NULL,updated_at=? WHERE owner_id=? AND id=?`)
          .run(generation, now, now, ownerId, String(job.id));
        database.prepare(`UPDATE saved_items SET status='queued',error_code=NULL,updated_at=? WHERE owner_id=? AND id=?`).run(now, ownerId, itemId);
        return { status: 'queued', generation };
      });
      return transaction.immediate();
    },
  };
}
