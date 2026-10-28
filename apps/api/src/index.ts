import { createApp } from './app.js';
import { config } from './config.js';
import { createDatabase } from './db/database.js';
import { LocalAssetStorage } from './assets/storage.js';
import { recoverAssets } from './assets/recovery.js';

const database = createDatabase();
const assetStorage = new LocalAssetStorage(config.assetDirectory);
await recoverAssets(database, assetStorage);
const app = createApp(database, { assetStorage });
const server = app.listen(config.API_PORT, '127.0.0.1', () => {
  console.info('rembr_api_started', { port: config.API_PORT, environment: config.NODE_ENV });
});

function shutdown(signal: string) {
  console.info('rembr_api_shutdown', { signal });
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
