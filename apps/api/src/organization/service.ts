import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { createLibraryRepository, type ItemCursorKey } from '../library/repository.js';
import { createOrganizationRepository } from './repository.js';

export class OrganizationServiceError extends Error {
  constructor(public readonly code: 'tag_exists' | 'collection_exists' | 'not_found' | 'invalid_cursor', message: string) { super(message); }
}

interface Cursor { version: 1; owner: string; fingerprint: string; sort: 'created_desc'; key: string; id: string }
function encode(cursor: Cursor) { return Buffer.from(JSON.stringify(cursor)).toString('base64url'); }
function decode(raw: string, owner: string, fingerprint: string): ItemCursorKey | null {
  try {
    const cursor = JSON.parse(Buffer.from(raw,'base64url').toString('utf8')) as Cursor;
    if (cursor.version !== 1 || cursor.owner !== owner || cursor.fingerprint !== fingerprint || cursor.sort !== 'created_desc' || typeof cursor.key !== 'string' || typeof cursor.id !== 'string') return null;
    return { key: cursor.key, id: cursor.id };
  } catch { return null; }
}

export function createOrganizationService(database: DatabaseHandle) {
  const repository = createOrganizationRepository(database);
  const library = createLibraryRepository(database);
  return {
    listTags(ownerId: string) { return repository.listTags(ownerId); },
    createTag(ownerId: string, rawName: string) {
      const name = rawName.trim();
      try { return repository.createTag({ id: randomUUID(), ownerId, name, normalized: name.toLowerCase(), now: new Date().toISOString() }); }
      catch { throw new OrganizationServiceError('tag_exists', 'A tag with that name already exists.'); }
    },
    renameTag(ownerId: string, id: string, rawName: string) {
      const name = rawName.trim();
      try {
        if (!repository.renameTag({ ownerId, id, name, normalized: name.toLowerCase(), now: new Date().toISOString() })) throw new OrganizationServiceError('not_found', 'Tag not found.');
      } catch (cause) {
        if (cause instanceof OrganizationServiceError) throw cause;
        throw new OrganizationServiceError('tag_exists', 'A tag with that name already exists.');
      }
      return { id, name };
    },
    deleteTag(ownerId: string, id: string) {
      if (!repository.deleteTag(ownerId,id)) throw new OrganizationServiceError('not_found','Tag not found.');
    },
    addTag(ownerId: string,itemId: string,tagId: string) {
      try { repository.addTag(ownerId,itemId,tagId,new Date().toISOString()); }
      catch { throw new OrganizationServiceError('not_found','Item or tag not found.'); }
    },
    removeTag(ownerId: string,itemId: string,tagId: string) { repository.removeTag(ownerId,itemId,tagId); },
    listCollections(ownerId: string) { return repository.listCollections(ownerId); },
    createCollection(ownerId: string, rawName: string, description: string) {
      const name = rawName.trim(); const now = new Date().toISOString();
      try { return repository.createCollection({ id: randomUUID(),ownerId,name,normalized:name.toLowerCase(),description,now }); }
      catch { throw new OrganizationServiceError('collection_exists','A collection with that name already exists.'); }
    },
    getCollection(ownerId: string,id: string) {
      const collection = repository.getCollection(ownerId,id);
      if (!collection) throw new OrganizationServiceError('not_found','Collection not found.');
      const page = repository.getCollectionItems(ownerId,id,100);
      return { collection,items:library.decorateItems(ownerId,page.rows),nextCursor:null,hasMore:page.hasMore };
    },
    listCollectionItems(ownerId: string,id: string,limit: number,rawCursor?: string) {
      if (!repository.getCollection(ownerId,id)) throw new OrganizationServiceError('not_found','Collection not found.');
      const fingerprint = createHash('sha256').update(`collection:${id}`).digest('hex');
      const cursor = rawCursor ? decode(rawCursor,ownerId,fingerprint) ?? undefined : undefined;
      if (rawCursor && !cursor) throw new OrganizationServiceError('invalid_cursor','Restart the collection after changing its page.');
      const page = repository.getCollectionItems(ownerId,id,limit,cursor);
      const last = page.rows.at(-1) as Record<string,unknown> | undefined;
      const nextCursor = page.hasMore && last ? encode({version:1,owner:ownerId,fingerprint,sort:'created_desc',key:String(last.created_at),id:String(last.id)}) : null;
      return {items:library.decorateItems(ownerId,page.rows),nextCursor,hasMore:page.hasMore};
    },
    updateCollection(ownerId: string,id: string, input: { name?: string; description?: string }) {
      try {
        const collection = repository.updateCollection({ownerId,id,name:input.name?.trim(),normalized:input.name?.trim().toLowerCase(),description:input.description,now:new Date().toISOString()});
        if (!collection) throw new OrganizationServiceError('not_found','Collection not found.');
        return collection;
      } catch (cause) {
        if (cause instanceof OrganizationServiceError) throw cause;
        throw new OrganizationServiceError('collection_exists','A collection with that name already exists.');
      }
    },
    deleteCollection(ownerId: string,id: string) {
      if (!repository.deleteCollection(ownerId,id)) throw new OrganizationServiceError('not_found','Collection not found.');
    },
    addCollectionItem(ownerId: string,collectionId: string,itemId: string) {
      try { repository.addCollectionItem(ownerId,collectionId,itemId,new Date().toISOString()); }
      catch { throw new OrganizationServiceError('not_found','Item or collection not found.'); }
    },
    removeCollectionItem(ownerId: string,collectionId: string,itemId: string) { repository.removeCollectionItem(ownerId,collectionId,itemId); },
  };
}
