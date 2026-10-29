import { createHash, randomUUID } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import type { DatabaseHandle } from '../db/database.js';
import { createAssetService } from '../assets/service.js';
import { detectImageMime, imageExtensionMatches, type AssetStorage } from '../assets/storage.js';
import type { MediaStorage } from '../media/storage.js';
import { createLibraryRepository, type ItemListQuery } from './repository.js';

export class LibraryServiceError extends Error {
  constructor(public readonly code: 'invalid_cursor' | 'not_found' | 'invalid_note' | 'invalid_asset' | 'too_many_images', message: string) { super(message); }
}

function normalizeLinks(raw: string): string[] | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw || '[]'); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length > 20 || parsed.some((entry) => typeof entry !== 'string' || entry.length > 2048)) return null;
  const output: string[] = [];
  for (const entry of parsed as string[]) {
    try {
      const url = new URL(entry.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.local') || url.hostname.endsWith('.internal') || url.hostname.endsWith('.test')) return null;
      const host = url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname;
      if (ipaddr.isValid(host) && ['private','loopback','linkLocal','uniqueLocal','unspecified','multicast','carrierGradeNat','ipv4Mapped'].includes(ipaddr.parse(host).range())) return null;
      url.hash = '';
      const normalized = url.toString();
      if (!output.includes(normalized)) output.push(normalized);
    } catch { return null; }
  }
  return output;
}

interface Cursor { version: 1; owner: string; fingerprint: string; sort: string; key: string; id: string }
function cursorDecode(value: string, expected: Pick<Cursor, 'owner' | 'fingerprint' | 'sort'>): Cursor | null {
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (cursor.version !== 1 || cursor.owner !== expected.owner || cursor.fingerprint !== expected.fingerprint || cursor.sort !== expected.sort || typeof cursor.key !== 'string' || typeof cursor.id !== 'string') return null;
    return cursor;
  } catch { return null; }
}
function cursorEncode(cursor: Cursor): string { return Buffer.from(JSON.stringify(cursor)).toString('base64url'); }

export function createLibraryService(database: DatabaseHandle, storage: AssetStorage, mediaStorage?: MediaStorage) {
  const repository = createLibraryRepository(database);
  const assets = createAssetService(database, storage);
  return {
    async createPage(ownerId: string, originalUrl: string, canonicalUrl: string, title: string, correlationId?: string) {
      const existing = await repository.findByCanonical(ownerId,canonicalUrl);
      if (existing) return { item: existing, duplicate: true };
      const item = await repository.createPage(ownerId,originalUrl,canonicalUrl,title,correlationId);
      return { item, duplicate: false };
    },
    async list(ownerId: string, query: ItemListQuery, rawCursor?: string) {
      const fingerprint = createHash('sha256').update(JSON.stringify([query.search, query.type ?? null, query.status ?? null, query.tagId ?? null, query.collectionId ?? null])).digest('hex');
      const cursor = rawCursor ? cursorDecode(rawCursor, { owner: ownerId, fingerprint, sort: query.sort }) : null;
      if (rawCursor && !cursor) throw new LibraryServiceError('invalid_cursor', 'Restart the list after changing filters or sorting.');
      const page = await repository.list(ownerId, query, cursor ? { key: cursor.key, id: cursor.id } : undefined);
      page.items = await Promise.all(page.items);
      const last = page.rows.at(-1) as Record<string, unknown> | undefined;
      const nextCursor = page.hasMore && last ? cursorEncode({ version: 1, owner: ownerId, fingerprint, sort: query.sort,
        key: query.sort === 'relevance' ? JSON.stringify([Number(last.search_score ?? 0), String(last.created_at)])
          : query.sort.startsWith('title_') ? String(last.effective_title).toLowerCase() : String(last.created_at), id: String(last.id) }) : null;
      return { items: page.items, nextCursor, hasMore: page.hasMore };
    },
    get(ownerId: string, itemId: string) { return repository.get(ownerId, itemId); },
    update(ownerId: string, itemId: string, changes: { titleOverride?: string | null; descriptionOverride?: string | null }) {
      if (Object.keys(changes).length === 0) throw new LibraryServiceError('invalid_note', 'Provide an item field to update.');
      return repository.update(ownerId, itemId, changes);
    },
    async delete(ownerId: string, itemId: string) {
      const deleting = await repository.delete(ownerId, itemId);
      if (!deleting) return false;
      for (const asset of deleting.assets) await assets.deleteAfterMarked(ownerId, asset.id, asset.storageKey);
      for (const key of deleting.mediaKeys) {
        if (!mediaStorage) continue;
        try {
          await mediaStorage.remove(key);
          await database.prepare('DELETE FROM media_cleanup_queue WHERE storage_key=?').run(key);
        } catch {
          await database.prepare('UPDATE media_cleanup_queue SET attempt_count=attempt_count+1,last_error=?,updated_at=? WHERE storage_key=?')
            .run('storage_unavailable', new Date().toISOString(), key);
        }
      }
      return true;
    },
    async saveNote(input: { ownerId: string; itemId?: string; isCreate: boolean; body: string; title: string; linksRaw: string; files: Array<{ buffer: Buffer; mimetype: string; originalname: string }> }) {
      if (input.body.length > 20_000) throw new LibraryServiceError('invalid_note', 'Check the note text, up to 20 links, and up to 5 images.');
      const links = normalizeLinks(input.linksRaw);
      if (!links) throw new LibraryServiceError('invalid_note', 'Check the note text, up to 20 links, and up to 5 images.');
      const itemId = input.itemId ?? randomUUID();
      if (!input.isCreate && !await repository.isNote(input.ownerId, itemId)) throw new LibraryServiceError('not_found', 'Note not found.');
      const currentAssets = input.isCreate ? [] : await repository.noteAssets(input.ownerId, itemId);
      if (currentAssets.length + input.files.length > 5) throw new LibraryServiceError('too_many_images', 'A note can contain at most five images.');
      const staged: Array<{ id: string; key: string }> = [];
      try {
        for (const file of input.files) {
          const mime = detectImageMime(file.buffer);
          if (file.buffer.length < 1 || file.buffer.length > 5 * 1024 * 1024 || !mime || mime !== file.mimetype || !imageExtensionMatches(file.originalname, mime)) {
            throw new LibraryServiceError('invalid_asset', 'Use a valid PNG, JPEG, WebP, or GIF image under 5 MiB.');
          }
          const saved = await assets.stage(input.ownerId, 'note_image', file.buffer, mime);
          staged.push({ id: saved.id, key: saved.key });
        }
        return await repository.saveNote({ ownerId: input.ownerId, itemId, isCreate: input.isCreate, body: input.body,
          title: input.title.trim().slice(0, 240), links, assetIds: staged.map((asset) => asset.id), now: new Date().toISOString() });
      } catch (cause) {
        for (const asset of staged) await assets.deleteAfterMarked(input.ownerId, asset.id, asset.key);
        if (cause instanceof LibraryServiceError) throw cause;
        if (String(cause).includes('too_many_images')) throw new LibraryServiceError('too_many_images', 'A note can contain at most five images.');
        throw cause;
      }
    },
    async deleteNoteAsset(ownerId: string, itemId: string, assetId: string) {
      const asset = await repository.removeNoteAsset(ownerId, itemId, assetId);
      if (!asset) return false;
      await assets.deleteAfterMarked(ownerId, assetId, asset.storageKey);
      return true;
    },
    readAsset(ownerId: string, id: string) { return assets.read(ownerId, id); },
  };
}
