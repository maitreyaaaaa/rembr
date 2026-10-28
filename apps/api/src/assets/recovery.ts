import type { DatabaseHandle } from '../db/database.js';
import { LocalAssetStorage } from './storage.js';
import { createAssetRepository } from './repository.js';

const RECOVERY_GRACE_MS = 60 * 60 * 1000;

export async function recoverAssets(database: DatabaseHandle, storage: LocalAssetStorage, now = Date.now()): Promise<void> {
  const assets = createAssetRepository(database);
  await storage.initialize();
  const rows = assets.findStagedAndCleanupCandidates();
  for (const asset of rows) {
    const age = now - Date.parse(asset.createdAt);
    const references = assets.countReferences(asset.id);
    if (asset.state === 'deleting' || asset.state === 'staging' || (asset.state === 'ready' && references === 0 && age > RECOVERY_GRACE_MS)) {
      try {
        await storage.remove(asset.storageKey);
        assets.removeMetadata(asset.ownerId, asset.id);
      } catch {
        // Keep the durable metadata row so a later startup can retry cleanup.
      }
    }
  }
  const valid = new Set(assets.listKeys());
  await storage.removeTemporaryAndUnknown(valid);
}
