import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../config.js';
import { createDatabase } from '../db/database.js';
import { cleanupInactiveMedia, processNextJob } from './process-job.js';
import { cleanupStalePrivateMediaTempDirectories, fetchPublicMedia } from '../items/safe-fetch.js';
import { createImportService } from '../imports/service.js';
import { createMetaModelClient } from '../ai/meta-client.js';
import { createLocalOcr, probeTesseract } from '../ai/local-ocr.js';
import { createLocalAsr, probeWhisper } from '../ai/local-asr.js';
import { createLocalVisualEmbedding, probeVisualEmbedding } from '../ai/local-visual-embedding.js';
import { processNextVisualEmbeddingJob } from '../ai/visual-embedding-worker.js';
import { processNextAiJob } from '../ai/worker.js';
import { resolveTemporaryAnalysisMedia } from '../ai/temporary-media.js';
import type { MediaProcessor } from './process-job.js';
import { createStorageAdapters } from '../storage/adapters.js';
import { createAccountDataExportService } from '../account/data-export-service.js';
import { createOwnerScopedPrivateFileSource } from '../account/private-file-source.js';
import { createAccountDeletionService } from '../account/deletion-service.js';
import { cleanupExpiredSessions } from '../auth/sessions.js';
import { cleanupExpiredAccountActivity } from '../account/retention-service.js';

const database = await createDatabase();
const { assets: assetStorage, imports: importStorage, media: mediaStorage, exports: exportStorage } = createStorageAdapters();
await Promise.all([assetStorage.initialize(), importStorage.initialize(), mediaStorage.initialize(), exportStorage.initialize()]);
const imports = createImportService(database, importStorage);
const dataExports = createAccountDataExportService(database, exportStorage, createOwnerScopedPrivateFileSource(database, { assets: assetStorage, imports: importStorage, media: mediaStorage }));
const accountDeletions = createAccountDeletionService(database);
const mediaProcessor: MediaProcessor = { fetchMedia: fetchPublicMedia, storage: mediaStorage };
const metaClient = createMetaModelClient({ apiKey: config.META_API_KEY });
const localOcr = config.LOCAL_OCR_ENABLED
  ? createLocalOcr({ executable: config.tesseractPath, timeoutMs: config.LOCAL_OCR_TIMEOUT_MS })
  : undefined;
const localAsr = config.LOCAL_ASR_ENABLED && config.whisperModelPath
  ? createLocalAsr({ executable: config.whisperPath, modelPath: config.whisperModelPath, timeoutMs: config.LOCAL_ASR_TIMEOUT_MS })
  : undefined;
const localVisualEmbedding = config.LOCAL_VISUAL_EMBEDDING_ENABLED
  ? createLocalVisualEmbedding({ executable: config.VISUAL_EMBEDDING_PATH, model: config.VISUAL_EMBEDDING_MODEL,
    timeoutMs: config.LOCAL_VISUAL_EMBEDDING_TIMEOUT_MS })
  : undefined;
const aiMediaResolver = async (job: { original_url: string }, signal?: AbortSignal) => {
  try { return await resolveTemporaryAnalysisMedia(job.original_url, { signal }); }
  catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    // Text-only analysis can still produce a clearly partial note when public media is unavailable.
    return { files: [], cleanup: async () => undefined };
  }
};
let stopping = false;

async function writeAiWorkerStatus(metaConfigured: boolean, localOcrConfigured: boolean, localAsrConfigured: boolean, localVisualConfigured: boolean) {
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO ai_worker_status (singleton,meta_api_configured,local_ocr_configured,local_asr_configured,local_visual_configured,last_heartbeat_at)
    VALUES (TRUE,?,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET
      meta_api_configured=excluded.meta_api_configured,local_ocr_configured=excluded.local_ocr_configured,
      local_asr_configured=excluded.local_asr_configured,
      local_visual_configured=excluded.local_visual_configured,
      last_heartbeat_at=excluded.last_heartbeat_at`)
    .run(metaConfigured, localOcrConfigured, localAsrConfigured, localVisualConfigured, now);
}

async function run() {
  console.info('rembr_worker_started', { environment: config.NODE_ENV });
  await imports.retryCleanup();
  await cleanupInactiveMedia(database, mediaStorage);
  await dataExports.cleanupExpiredArtifacts(100).catch(() => 0);
await cleanupExpiredSessions(database).catch(() => 0);
await cleanupExpiredAccountActivity(database).catch(() => undefined);
  await cleanupStalePrivateMediaTempDirectories();
  const localOcrConfigured = Boolean(localOcr && await probeTesseract(config.tesseractPath));
  const localAsrConfigured = Boolean(localAsr && await probeWhisper(config.whisperPath, config.whisperModelPath));
  const localVisualConfigured = Boolean(localVisualEmbedding && await probeVisualEmbedding(config.VISUAL_EMBEDDING_PATH));
  await writeAiWorkerStatus(Boolean(config.META_API_KEY), localOcrConfigured, localAsrConfigured, localVisualConfigured);
  let lastTempSweepAt = Date.now();
let lastExpiredSessionSweepAt = Date.now();
let lastExpiredActivitySweepAt = Date.now();
  const statusHeartbeat = setInterval(() => {
    void (async () => {
      await writeAiWorkerStatus(Boolean(config.META_API_KEY), localOcrConfigured, localAsrConfigured, localVisualConfigured).catch(() => undefined);
      if (Date.now() - lastTempSweepAt >= 15 * 60_000) {
        await cleanupStalePrivateMediaTempDirectories().catch(() => 0);
        await dataExports.cleanupExpiredArtifacts(100).catch(() => 0);
        lastTempSweepAt = Date.now();
      }
      if (Date.now() - lastExpiredSessionSweepAt >= 15 * 60_000) {
        await cleanupExpiredSessions(database).catch(() => 0);
        lastExpiredSessionSweepAt = Date.now();
      }
      if (Date.now() - lastExpiredActivitySweepAt >= 15 * 60_000) {
        await cleanupExpiredAccountActivity(database).catch(() => undefined);
        lastExpiredActivitySweepAt = Date.now();
      }
    })();
  }, 30_000);
  while (!stopping) {
    try {
      const deletionClaim = await accountDeletions.claimNext();
      if (deletionClaim) {
        const result = await accountDeletions.processClaim(deletionClaim, { assets: assetStorage, imports: importStorage, media: mediaStorage, exports: exportStorage });
        console.info('rembr_account_deletion_processed', { deletionId: deletionClaim.id, status: result?.status ?? 'unknown' });
      } else {
        const importId = await imports.processNextImport();
        if (importId) console.info('rembr_import_processed', { importId });
        else {
          const jobId = await processNextJob(database, undefined, mediaProcessor);
          if (jobId) console.info('rembr_job_processed', { jobId });
          else {
            const exportClaim = await dataExports.claimNext();
            if (exportClaim) {
              await dataExports.processClaim(exportClaim);
              console.info('rembr_data_export_processed', { exportId: exportClaim.id });
            } else {
              const aiJobId = await processNextAiJob(database, metaClient, aiMediaResolver,
                Boolean(config.META_API_KEY), new Date(), localOcrConfigured ? localOcr : undefined,
                localAsrConfigured ? localAsr : undefined);
              if (aiJobId) console.info('rembr_ai_job_processed', { jobId: aiJobId });
              else {
                const visualJobId = await processNextVisualEmbeddingJob(database, mediaStorage,
                  localVisualConfigured ? localVisualEmbedding : undefined, config.VISUAL_EMBEDDING_MODEL);
                if (visualJobId) console.info('rembr_visual_embedding_processed', { jobId: visualJobId });
                else await delay(1000);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('rembr_worker_error', { errorType: error instanceof Error ? error.name : 'unknown' });
      await delay(1000);
    }
  }
  clearInterval(statusHeartbeat);
  await writeAiWorkerStatus(false, false, false, false).catch(() => undefined);
  await database.close();
}

function stop(signal: string) {
  console.info('rembr_worker_shutdown', { signal });
  stopping = true;
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
void run();
