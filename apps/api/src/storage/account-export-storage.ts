import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { PrivateExportArtifactStorage } from '../account/data-export-service.js';
import type { SupabaseObjectStore } from './supabase-object-store.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^account-exports\/([a-f0-9]{64})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.zip$/i;
type ObjectStore = Pick<SupabaseObjectStore, 'initialize' | 'write' | 'read' | 'remove'>;

function ownerNamespace(ownerId: string): string {
  return createHash('sha256').update(ownerId).digest('hex');
}

function objectKey(ownerId: string, exportId: string, leaseToken: string): string {
  if (!ownerId || !UUID.test(exportId) || !UUID.test(leaseToken)) throw new Error('invalid_export_artifact_key');
  return `account-exports/${ownerNamespace(ownerId)}/${exportId}/${leaseToken}.zip`;
}

function checkedKey(ownerId: string, key: string): string {
  const match = KEY.exec(key);
  if (!match || match[1] !== ownerNamespace(ownerId)) throw new Error('export_artifact_owner_mismatch');
  return key;
}

export class LocalPrivateExportArtifactStorage implements PrivateExportArtifactStorage {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }

  async initialize(): Promise<void> { await mkdir(this.root, { recursive: true, mode: 0o700 }); }

  private path(ownerId: string, key: string): string {
    const safeKey = checkedKey(ownerId, key);
    const destination = resolve(this.root, ...safeKey.split('/'));
    const pathFromRoot = relative(this.root, destination);
    if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) throw new Error('invalid_export_artifact_key');
    return destination;
  }

  keyForAttempt(ownerId: string, exportId: string, leaseToken: string): string {
    return objectKey(ownerId, exportId, leaseToken);
  }

  async write(ownerId: string, key: string, bytes: Buffer): Promise<void> {
    const destination = this.path(ownerId, key);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = join(dirname(destination), `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
    } catch (cause) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw cause;
    }
  }

  async read(ownerId: string, key: string): Promise<Buffer> {
    return readFile(this.path(ownerId, key));
  }

  async remove(ownerId: string, key: string): Promise<void> {
    await rm(this.path(ownerId, key), { force: true });
  }
}

export class SupabasePrivateExportArtifactStorage implements PrivateExportArtifactStorage {
  constructor(private readonly objects: ObjectStore) {}

  initialize(): Promise<void> { return this.objects.initialize(); }

  keyForAttempt(ownerId: string, exportId: string, leaseToken: string): string {
    return objectKey(ownerId, exportId, leaseToken);
  }

  async write(ownerId: string, key: string, bytes: Buffer): Promise<void> {
    checkedKey(ownerId, key);
    await this.objects.write(key, bytes, 'application/zip');
  }

  async read(ownerId: string, key: string): Promise<Buffer> {
    return this.objects.read(checkedKey(ownerId, key));
  }

  async remove(ownerId: string, key: string): Promise<void> {
    await this.objects.remove(checkedKey(ownerId, key));
  }
}
