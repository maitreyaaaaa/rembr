import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../config.js';
import { createDatabase } from '../db/database.js';
import { cleanupInactiveMedia, processNextJob } from './process-job.js';
import { fetchPublicMedia } from '../items/safe-fetch.js';
import { createImportService } from '../imports/service.js';
import type { MediaProcessor } from './process-job.js';
import { createStorageAdapters } from '../storage/adapters.js';

const database = await createDatabase();
const { imports: importStorage, media: mediaStorage } = createStorageAdapters();
await Promise.all([importStorage.initialize(), mediaStorage.initialize()]);
const imports = createImportService(database, importStorage);
const mediaProcessor: MediaProcessor = { fetchMedia: fetchPublicMedia, storage: mediaStorage };
let stopping = false;

async function run() {
  console.info('rembr_worker_started', { environment: config.NODE_ENV });
  await imports.retryCleanup();
  await cleanupInactiveMedia(database, mediaStorage);
  while (!stopping) {
    try {
      const importId = await imports.processNextImport();
      if (importId) console.info('rembr_import_processed', { importId });
      else {
        const jobId = await processNextJob(database, undefined, mediaProcessor);
        if (!jobId) await delay(1000);
        else console.info('rembr_job_processed', { jobId });
      }
    } catch (error) {
      console.error('rembr_worker_error', { errorType: error instanceof Error ? error.name : 'unknown' });
      await delay(1000);
    }
  }
  await database.close();
}

function stop(signal: string) {
  console.info('rembr_worker_shutdown', { signal });
  stopping = true;
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
void run();
