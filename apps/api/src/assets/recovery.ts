import type { DatabaseHandle } from '../db/database.js';
import type { AssetStorage } from './storage.js';
import { createAssetRepository } from './repository.js';

const RECOVERY_GRACE_MS = 60 * 60 * 1000;

export async function recoverAssets(database: DatabaseHandle, storage: AssetStorage, now = Date.now()): Promise<void> {
  const assets = createAssetRepository(database);
  await storage.initialize();
  const rows = await assets.findStagedAndCleanupCandidates();
  for (const asset of rows) {
    const age = now - Date.parse(asset.createdAt);
    const references = await assets.countReferences(asset.id);
    if (asset.state === 'deleting' || asset.state === 'staging' || (asset.state === 'ready' && Number(references) === 0 && age > RECOVERY_GRACE_MS)) {
      try {
        await storage.remove(asset.storageKey);
        await assets.removeMetadata(asset.ownerId, asset.id);
      } catch {
        // Keep the durable metadata row so a later startup can retry cleanup.
      }
    }
  }
  const valid = new Set(await assets.listKeys());
  await storage.removeTemporaryAndUnknown(valid);
}
