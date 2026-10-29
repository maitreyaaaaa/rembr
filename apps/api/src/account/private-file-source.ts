import type { AssetStorage } from '../assets/storage.js';
import type { DatabaseHandle } from '../db/database.js';
import type { ImportStorage } from '../imports/storage.js';
import type { MediaStorage } from '../media/storage.js';
import type { OwnerScopedPrivateFileSource, PrivateExportFileReference } from './data-export-service.js';

type FileRow = { owner_id: string; key: string; file_name: string; content_type: string; byte_size: number; kind: 'asset'|'import'|'media' };

export function createOwnerScopedPrivateFileSource(database: DatabaseHandle, storage: {
  assets: Pick<AssetStorage, 'read'>; imports: Pick<ImportStorage, 'readFile'>; media: Pick<MediaStorage, 'read'>;
}): OwnerScopedPrivateFileSource {
  return {
    async listForOwner(ownerId, limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 501) throw new TypeError('Invalid private-file listing limit.');
      const assets = await database.prepare(`SELECT owner_id,storage_key AS key,kind,detected_mime AS content_type,byte_size,id
        FROM asset_objects WHERE owner_id=? AND state='ready' ORDER BY created_at,id LIMIT ?`).all(ownerId, limit) as Array<Record<string, unknown>>;
      const uploads = await database.prepare(`SELECT owner_id,storage_key AS key,original_name AS file_name,declared_mime AS content_type,expected_bytes AS byte_size,id
        FROM import_upload_files WHERE owner_id=? AND state IN ('staged','parsing','failed') AND received_bytes=expected_bytes
          AND chunks_received=chunk_count ORDER BY created_at,id LIMIT ?`).all(ownerId, limit) as Array<Record<string, unknown>>;
      const media = await database.prepare(`SELECT owner_id,storage_key AS key,detected_mime AS content_type,byte_size,id
        FROM media_artifacts WHERE owner_id=? AND active=1 AND status='ready' AND storage_key IS NOT NULL ORDER BY created_at,id LIMIT ?`).all(ownerId, limit) as Array<Record<string, unknown>>;
      const refs: Array<{ row: Record<string, unknown>; kind: FileRow['kind']; name: string }> = [
        ...assets.map((row) => ({ row, kind: 'asset' as const, name: `${String(row.id)}.${String(row.content_type).split('/')[1] ?? 'bin'}` })),
        ...uploads.map((row) => ({ row, kind: 'import' as const, name: String(row.file_name) })),
        ...media.map((row) => ({ row, kind: 'media' as const, name: `${String(row.id)}.${String(row.content_type).split('/')[1] ?? 'bin'}` })),
      ];
      return refs.slice(0, limit + 1).map(({ row, kind, name }) => ({
        ownerId, kind, key: `${kind}:${String(row.key)}:${String(row.id)}`, fileName: name,
        contentType: String(row.content_type ?? 'application/octet-stream'), byteSize: Number(row.byte_size),
      }));
    },
    async readForOwner(ownerId, reference: PrivateExportFileReference) {
      if (reference.ownerId !== ownerId) throw new Error('private_file_owner_mismatch');
      const [kind, key, id, extra] = reference.key.split(':');
      if (extra !== undefined || !key || !id || !['asset','import','media'].includes(kind ?? '')) throw new Error('invalid_private_file_reference');
      const sql = kind === 'asset'
        ? "SELECT storage_key FROM asset_objects WHERE owner_id=? AND id=? AND storage_key=? AND state='ready'"
        : kind === 'import'
          ? "SELECT storage_key FROM import_upload_files WHERE owner_id=? AND id=? AND storage_key=? AND state IN ('staged','parsing','failed') AND received_bytes=expected_bytes AND chunks_received=chunk_count"
          : "SELECT storage_key FROM media_artifacts WHERE owner_id=? AND id=? AND storage_key=? AND active=1 AND status='ready'";
      const row = await database.prepare(sql).get(ownerId, id, key) as { storage_key: string } | undefined;
      if (!row) throw new Error('private_file_not_owned_or_available');
      if (kind === 'asset') return storage.assets.read(row.storage_key);
      if (kind === 'import') return storage.imports.readFile(row.storage_key);
      return storage.media.read(row.storage_key);
    },
  };
}
