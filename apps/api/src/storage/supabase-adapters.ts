import { createHash, randomUUID } from 'node:crypto';
import type { AssetStorage, ImageMime, StoredAsset } from '../assets/storage.js';
import { detectImageMime } from '../assets/storage.js';
import type { ImportStorage } from '../imports/storage.js';
import type { MediaStorage, SupportedMediaMime } from '../media/storage.js';
import { detectSupportedMediaMime } from '../media/storage.js';
import { SupabaseObjectStore } from './supabase-object-store.js';
import { SupabasePrivateExportArtifactStorage } from './account-export-storage.js';

const IMPORT_KEY = /^[0-9a-f-]{36}$/i;
const IMPORT_CHUNK = /^[0-9a-f-]{36}\.([0-9]{1,3})\.part$/i;
const ASSET_KEY = /^[0-9a-f-]{36}\.asset$/i;
const MEDIA_KEY = /^[0-9a-f-]{36}\.media$/i;
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export class SupabaseAssetStorage implements AssetStorage {
  constructor(private readonly objects: SupabaseObjectStore) {}

  initialize(): Promise<void> { return this.objects.initialize(); }

  async write(data: Buffer, id = randomUUID(), signal?: AbortSignal): Promise<StoredAsset> {
    const mime = detectImageMime(data);
    if (!mime) throw new Error('unsupported_asset_type');
    const key = `${id}.asset`;
    await this.objects.write(key, data, mime, signal);
    return { id, key, mime, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  }

  async read(key: string): Promise<Buffer> {
    if (!ASSET_KEY.test(key)) throw new Error('invalid_asset_key');
    return this.objects.read(key);
  }

  async remove(key: string): Promise<void> {
    if (!ASSET_KEY.test(key)) throw new Error('invalid_asset_key');
    await this.objects.remove(key);
  }

  async removeTemporaryAndUnknown(validKeys: Set<string>): Promise<void> {
    // A web deployment can overlap an asset upload that has not committed its DB row yet.
    // Recovery deletes DB-tracked incomplete assets; avoid a bucket-wide sweep here.
    void validKeys;
  }
}

export class SupabaseImportStorage implements ImportStorage {
  constructor(private readonly objects: SupabaseObjectStore) {}

  initialize(): Promise<void> { return this.objects.initialize(); }

  async writeChunk(fileKey: string, index: number, bytes: Buffer, signal?: AbortSignal): Promise<string> {
    if (!IMPORT_KEY.test(fileKey) || !Number.isInteger(index) || index < 0 || index > 99) throw new Error('invalid_import_storage_key');
    const key = `${fileKey}.${index.toString().padStart(3, '0')}.part`;
    await this.objects.write(key, bytes, 'application/octet-stream', signal);
    return key;
  }

  async readChunk(key: string): Promise<Buffer> {
    if (!IMPORT_CHUNK.test(key)) throw new Error('invalid_import_storage_key');
    return this.objects.read(key);
  }

  async removeChunk(fileKey: string, index: number): Promise<void> {
    if (!IMPORT_KEY.test(fileKey) || !Number.isInteger(index) || index < 0 || index > 99) throw new Error('invalid_import_storage_key');
    await this.objects.remove(`${fileKey}.${index.toString().padStart(3, '0')}.part`);
  }

  async assemble(fileKey: string, chunkCount: number, expectedBytes: number, signal?: AbortSignal): Promise<void> {
    if (!IMPORT_KEY.test(fileKey) || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 100) throw new Error('invalid_import_storage_key');
    const chunks: Buffer[] = [];
    let total = 0;
    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = await this.objects.read(`${fileKey}.${index.toString().padStart(3, '0')}.part`, signal);
      total += chunk.length;
      if (total > expectedBytes) throw new Error('import_byte_count_mismatch');
      chunks.push(chunk);
    }
    if (total !== expectedBytes) throw new Error('import_byte_count_mismatch');
    await this.objects.write(`${fileKey}.upload`, Buffer.concat(chunks, total), 'application/octet-stream', signal);
  }

  async readFile(fileKey: string): Promise<Buffer> {
    if (!IMPORT_KEY.test(fileKey)) throw new Error('invalid_import_storage_key');
    return this.objects.read(`${fileKey}.upload`);
  }

  async removeFile(fileKey: string): Promise<void> {
    if (!IMPORT_KEY.test(fileKey)) throw new Error('invalid_import_storage_key');
    await this.objects.removeMany([
      `${fileKey}.upload`,
      ...Array.from({ length: 100 }, (_, index) => `${fileKey}.${index.toString().padStart(3, '0')}.part`),
    ]);
  }

  async removeUnknown(validKeys: { files: Set<string>; chunks: Set<string> }): Promise<void> {
    // The worker can sweep while the web service is writing a chunk before its DB row is committed.
    // DB-tracked cleanup removes known objects; don't delete in-flight uploads during rolling deploys.
    void validKeys;
  }
}

export class SupabaseMediaStorage implements MediaStorage {
  constructor(private readonly objects: SupabaseObjectStore) {}

  initialize(): Promise<void> { return this.objects.initialize(); }

  async write(bytes: Buffer, declaredMime?: string, requestedKey?: string, signal?: AbortSignal): Promise<{ key: string; mime: SupportedMediaMime; sha256: string }> {
    const mime = detectSupportedMediaMime(bytes, declaredMime);
    if (!mime || bytes.length < 1 || bytes.length > MAX_MEDIA_BYTES) throw new Error('invalid_media_bytes');
    const key = requestedKey ?? `${randomUUID()}.media`;
    if (!MEDIA_KEY.test(key)) throw new Error('invalid_media_key');
    await this.objects.write(key, bytes, mime, signal);
    return { key, mime, sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  async read(key: string): Promise<Buffer> {
    if (!MEDIA_KEY.test(key)) throw new Error('invalid_media_key');
    return this.objects.read(key);
  }

  async remove(key: string): Promise<void> {
    if (!MEDIA_KEY.test(key)) throw new Error('invalid_media_key');
    await this.objects.remove(key);
  }

  async removeUnknown(validKeys: Set<string>): Promise<void> {
    // A worker can upload an object immediately before committing its database row.
    // Avoid sweeping that in-flight object during a rolling deploy; explicit cleanup
    // rows remove abandoned media safely.
    void validKeys;
  }
}

export function createSupabaseStorage(config: {
  supabaseUrl: string;
  serviceRoleKey: string;
  assetBucket: string;
  importBucket: string;
  mediaBucket: string;
  exportBucket: string;
}): { assets: AssetStorage; imports: ImportStorage; media: MediaStorage; exports: SupabasePrivateExportArtifactStorage } {
  return {
    assets: new SupabaseAssetStorage(new SupabaseObjectStore(config.supabaseUrl, config.serviceRoleKey, config.assetBucket)),
    imports: new SupabaseImportStorage(new SupabaseObjectStore(config.supabaseUrl, config.serviceRoleKey, config.importBucket)),
    media: new SupabaseMediaStorage(new SupabaseObjectStore(config.supabaseUrl, config.serviceRoleKey, config.mediaBucket)),
    exports: new SupabasePrivateExportArtifactStorage(new SupabaseObjectStore(config.supabaseUrl, config.serviceRoleKey, config.exportBucket)),
  };
}

export type { ImageMime };
