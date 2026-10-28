import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { CaptureError, fetchPublicPage } from '../items/safe-fetch.js';
import { extractPage } from '../items/extract.js';

interface ClaimedJob {
  id: string;
  item_id: string;
  owner_id: string;
  original_url: string;
  lease_token: string;
  attempts: number;
  max_attempts: number;
}

export interface FetchResult {
  finalUrl: string;
  contentType: string;
  html: string;
}

export type PageFetcher = (url: string) => Promise<FetchResult>;

const TRANSIENT_FAILURES = new Set(['dns_failed', 'page_timeout', 'page_unavailable', 'fetch_failed']);

export function claimNextJob(database: DatabaseHandle, now = new Date()): ClaimedJob | undefined {
  const timestamp = now.toISOString();
  const transaction = database.transaction(() => {
    database.prepare(`UPDATE processing_jobs SET status = 'failed', error_code = 'worker_interrupted',
      lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE status = 'processing' AND lease_expires_at <= ? AND attempts >= max_attempts`)
      .run(timestamp, timestamp);
    database.prepare(`UPDATE saved_items SET status = 'failed', error_code = 'worker_interrupted', updated_at = ?
      WHERE status = 'processing' AND id IN (
        SELECT item_id FROM processing_jobs WHERE status = 'failed' AND error_code = 'worker_interrupted'
      )`).run(timestamp);
    const job = database.prepare(`SELECT processing_jobs.id, processing_jobs.item_id,
        processing_jobs.owner_id, saved_items.original_url, processing_jobs.attempts,
        processing_jobs.max_attempts
      FROM processing_jobs JOIN saved_items
        ON saved_items.id = processing_jobs.item_id
        AND saved_items.owner_id = processing_jobs.owner_id
      WHERE processing_jobs.attempts < processing_jobs.max_attempts
        AND ((processing_jobs.status = 'queued' AND processing_jobs.available_at <= ?)
          OR (processing_jobs.status = 'processing' AND processing_jobs.lease_expires_at <= ?))
      ORDER BY processing_jobs.created_at ASC LIMIT 1`)
      .get(timestamp, timestamp) as Omit<ClaimedJob, 'lease_token'> | undefined;
    if (!job) return undefined;
    const leaseToken = randomUUID();
    const update = database.prepare(`UPDATE processing_jobs SET status = 'processing',
        attempts = attempts + 1, lease_token = ?, lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND owner_id = ? AND item_id = ?`)
      .run(leaseToken, new Date(now.getTime() + 30_000).toISOString(), timestamp, job.id, job.owner_id, job.item_id);
    if (update.changes !== 1) return undefined;
    database.prepare(`UPDATE saved_items SET status = 'processing', updated_at = ?
      WHERE id = ? AND owner_id = ?`).run(timestamp, job.item_id, job.owner_id);
    return { ...job, attempts: job.attempts + 1, lease_token: leaseToken };
  });
  return transaction.immediate();
}

function failureCode(error: unknown): string {
  if (error instanceof CaptureError) return error.code;
  return 'fetch_failed';
}

export async function processNextJob(database: DatabaseHandle, fetchPage: PageFetcher = fetchPublicPage): Promise<string | null> {
  const job = claimNextJob(database);
  if (!job) return null;
  try {
    const page = await fetchPage(job.original_url);
    const extracted = extractPage(page.html, page.finalUrl);
    const now = new Date().toISOString();
    const finish = database.transaction(() => {
      const active = database.prepare(`SELECT id FROM processing_jobs
        WHERE id = ? AND owner_id = ? AND item_id = ? AND status = 'processing' AND lease_token = ?`)
        .get(job.id, job.owner_id, job.item_id, job.lease_token);
      const item = database.prepare('SELECT id FROM saved_items WHERE id = ? AND owner_id = ?').get(job.item_id, job.owner_id);
      if (!active || !item) return false;
      database.prepare(`INSERT INTO extracted_artifacts
        (id, owner_id, item_id, title, description, text_content, fetched_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET title = excluded.title,
          description = excluded.description, text_content = excluded.text_content,
          fetched_at = excluded.fetched_at`)
        .run(randomUUID(), job.owner_id, job.item_id, extracted.title, extracted.description, extracted.text, now, now);
      database.prepare(`UPDATE saved_items SET title = ?, description = ?, status = 'ready',
        error_code = NULL, updated_at = ? WHERE id = ? AND owner_id = ?`)
        .run(extracted.title, extracted.description, now, job.item_id, job.owner_id);
      database.prepare(`UPDATE processing_jobs SET status = 'completed', lease_token = NULL,
        lease_expires_at = NULL, error_code = NULL, updated_at = ?
        WHERE id = ? AND owner_id = ? AND lease_token = ?`)
        .run(now, job.id, job.owner_id, job.lease_token);
      return true;
    });
    return finish.immediate() ? job.id : null;
  } catch (error) {
    const code = failureCode(error);
    const now = new Date().toISOString();
    const retry = TRANSIENT_FAILURES.has(code) && job.attempts < job.max_attempts;
    const availableAt = new Date(Date.now() + 2_000).toISOString();
    const fail = database.transaction(() => {
      const active = database.prepare(`SELECT id FROM processing_jobs
        WHERE id = ? AND owner_id = ? AND status = 'processing' AND lease_token = ?`)
        .get(job.id, job.owner_id, job.lease_token);
      if (!active) return;
      database.prepare(`UPDATE processing_jobs SET status = ?, available_at = ?,
        lease_token = NULL, lease_expires_at = NULL, error_code = ?, updated_at = ?
        WHERE id = ? AND owner_id = ? AND lease_token = ?`)
        .run(retry ? 'queued' : 'failed', retry ? availableAt : now, code, now, job.id, job.owner_id, job.lease_token);
      database.prepare(`UPDATE saved_items SET status = ?, error_code = ?, updated_at = ?
        WHERE id = ? AND owner_id = ?`)
        .run(retry ? 'queued' : 'failed', retry ? null : code, now, job.item_id, job.owner_id);
    });
    fail.immediate();
    return job.id;
  }
}
