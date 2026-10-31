import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../config.js';
import { createDatabase } from '../db/database.js';
import { cleanupInactiveMedia, processNextJob } from './process-job.js';
import { cleanupStalePrivateMediaTempDirectories, fetchPublicMedia } from '../items/safe-fetch.js';
import { createImportService } from '../imports/service.js';
import { createMetaModelClient } from '../ai/meta-client.js';
import { processNextAiJob } from '../ai/worker.js';
import { resolveTemporaryAnalysisMedia } from '../ai/temporary-media.js';
import type { MediaProcessor } from './process-job.js';
import { createStorageAdapters } from '../storage/adapters.js';

const database = await createDatabase();
const { imports: importStorage, media: mediaStorage } = createStorageAdapters();
await Promise.all([importStorage.initialize(), mediaStorage.initialize()]);
const imports = createImportService(database, importStorage);
const mediaProcessor: MediaProcessor = { fetchMedia: fetchPublicMedia, storage: mediaStorage };
const metaClient = createMetaModelClient({ apiKey: config.META_API_KEY });
const aiMediaResolver = async (job: { original_url: string }) => {
  try { return await resolveTemporaryAnalysisMedia(job.original_url); }
  catch {
    // Text-only analysis can still produce a clearly partial note when public media is unavailable.
    return { files: [], cleanup: async () => undefined };
  }
};
let stopping = false;

async function writeAiWorkerStatus(configured: boolean) {
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO ai_worker_status (singleton,meta_api_configured,last_heartbeat_at)
    VALUES (TRUE,?,?) ON CONFLICT(singleton) DO UPDATE SET
      meta_api_configured=excluded.meta_api_configured,last_heartbeat_at=excluded.last_heartbeat_at`)
    .run(configured, now);
}

async function runAiWorker(workerNumber: number) {
  while (!stopping) {
    try {
      const jobId = await processNextAiJob(database, metaClient, aiMediaResolver, Boolean(config.META_API_KEY));
      if (!jobId) await delay(1000);
      else console.info('rembr_ai_job_processed', { jobId, workerNumber });
    } catch (error) {
      console.error('rembr_worker_error', { worker: 'ai', workerNumber, errorType: error instanceof Error ? error.name : 'unknown' });
      await delay(1000);
    }
  }
}

async function runApplicationJobs() {
  while (!stopping) {
    try {
      const importId = await imports.processNextImport();
      if (importId) console.info('rembr_import_processed', { importId });
      else {
        const jobId = await processNextJob(database, undefined, mediaProcessor);
        if (jobId) console.info('rembr_job_processed', { jobId });
        else await delay(1000);
      }
    } catch (error) {
      console.error('rembr_worker_error', { worker: 'application', errorType: error instanceof Error ? error.name : 'unknown' });
      await delay(1000);
    }
  }
}

async function run() {
  console.info('rembr_worker_started', { environment: config.NODE_ENV, aiConcurrency: config.AI_WORKER_CONCURRENCY });
  await imports.retryCleanup();
  await cleanupInactiveMedia(database, mediaStorage);
  await cleanupStalePrivateMediaTempDirectories();
  await writeAiWorkerStatus(Boolean(config.META_API_KEY));
  let lastTempSweepAt = Date.now();
  const statusHeartbeat = setInterval(() => {
    void (async () => {
      await writeAiWorkerStatus(Boolean(config.META_API_KEY)).catch(() => undefined);
      if (Date.now() - lastTempSweepAt >= 15 * 60_000) {
        await cleanupStalePrivateMediaTempDirectories().catch(() => 0);
        lastTempSweepAt = Date.now();
      }
    })();
  }, 30_000);
  const aiWorkers = Array.from({ length: config.AI_WORKER_CONCURRENCY }, (_, index) => runAiWorker(index + 1));
  await runApplicationJobs();
  await Promise.allSettled(aiWorkers);
  clearInterval(statusHeartbeat);
  await writeAiWorkerStatus(false).catch(() => undefined);
  await database.close();
}

function stop(signal: string) {
  console.info('rembr_worker_shutdown', { signal });
  stopping = true;
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
void run();
