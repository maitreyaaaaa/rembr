import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { createOrganizationRepository } from './repository.js';

export class OrganizationServiceError extends Error {
  constructor(public readonly code: 'tag_exists' | 'tag_limit' | 'not_found', message: string) { super(message); }
}

export function createOrganizationService(database: DatabaseHandle) {
  const repository = createOrganizationRepository(database);
  return {
    listTags(ownerId: string) { return repository.listTags(ownerId); },
    async createTag(ownerId: string, rawName: string) {
      const name = rawName.trim();
      try { return await repository.createTag({ id: randomUUID(), ownerId, name, normalized: name.toLowerCase(), now: new Date().toISOString() }); }
      catch { throw new OrganizationServiceError('tag_exists', 'A tag with that name already exists.'); }
    },
    async renameTag(ownerId: string, id: string, rawName: string) {
      const name = rawName.trim();
      try {
        if (!await repository.renameTag({ ownerId, id, name, normalized: name.toLowerCase(), now: new Date().toISOString() })) throw new OrganizationServiceError('not_found', 'Tag not found.');
      } catch (cause) {
        if (cause instanceof OrganizationServiceError) throw cause;
        throw new OrganizationServiceError('tag_exists', 'A tag with that name already exists.');
      }
      return { id, name };
    },
    async deleteTag(ownerId: string, id: string) {
      if (!await repository.deleteTag(ownerId,id)) throw new OrganizationServiceError('not_found','Tag not found.');
    },
    async addTag(ownerId: string,itemId: string,tagId: string) {
      try {
        const result = await repository.addTag(ownerId,itemId,tagId,new Date().toISOString());
        if (result === 'not_found') throw new OrganizationServiceError('not_found','Item or tag not found.');
        if (result === 'limit') throw new OrganizationServiceError('tag_limit','A save can have up to five tags. Remove a tag before adding another.');
      } catch (cause) {
        if (cause instanceof OrganizationServiceError) throw cause;
        throw new OrganizationServiceError('not_found','Item or tag not found.');
      }
    },
    removeTag(ownerId: string,itemId: string,tagId: string) { return repository.removeTag(ownerId,itemId,tagId); },
  };
}
