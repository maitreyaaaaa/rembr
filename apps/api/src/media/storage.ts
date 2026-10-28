import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { detectImageMime } from '../assets/storage.js';

const MEDIA_KEY = /^[0-9a-f-]{36}\.media$/i;
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export type SupportedMediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'audio/mpeg' | 'audio/mp4' | 'audio/ogg' | 'audio/wav' | 'audio/webm' | 'video/mp4' | 'video/webm' | 'video/ogg';

export function detectSupportedMediaMime(data: Buffer, declaredMime?: string): SupportedMediaMime | null {
  const imageMime = detectImageMime(data);
  if (imageMime) return imageMime;
  const mime = declaredMime?.toLowerCase();
  if ((mime === 'video/mp4' || mime === 'audio/mp4') && data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp') return mime;
  if ((mime === 'video/webm' || mime === 'audio/webm') && data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return mime;
  if (mime === 'audio/mpeg' && data.length >= 3 && (data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 0xff && (data[1]! & 0xe0) === 0xe0))) return mime;
  if (mime === 'audio/wav' && data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE') return mime;
  if ((mime === 'audio/ogg' || mime === 'video/ogg') && data.length >= 4 && data.toString('ascii', 0, 4) === 'OggS') return mime;
  return null;
}

export class LocalMediaStorage {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  async initialize(): Promise<void> { await mkdir(this.root, { recursive: true, mode: 0o700 }); }
  async write(bytes: Buffer, declaredMime?: string): Promise<{ key: string; mime: SupportedMediaMime; sha256: string }> {
    const mime = detectSupportedMediaMime(bytes, declaredMime);
    if (!mime || bytes.length < 1 || bytes.length > MAX_MEDIA_BYTES) throw new Error('invalid_media_bytes');
    const id = randomUUID(); const key = `${id}.media`; const temp = join(this.root, `${id}.tmp`);
    await this.initialize();
    try {
      await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
      await rename(temp, join(this.root, key));
    } catch (cause) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw cause;
    }
    return { key, mime, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  async read(key: string): Promise<Buffer> {
    if (!MEDIA_KEY.test(key)) throw new Error('invalid_media_key');
    return readFile(join(this.root, key));
  }
  async remove(key: string): Promise<void> {
    if (!MEDIA_KEY.test(key)) throw new Error('invalid_media_key');
    await rm(join(this.root, key), { force: true });
  }
  async removeUnknown(validKeys: Set<string>): Promise<void> {
    await this.initialize();
    for (const name of await readdir(this.root)) {
      const path = join(this.root, name);
      if (name.endsWith('.tmp')) {
        const info = await stat(path).catch(() => null);
        if (info && Date.now() - info.mtimeMs > 24 * 60 * 60_000) await rm(path, { force: true });
      } else if (MEDIA_KEY.test(name) && !validKeys.has(name)) await rm(path, { force: true });
    }
  }
}
