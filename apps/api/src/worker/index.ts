import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../config.js';
import { createDatabase } from '../db/database.js';
import { processNextJob } from './process-job.js';

const database = createDatabase();
let stopping = false;

async function run() {
  console.info('rembr_worker_started', { environment: config.NODE_ENV });
  while (!stopping) {
    try {
      const jobId = await processNextJob(database);
      if (!jobId) await delay(1000);
      else console.info('rembr_job_finished', { jobId });
    } catch (error) {
      console.error('rembr_worker_error', { errorType: error instanceof Error ? error.name : 'unknown' });
      await delay(1000);
    }
  }
  database.close();
}

function stop(signal: string) {
  console.info('rembr_worker_shutdown', { signal });
  stopping = true;
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
void run();
