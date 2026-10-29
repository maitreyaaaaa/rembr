import { createApp } from './app.js';
import { config } from './config.js';
import { createDatabase } from './db/database.js';
import { createStorageAdapters } from './storage/adapters.js';
import { recoverAssets } from './assets/recovery.js';

const database = await createDatabase();
const { assets: assetStorage, imports: importStorage, media: mediaStorage, exports: exportStorage } = createStorageAdapters();
await Promise.all([assetStorage.initialize(), importStorage.initialize(), mediaStorage.initialize(), exportStorage.initialize()]);
await recoverAssets(database, assetStorage);
const app = createApp(database, { assetStorage, importStorage, mediaStorage, exportStorage });
const server = app.listen(config.API_PORT, '0.0.0.0', () => {
  console.info('rembr_api_started', { port: config.API_PORT, environment: config.NODE_ENV });
});

function shutdown(signal: string) {
  console.info('rembr_api_shutdown', { signal });
  server.close(() => {
    void database.close().then(() => {
    process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
