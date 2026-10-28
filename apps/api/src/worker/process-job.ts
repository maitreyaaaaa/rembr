import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { config } from '../config.js';
import { detectSupportedMediaMime, LocalMediaStorage } from '../media/storage.js';
import { CaptureError, fetchPublicMedia, fetchPublicPage } from '../items/safe-fetch.js';
import { extractPage } from '../items/extract.js';

interface ClaimedJob {
  id: string; item_id: string; owner_id: string; import_id: string | null; correlation_id: string;
  original_url: string; lease_token: string; attempts: number; max_attempts: number; generation: number;
}

export interface FetchResult { finalUrl: string; contentType: string; html: string }
export type PageFetcher = (url: string) => Promise<FetchResult>;
export type MediaFetcher = (url: string) => Promise<{ finalUrl: string; mime: string; bytes: Buffer }>;
export interface MediaProcessor { fetchMedia: MediaFetcher; storage: LocalMediaStorage }

const TRANSIENT_FAILURES = new Set(['dns_failed', 'page_timeout', 'page_unavailable', 'fetch_failed']);
const LEASE_MS = 30_000;

export function retryDelayMs(attempt: number, random = Math.random()): number {
  const base = Math.min(60_000, 1_000 * (2 ** Math.max(0, attempt - 1)));
  return Math.floor(base * (0.75 + Math.max(0, Math.min(random, 1)) * 0.5));
}

async function finishImportIfIdle(database: DatabaseHandle, ownerId: string, importId: string | null, now: string) {
  if (!importId) return;
  const active = await database.prepare(`SELECT count(*) AS count FROM processing_jobs WHERE owner_id=? AND import_id=?
    AND status IN ('queued','processing','retry_wait','cancel_requested')`).get(ownerId, importId) as { count: number };
  if (Number(active.count) > 0) return;
  const failures = await database.prepare(`SELECT count(*) AS count FROM processing_jobs WHERE owner_id=? AND import_id=?
    AND status IN ('partial','failed','cancelled')`).get(ownerId, importId) as { count: number };
  const parseFailures = await database.prepare('SELECT failed_count FROM imports WHERE owner_id=? AND id=?')
    .get(ownerId, importId) as { failed_count: number } | undefined;
  await database.prepare(`UPDATE imports SET status=?,updated_at=?,completed_at=? WHERE owner_id=? AND id=?`)
    .run(Number(failures.count) > 0 || Number(parseFailures?.failed_count ?? 0) > 0 ? 'partial' : 'completed', now, now, ownerId, importId);
}

export async function claimNextJob(database: DatabaseHandle, now = new Date()): Promise<ClaimedJob | undefined> {
  const timestamp = now.toISOString();
  const transaction = database.transaction(async () => {
    await database.prepare(`UPDATE job_attempts SET status='failed',error_code='worker_interrupted',finished_at=?
      WHERE status='running' AND EXISTS (SELECT 1 FROM processing_jobs j WHERE j.id=job_attempts.job_id
        AND j.owner_id=job_attempts.owner_id AND j.generation=job_attempts.generation
        AND j.attempts=job_attempts.attempt_number AND j.status='processing' AND j.lease_expires_at<=?)`)
      .run(timestamp, timestamp);
    await database.prepare(`UPDATE processing_jobs SET status='failed',error_code='worker_interrupted',lease_token=NULL,
      lease_expires_at=NULL,updated_at=? WHERE status='processing' AND lease_expires_at<=? AND attempts>=max_attempts`)
      .run(timestamp, timestamp);
    await database.prepare(`UPDATE saved_items SET status='failed',error_code='worker_interrupted',updated_at=?
      WHERE status='processing' AND id IN (SELECT item_id FROM processing_jobs WHERE status='failed' AND error_code='worker_interrupted')`)
      .run(timestamp);
    const exhaustedImports = await database.prepare(`SELECT DISTINCT owner_id,import_id FROM processing_jobs
      WHERE status='failed' AND error_code='worker_interrupted' AND import_id IS NOT NULL AND updated_at=?`)
      .all(timestamp) as Array<{ owner_id: string; import_id: string }>;
    for (const row of exhaustedImports) await finishImportIfIdle(database, row.owner_id, row.import_id, timestamp);

    const abandonedCancels = await database.prepare(`SELECT id,owner_id,item_id,generation,attempts,import_id FROM processing_jobs
      WHERE status='cancel_requested' AND lease_expires_at<=?`).all(timestamp) as Array<{ id: string; owner_id: string; item_id: string; generation: number; attempts: number; import_id: string | null }>;
    for (const job of abandonedCancels) {
      await database.prepare(`UPDATE processing_jobs SET status='cancelled',error_code='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_id=?`)
        .run(timestamp, job.id, job.owner_id);
      await database.prepare(`UPDATE saved_items SET status='failed',error_code='cancelled',updated_at=? WHERE id=? AND owner_id=?`)
        .run(timestamp, job.item_id, job.owner_id);
      await database.prepare(`UPDATE job_attempts SET status='cancelled',error_code='cancelled',finished_at=? WHERE owner_id=? AND job_id=? AND generation=? AND attempt_number=? AND status='running'`)
        .run(timestamp, job.owner_id, job.id, job.generation, job.attempts);
      await finishImportIfIdle(database, job.owner_id, job.import_id, timestamp);
    }

    const job = await database.prepare(`SELECT processing_jobs.id,processing_jobs.item_id,processing_jobs.owner_id,processing_jobs.import_id,
        processing_jobs.correlation_id,processing_jobs.generation,saved_items.original_url,processing_jobs.attempts,processing_jobs.max_attempts
      FROM processing_jobs JOIN saved_items ON saved_items.id=processing_jobs.item_id AND saved_items.owner_id=processing_jobs.owner_id
      WHERE processing_jobs.attempts<processing_jobs.max_attempts AND NOT EXISTS (
        SELECT 1 FROM job_pause_states p WHERE p.owner_id=processing_jobs.owner_id AND p.job_id=processing_jobs.id
      ) AND ((processing_jobs.status IN ('queued','retry_wait') AND processing_jobs.available_at<=?)
        OR (processing_jobs.status='processing' AND processing_jobs.lease_expires_at<=?))
      ORDER BY processing_jobs.created_at ASC LIMIT 1`).get(timestamp, timestamp) as Omit<ClaimedJob, 'lease_token'> | undefined;
    if (!job) return undefined;
    const leaseToken = randomUUID(); const attempts = job.attempts + 1;
    const changed = await database.prepare(`UPDATE processing_jobs SET status='processing',attempts=?,lease_token=?,lease_expires_at=?,heartbeat_at=?,updated_at=?
      WHERE id=? AND owner_id=? AND item_id=?`)
      .run(attempts, leaseToken, new Date(now.getTime() + LEASE_MS).toISOString(), timestamp, timestamp, job.id, job.owner_id, job.item_id);
    if (changed.changes !== 1) return undefined;
    await database.prepare(`INSERT INTO job_attempts (id,owner_id,job_id,generation,attempt_number,status,correlation_id,started_at)
      VALUES (?,?,?,?,?,'running',?,?)`).run(randomUUID(), job.owner_id, job.id, job.generation, attempts, job.correlation_id, timestamp);
    await database.prepare(`UPDATE saved_items SET status='processing',error_code=NULL,updated_at=? WHERE id=? AND owner_id=?`)
      .run(timestamp, job.item_id, job.owner_id);
    if (job.import_id) await database.prepare(`UPDATE imports SET status='processing',updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','partial')`)
      .run(timestamp, job.import_id, job.owner_id);
    return { ...job, attempts, lease_token: leaseToken };
  });
  return await transaction();
}

function failureCode(error: unknown): string { return error instanceof CaptureError ? error.code : 'fetch_failed'; }

async function cancelOwnedAttempt(database: DatabaseHandle, job: ClaimedJob, now: string) {
  const result = await database.prepare(`UPDATE processing_jobs SET status='cancelled',error_code='cancelled',lease_token=NULL,
      lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_id=? AND item_id=? AND status='cancel_requested' AND lease_token=?`)
    .run(now, job.id, job.owner_id, job.item_id, job.lease_token);
  if (result.changes !== 1) return false;
  await database.prepare(`UPDATE saved_items SET status='failed',error_code='cancelled',updated_at=? WHERE id=? AND owner_id=?`)
    .run(now, job.item_id, job.owner_id);
  await database.prepare(`UPDATE job_attempts SET status='cancelled',error_code='cancelled',finished_at=?
    WHERE owner_id=? AND job_id=? AND generation=? AND attempt_number=? AND status='running'`)
    .run(now, job.owner_id, job.id, job.generation, job.attempts);
  finishImportIfIdle(database, job.owner_id, job.import_id, now);
  return true;
}

export async function cleanupInactiveMedia(database: DatabaseHandle, storage: LocalMediaStorage): Promise<void> {
  const queued = await database.prepare('SELECT storage_key FROM media_cleanup_queue').all() as Array<{ storage_key: string }>;
  for (const row of queued) {
    try {
      await storage.remove(row.storage_key);
      await database.prepare('DELETE FROM media_cleanup_queue WHERE storage_key=?').run(row.storage_key);
    } catch {
      await database.prepare('UPDATE media_cleanup_queue SET attempt_count=attempt_count+1,last_error=?,updated_at=? WHERE storage_key=?')
        .run('storage_unavailable', new Date().toISOString(), row.storage_key);
    }
  }
  const rows = await database.prepare(`SELECT id,storage_key FROM media_artifacts WHERE active=0`).all() as Array<{ id: string; storage_key: string | null }>;
  for (const row of rows) {
    try {
      if (row.storage_key) await storage.remove(row.storage_key);
      await database.prepare('DELETE FROM media_artifacts WHERE id=? AND active=0').run(row.id);
    } catch { /* Keep the inactive row so the next worker start can retry its private-file cleanup. */ }
  }
  const keys = new Set([
    ...(await database.prepare('SELECT storage_key FROM media_artifacts WHERE storage_key IS NOT NULL').all() as Array<{ storage_key: string }>).map((row) => row.storage_key),
    ...(await database.prepare('SELECT storage_key FROM media_cleanup_queue').all() as Array<{ storage_key: string }>).map((row) => row.storage_key),
  ]);
  await storage.removeUnknown(keys);
}

export async function processNextJob(database: DatabaseHandle, fetchPage: PageFetcher = fetchPublicPage,
  mediaProcessor: MediaProcessor = { fetchMedia: fetchPublicMedia, storage: new LocalMediaStorage(config.mediaDirectory) }): Promise<string | null> {
  const job = await claimNextJob(database);
  if (!job) return null;
  try {
    const page = await fetchPage(job.original_url);
    const extracted = extractPage(page.html, page.finalUrl);
    const mediaResults: Array<{ sourceUrl: string; storageKey: string | null; mime: string | null; byteSize: number; sha256: string | null; status: 'ready' | 'failed'; errorCode: string | null }> = [];
    for (const sourceUrl of extracted.mediaUrls.slice(0, 3)) {
      try {
        const downloaded = await mediaProcessor.fetchMedia(sourceUrl);
        const detectedMime = detectSupportedMediaMime(downloaded.bytes, downloaded.mime);
        if (!detectedMime || detectedMime !== downloaded.mime) throw new CaptureError('media_signature_mismatch', 'The media type did not match its file contents.');
        const stored = await mediaProcessor.storage.write(downloaded.bytes, detectedMime);
        mediaResults.push({ sourceUrl, storageKey: stored.key, mime: stored.mime, byteSize: downloaded.bytes.length, sha256: stored.sha256, status: 'ready', errorCode: null });
      } catch (cause) {
        mediaResults.push({ sourceUrl, storageKey: null, mime: null, byteSize: 0, sha256: null, status: 'failed', errorCode: cause instanceof CaptureError ? cause.code : 'media_store_failed' });
      }
    }
    const mediaFailed = mediaResults.some((result) => result.status === 'failed');
    const now = new Date().toISOString();
    const finish = database.transaction(async () => {
      const active = await database.prepare(`SELECT status FROM processing_jobs WHERE id=? AND owner_id=? AND item_id=? AND lease_token=?
        AND status IN ('processing','cancel_requested')`).get(job.id, job.owner_id, job.item_id, job.lease_token) as { status: string } | undefined;
      const item = await database.prepare('SELECT id FROM saved_items WHERE id=? AND owner_id=?').get(job.item_id, job.owner_id);
      if (!active || !item) return false;
      if (active.status === 'cancel_requested') return cancelOwnedAttempt(database, job, now);
      await database.prepare(`INSERT INTO extracted_artifacts (id,owner_id,item_id,title,description,text_content,fetched_at,created_at)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET title=excluded.title,description=excluded.description,
        text_content=excluded.text_content,fetched_at=excluded.fetched_at`)
        .run(randomUUID(), job.owner_id, job.item_id, extracted.title, extracted.description, extracted.text, now, now);
      await database.prepare(`UPDATE saved_items SET title=?,description=?,status='ready',error_code=NULL,updated_at=? WHERE id=? AND owner_id=?`)
        .run(extracted.title, extracted.description, now, job.item_id, job.owner_id);
      if (!mediaFailed) await database.prepare('UPDATE media_artifacts SET active=0 WHERE owner_id=? AND item_id=? AND active=1').run(job.owner_id, job.item_id);
      const insertMedia = database.prepare(`INSERT INTO media_artifacts
        (id,owner_id,item_id,generation,source_url,storage_key,detected_mime,byte_size,sha256,status,error_code,active,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const media of mediaResults) await insertMedia.run(randomUUID(), job.owner_id, job.item_id, job.generation, media.sourceUrl, media.storageKey,
        media.mime, media.byteSize, media.sha256, media.status, media.errorCode, media.status === 'failed' || !mediaFailed ? 1 : 0, now);
      const finalStatus = mediaFailed ? 'partial' : 'completed';
      await database.prepare(`UPDATE processing_jobs SET status=?,lease_token=NULL,lease_expires_at=NULL,heartbeat_at=?,error_code=?,updated_at=?
        WHERE id=? AND owner_id=? AND lease_token=? AND status='processing'`).run(finalStatus, now, mediaFailed ? 'media_partial' : null, now, job.id, job.owner_id, job.lease_token);
      await database.prepare(`UPDATE job_attempts SET status=?,error_code=?,finished_at=? WHERE owner_id=? AND job_id=? AND generation=? AND attempt_number=? AND status='running'`)
        .run(finalStatus, mediaFailed ? 'media_partial' : null, now, job.owner_id, job.id, job.generation, job.attempts);
      await finishImportIfIdle(database, job.owner_id, job.import_id, now);
      return true;
    });
    const committed = await finish();
    await cleanupInactiveMedia(database, mediaProcessor.storage);
    return committed ? job.id : null;
  } catch (error) {
    const code = failureCode(error); const now = new Date().toISOString();
    const retry = TRANSIENT_FAILURES.has(code) && job.attempts < job.max_attempts;
    const availableAt = new Date(Date.now() + retryDelayMs(job.attempts)).toISOString();
    const fail = database.transaction(async () => {
      const state = await database.prepare(`SELECT status FROM processing_jobs WHERE id=? AND owner_id=? AND status IN ('processing','cancel_requested') AND lease_token=?`)
        .get(job.id, job.owner_id, job.lease_token) as { status: string } | undefined;
      if (!state) return;
      if (state.status === 'cancel_requested') { await cancelOwnedAttempt(database, job, now); return; }
      await database.prepare(`UPDATE processing_jobs SET status=?,available_at=?,lease_token=NULL,lease_expires_at=NULL,error_code=?,updated_at=?
        WHERE id=? AND owner_id=? AND lease_token=?`).run(retry ? 'retry_wait' : 'failed', retry ? availableAt : now, code, now, job.id, job.owner_id, job.lease_token);
      await database.prepare(`UPDATE saved_items SET status=?,error_code=?,updated_at=? WHERE id=? AND owner_id=?`)
        .run(retry ? 'queued' : 'failed', retry ? null : code, now, job.item_id, job.owner_id);
      await database.prepare(`UPDATE job_attempts SET status='failed',error_code=?,finished_at=?
        WHERE owner_id=? AND job_id=? AND generation=? AND attempt_number=? AND status='running'`)
        .run(code, now, job.owner_id, job.id, job.generation, job.attempts);
      finishImportIfIdle(database, job.owner_id, job.import_id, now);
    });
    await fail();
    return job.id;
  }
}
