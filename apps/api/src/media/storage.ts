import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { detectImageMime, type ImageMime } from '../assets/storage.js';

const MEDIA_KEY = /^[0-9a-f-]{36}\.media$/i;

export class LocalMediaStorage {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  async initialize(): Promise<void> { await mkdir(this.root, { recursive: true, mode: 0o700 }); }
  async write(bytes: Buffer): Promise<{ key: string; mime: ImageMime; sha256: string }> {
    const mime = detectImageMime(bytes);
    if (!mime || bytes.length < 1 || bytes.length > 5 * 1024 * 1024) throw new Error('invalid_media_bytes');
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
