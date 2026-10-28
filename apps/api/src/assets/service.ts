import { createHash, randomUUID } from 'node:crypto';
import type { AssetKind } from './repository.js';
import { createAssetRepository } from './repository.js';
import type { DatabaseHandle } from '../db/database.js';
import { LocalAssetStorage } from './storage.js';

export function createAssetService(database: DatabaseHandle, storage: LocalAssetStorage) {
  const repository = createAssetRepository(database);
  return {
    async stage(ownerId: string, kind: AssetKind, bytes: Buffer, mime: string) {
      const id = randomUUID(); const key = `${id}.asset`; const now = new Date().toISOString();
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      repository.stage(id, ownerId, kind, key, mime, bytes.length, sha256, now);
      try {
        const saved = await storage.write(bytes, id);
        repository.markReady(id, new Date().toISOString());
        return { id, key: saved.key, mime: saved.mime, bytes: saved.bytes, sha256: saved.sha256 };
      } catch (cause) {
        try { await storage.remove(key); repository.removeMetadata(ownerId, id); }
        catch { /* startup recovery retains and clears staging metadata after a failed write */ }
        throw cause;
      }
    },
    async deleteAfterMarked(ownerId: string, id: string, key?: string): Promise<boolean> {
      const asset = key ? { storageKey: key } : repository.getForOwner(ownerId, id);
      if (!asset) return true;
      try {
        await storage.remove(asset.storageKey);
        repository.removeMetadata(ownerId, id);
        return true;
      } catch {
        return false;
      }
    },
    async read(ownerId: string, id: string) {
      const asset = repository.getForOwner(ownerId, id, 'ready');
      if (!asset) return null;
      try { return { bytes: await storage.read(asset.storageKey), mime: asset.mime }; }
      catch { return null; }
    },
  };
}
