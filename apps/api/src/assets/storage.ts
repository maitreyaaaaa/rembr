import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
export interface StoredAsset { id: string; key: string; mime: ImageMime; bytes: number; sha256: string }
export interface AssetStorage {
  initialize(): Promise<void>;
  write(data: Buffer, id?: string, signal?: AbortSignal): Promise<StoredAsset>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  removeTemporaryAndUnknown(validKeys: Set<string>): Promise<void>;
}

export function detectImageMime(data: Buffer): ImageMime | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

export function imageExtensionMatches(filename: string, mime: ImageMime): boolean {
  const extension = filename.toLowerCase().split('.').at(-1);
  const allowed: Record<ImageMime, string[]> = {
    'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/gif': ['gif'],
  };
  return Boolean(extension && allowed[mime].includes(extension));
}

export class LocalAssetStorage implements AssetStorage {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }

  async initialize(): Promise<void> { await mkdir(this.root, { recursive: true }); }

  async write(data: Buffer, id = randomUUID()): Promise<StoredAsset> {
    const mime = detectImageMime(data);
    if (!mime) throw new Error('unsupported_asset_type');
    const key = `${id}.asset`;
    const temporary = join(this.root, `${id}.tmp`);
    const finalPath = join(this.root, key);
    await this.initialize();
    try {
      await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
      await rename(temporary, finalPath);
    } catch (cause) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw cause;
    }
    return { id, key, mime, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  }

  async read(key: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}\.asset$/.test(key)) throw new Error('invalid_asset_key');
    return readFile(join(this.root, key));
  }

  async remove(key: string): Promise<void> {
    if (!/^[0-9a-f-]{36}\.asset$/.test(key)) throw new Error('invalid_asset_key');
    await rm(join(this.root, key), { force: true });
  }

  async removeTemporaryAndUnknown(validKeys: Set<string>): Promise<void> {
    await this.initialize();
    for (const entry of await readdir(this.root)) {
      if (entry.endsWith('.tmp') || (!validKeys.has(entry) && /^[0-9a-f-]{36}\.asset$/.test(entry))) {
        await rm(join(this.root, entry), { force: true });
      }
    }
  }
}
