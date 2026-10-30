import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseHandle } from '../db/database.js';
import type { MediaStorage } from '../media/storage.js';
import { detectSupportedMediaMime } from '../media/storage.js';
import { lockActiveOwner, OwnerLifecycleError, withOwnerWorkLease } from '../account/owner-lifecycle.js';
import type { LocalVisualEmbedding, LocalVisualImage } from './local-visual-embedding.js';
import { LOCAL_VISUAL_DISCLOSURE_VERSION } from './preferences.js';

const MAX_IMAGES = 20;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const LEASE_MS = 5 * 60_000;
const RETRY_MS = (attempt: number) => Math.min(60_000, 2_000 * (2 ** Math.max(0, attempt - 1)));
const EXTENSION_BY_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

interface MediaRow { id: string; storage_key: string; detected_mime: string; byte_size: number; sha256: string }
interface VisualJob { id: string; owner_id: string; item_id: string; attempts: number; lease_token: string }
export type LocalVisualExtractor = (image: LocalVisualImage, signal?: AbortSignal) => Promise<LocalVisualEmbedding>;

function contentHash(rows: MediaRow[]): string {
  const hash = createHash('sha256');
  for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) hash.update(`${row.id}:${row.sha256}\n`);
  return hash.digest('hex');
}

function boundedMediaRows(rows: MediaRow[]): MediaRow[] {
  const result: MediaRow[] = [];
  let totalBytes = 0;
  for (const row of rows) {
    if (!/^[a-f0-9]{64}$/i.test(row.sha256 ?? '') || !Number.isSafeInteger(Number(row.byte_size))
      || row.byte_size < 1 || row.byte_size > 5 * 1024 * 1024 || totalBytes + row.byte_size > MAX_TOTAL_BYTES) continue;
    result.push(row);
    totalBytes += Number(row.byte_size);
  }
  return result;
}

export async function queueVisualEmbeddingForItem(database: DatabaseHandle, ownerId: string, itemId: string, now = new Date()): Promise<boolean> {
  return database.transaction(async () => {
    if (!await lockActiveOwner(database, ownerId)) return false;
    const consent = await database.prepare(`SELECT local_visual_enabled,local_visual_consent_version FROM ai_analysis_preferences WHERE owner_id=?`)
      .get(ownerId) as { local_visual_enabled: boolean | number; local_visual_consent_version: string | null } | undefined;
    if (!consent?.local_visual_enabled || consent.local_visual_consent_version !== LOCAL_VISUAL_DISCLOSURE_VERSION) return false;
    const rows = await database.prepare(`SELECT id FROM media_artifacts
      WHERE owner_id=? AND item_id=? AND active=1 AND status='ready' AND storage_key IS NOT NULL
        AND detected_mime IN ('image/jpeg','image/png','image/webp','image/gif') AND byte_size BETWEEN 1 AND ?
      ORDER BY id LIMIT ?`).all(ownerId, itemId, 5 * 1024 * 1024, MAX_IMAGES) as MediaRow[];
    if (!rows.length) return false;
    const nowText = now.toISOString();
    const result = await database.prepare(`INSERT INTO visual_embedding_jobs
        (id,owner_id,item_id,status,attempts,available_at,created_at,updated_at)
      VALUES (?,?,?,'queued',0,?,?,?)
      ON CONFLICT(owner_id,item_id) DO UPDATE SET status='queued',attempts=0,
        available_at=EXCLUDED.available_at,lease_token=NULL,lease_expires_at=NULL,error_code=NULL,completed_at=NULL,updated_at=EXCLUDED.updated_at
      WHERE visual_embedding_jobs.status<>'processing'`)
      .run(`${ownerId}:${itemId}`, ownerId, itemId, nowText, nowText, nowText);
    return result.changes > 0;
  })();
}

export async function queueCurrentVisualEmbeddings(database: DatabaseHandle, ownerId: string, now = new Date()): Promise<number> {
  const timestamp = now.toISOString();
  return database.transaction(async () => {
    if (!await lockActiveOwner(database, ownerId)) return 0;
    const result = await database.prepare(`INSERT INTO visual_embedding_jobs
      (id,owner_id,item_id,status,attempts,available_at,created_at,updated_at)
    SELECT owner_id || ':' || item_id, owner_id, item_id, 'queued', 0, ?, ?, ?
    FROM (
      SELECT DISTINCT media.owner_id,media.item_id FROM media_artifacts media
      JOIN ai_analysis_preferences preference ON preference.owner_id=media.owner_id
      JOIN users owner ON owner.id=media.owner_id
      WHERE media.owner_id=? AND owner.account_status='active' AND preference.local_visual_enabled=TRUE
        AND preference.local_visual_consent_version=? AND media.active=1 AND media.status='ready'
        AND media.storage_key IS NOT NULL AND media.detected_mime IN ('image/jpeg','image/png','image/webp','image/gif')
        AND media.byte_size BETWEEN 1 AND ? ORDER BY media.item_id
    ) candidates
    ON CONFLICT(owner_id,item_id) DO UPDATE SET status='queued',attempts=0,available_at=EXCLUDED.available_at,
      lease_token=NULL,lease_expires_at=NULL,error_code=NULL,completed_at=NULL,updated_at=EXCLUDED.updated_at
    WHERE visual_embedding_jobs.status<>'processing'`)
      .run(timestamp, timestamp, timestamp, ownerId, LOCAL_VISUAL_DISCLOSURE_VERSION, 5 * 1024 * 1024);
    return result.changes;
  })();
}

async function claimNext(database: DatabaseHandle, now: Date): Promise<VisualJob | undefined> {
  const timestamp = now.toISOString();
  return database.transaction(async () => {
    const row = await database.prepare(`SELECT job.id,job.owner_id,job.item_id,job.attempts
      FROM visual_embedding_jobs job JOIN users owner ON owner.id=job.owner_id
      JOIN ai_analysis_preferences preference ON preference.owner_id=job.owner_id
      WHERE owner.account_status='active' AND preference.local_visual_enabled=TRUE
        AND preference.local_visual_consent_version=? AND job.attempts<3
        AND ((job.status='queued' AND job.available_at<=?) OR (job.status='processing' AND job.lease_expires_at<=?))
      ORDER BY job.created_at,job.id LIMIT 1 FOR UPDATE OF owner SKIP LOCKED`)
      .get(LOCAL_VISUAL_DISCLOSURE_VERSION, timestamp, timestamp) as Omit<VisualJob, 'lease_token'> | undefined;
    if (!row) return undefined;
    const leaseToken = randomUUID();
    const changed = await database.prepare(`UPDATE visual_embedding_jobs SET status='processing',attempts=attempts+1,
      lease_token=?,lease_expires_at=?,error_code=NULL,updated_at=? WHERE id=? AND owner_id=?`)
      .run(leaseToken, new Date(now.getTime() + LEASE_MS).toISOString(), timestamp, row.id, row.owner_id);
    return changed.changes === 1 ? { ...row, attempts: Number(row.attempts) + 1, lease_token: leaseToken } : undefined;
  })();
}

function averageVectors(values: LocalVisualEmbedding[]): LocalVisualEmbedding | null {
  if (!values.length) return null;
  const groups = new Map<string, LocalVisualEmbedding[]>();
  for (const value of values) {
    const key = `${value.model}\0${value.embedding.length}`;
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  const selected = [...groups.values()].sort((a, b) => b.length - a.length || a[0]!.model.localeCompare(b[0]!.model))[0];
  if (!selected?.length) return null;
  const sum = selected[0]!.embedding.map((_, index) => selected.reduce((total, value) => total + value.embedding[index]!, 0) / selected.length);
  const norm = Math.sqrt(sum.reduce((total, value) => total + value * value, 0));
  return norm > 0 ? { model: selected[0]!.model, embedding: sum.map((value) => value / norm) } : null;
}

export async function processNextVisualEmbeddingJob(database: DatabaseHandle, storage: MediaStorage,
  extractor: LocalVisualExtractor | undefined, model: string, now = new Date()): Promise<string | null> {
  if (!extractor) return null;
  const job = await claimNext(database, now);
  if (!job) return null;
  const tempDirectory = await mkdtemp(join(tmpdir(), 'rembr-visual-'));
  try {
    const rows = await database.prepare(`SELECT id,storage_key,detected_mime,byte_size,sha256 FROM media_artifacts
      WHERE owner_id=? AND item_id=? AND active=1 AND status='ready' AND storage_key IS NOT NULL
        AND detected_mime IN ('image/jpeg','image/png','image/webp','image/gif')
      ORDER BY id LIMIT ?`).all(job.owner_id, job.item_id, MAX_IMAGES) as MediaRow[];
    if (!rows.length) throw new Error('visual_media_missing');
    const boundedRows = boundedMediaRows(rows);
    if (!boundedRows.length) throw new Error('visual_media_missing');
    const sourceHash = contentHash(boundedRows);
    const preference = await database.prepare(`SELECT local_visual_enabled,local_visual_consent_version FROM ai_analysis_preferences WHERE owner_id=?`)
      .get(job.owner_id) as { local_visual_enabled: boolean | number; local_visual_consent_version: string | null } | undefined;
    if (!preference?.local_visual_enabled || preference.local_visual_consent_version !== LOCAL_VISUAL_DISCLOSURE_VERSION) throw new Error('visual_consent_disabled');
    const existing = await database.prepare(`SELECT 1 FROM visual_item_embeddings WHERE owner_id=? AND item_id=? AND model=? AND content_hash=?`)
      .get(job.owner_id, job.item_id, model, sourceHash);
    if (existing) {
      const completedAt = new Date().toISOString();
      await database.prepare(`UPDATE visual_embedding_jobs SET status='completed',lease_token=NULL,lease_expires_at=NULL,
        error_code=NULL,completed_at=?,updated_at=? WHERE id=? AND owner_id=? AND lease_token=?`)
        .run(completedAt, completedAt, job.id, job.owner_id, job.lease_token);
      return job.id;
    }
    const vectors: LocalVisualEmbedding[] = [];
    for (const [index, row] of boundedRows.entries()) {
      const bytes = await storage.read(row.storage_key);
      if (bytes.length !== row.byte_size || createHash('sha256').update(bytes).digest('hex') !== row.sha256
        || detectSupportedMediaMime(bytes, row.detected_mime) !== row.detected_mime) throw new Error('visual_media_invalid');
      const path = join(tempDirectory, `image-${String(index).padStart(2, '0')}${EXTENSION_BY_MIME[row.detected_mime] ?? '.img'}`);
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
      const vector = await withOwnerWorkLease<LocalVisualEmbedding>(database, job.owner_id, 'visual_embedding',
        (signal) => extractor({ path, mime: row.detected_mime, byteSize: bytes.length }, signal), new Date(), 1_000);
      vectors.push(vector);
    }
    const result = averageVectors(vectors);
    if (!result) throw new Error('visual_embedding_empty');
    const writtenAt = new Date().toISOString();
    await database.transaction(async () => {
      if (!await lockActiveOwner(database, job.owner_id)) throw new OwnerLifecycleError('account_inactive');
      const current = await database.prepare(`SELECT local_visual_enabled,local_visual_consent_version FROM ai_analysis_preferences WHERE owner_id=? FOR UPDATE`)
        .get(job.owner_id) as { local_visual_enabled: boolean | number; local_visual_consent_version: string | null } | undefined;
      if (!current?.local_visual_enabled || current.local_visual_consent_version !== LOCAL_VISUAL_DISCLOSURE_VERSION) throw new Error('visual_consent_disabled');
      const active = await database.prepare(`SELECT 1 FROM visual_embedding_jobs WHERE id=? AND owner_id=? AND status='processing' AND lease_token=?`)
        .get(job.id, job.owner_id, job.lease_token);
      if (!active) throw new Error('visual_job_lease_lost');
      const currentRows = await database.prepare(`SELECT id,storage_key,detected_mime,byte_size,sha256 FROM media_artifacts
        WHERE owner_id=? AND item_id=? AND active=1 AND status='ready' AND storage_key IS NOT NULL
          AND detected_mime IN ('image/jpeg','image/png','image/webp','image/gif') AND byte_size BETWEEN 1 AND ?
        ORDER BY id LIMIT ?`).all(job.owner_id, job.item_id, 5 * 1024 * 1024, MAX_IMAGES) as MediaRow[];
      if (contentHash(boundedMediaRows(currentRows)) !== sourceHash) {
        throw new Error('visual_media_changed');
      }
      await database.prepare(`INSERT INTO visual_item_embeddings(owner_id,item_id,model,content_hash,embedding,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_id,item_id,model) DO UPDATE SET content_hash=EXCLUDED.content_hash,
          embedding=EXCLUDED.embedding,updated_at=EXCLUDED.updated_at`)
        .run(job.owner_id, job.item_id, result.model, sourceHash, result.embedding, writtenAt, writtenAt);
      await database.prepare(`UPDATE visual_embedding_jobs SET status='completed',lease_token=NULL,lease_expires_at=NULL,
        error_code=NULL,completed_at=?,updated_at=? WHERE id=? AND owner_id=? AND lease_token=?`)
        .run(writtenAt, writtenAt, job.id, job.owner_id, job.lease_token);
    })();
    return job.id;
  } catch (error) {
    const timestamp = new Date().toISOString();
    const cancelled = error instanceof OwnerLifecycleError || (error instanceof Error && (error.name === 'AbortError' || error.message === 'visual_consent_disabled'));
    await database.prepare(`UPDATE visual_embedding_jobs SET status=?,available_at=?,lease_token=NULL,lease_expires_at=NULL,
      error_code=?,updated_at=?,completed_at=CASE WHEN ? THEN ? ELSE NULL END
      WHERE id=? AND owner_id=? AND status='processing' AND lease_token=?`)
      .run(cancelled ? 'cancelled' : job.attempts >= 3 ? 'failed' : 'queued',
        cancelled ? timestamp : new Date(Date.now() + RETRY_MS(job.attempts)).toISOString(),
        cancelled ? 'consent_disabled' : error instanceof Error && error.message.startsWith('visual_media_') ? 'media_changed' : 'local_extractor_failed',
        timestamp, cancelled || job.attempts >= 3, timestamp, job.id, job.owner_id, job.lease_token).catch(() => undefined);
    return job.id;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
