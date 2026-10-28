import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const KEY = /^[0-9a-f-]{36}$/i;
const CHUNK = /^[0-9a-f-]{36}\.([0-9]{1,3})\.part$/i;

export class LocalImportStorage {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }

  async initialize(): Promise<void> { await mkdir(this.root, { recursive: true, mode: 0o700 }); }

  async writeChunk(fileKey: string, index: number, bytes: Buffer): Promise<string> {
    if (!KEY.test(fileKey) || !Number.isInteger(index) || index < 0 || index > 99) throw new Error('invalid_import_storage_key');
    await this.initialize();
    const key = `${fileKey}.${index.toString().padStart(3, '0')}.part`;
    const temporary = join(this.root, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      const destination = join(this.root, key);
      try { await link(temporary, destination); }
      catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
        const existing = await readFile(destination);
        if (!existing.equals(bytes)) throw new Error('import_chunk_conflict');
      }
      await rm(temporary, { force: true });
    } catch (cause) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw cause;
    }
    return key;
  }

  async readChunk(key: string): Promise<Buffer> {
    if (!CHUNK.test(key)) throw new Error('invalid_import_storage_key');
    return readFile(join(this.root, key));
  }

  async assemble(fileKey: string, chunkCount: number, expectedBytes: number): Promise<void> {
    if (!KEY.test(fileKey) || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 100) throw new Error('invalid_import_storage_key');
    const chunks: Buffer[] = []; let total = 0;
    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = await this.readChunk(`${fileKey}.${index.toString().padStart(3, '0')}.part`);
      total += chunk.length;
      if (total > expectedBytes) throw new Error('import_byte_count_mismatch');
      chunks.push(chunk);
    }
    if (total !== expectedBytes) throw new Error('import_byte_count_mismatch');
    await this.initialize();
    const temporary = join(this.root, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, Buffer.concat(chunks, total), { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(this.root, `${fileKey}.upload`));
    } catch (cause) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw cause;
    }
  }

  async readFile(fileKey: string): Promise<Buffer> {
    if (!KEY.test(fileKey)) throw new Error('invalid_import_storage_key');
    return readFile(join(this.root, `${fileKey}.upload`));
  }

  async removeFile(fileKey: string): Promise<void> {
    if (!KEY.test(fileKey)) throw new Error('invalid_import_storage_key');
    await rm(join(this.root, `${fileKey}.upload`), { force: true });
    await Promise.all(Array.from({ length: 100 }, (_, index) => rm(join(this.root, `${fileKey}.${index.toString().padStart(3, '0')}.part`), { force: true })));
  }

  async removeUnknown(validKeys: { files: Set<string>; chunks: Set<string> }): Promise<void> {
    await this.initialize();
    for (const entry of await readdir(this.root)) {
      if (entry.endsWith('.tmp')) { await rm(join(this.root, entry), { force: true }); continue; }
      if (entry.endsWith('.upload')) {
        const key = entry.slice(0, -7);
        if (KEY.test(key) && !validKeys.files.has(key)) await rm(join(this.root, entry), { force: true });
      } else if (CHUNK.test(entry) && !validKeys.chunks.has(entry)) await rm(join(this.root, entry), { force: true });
    }
  }
}
