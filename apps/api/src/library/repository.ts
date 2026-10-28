import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

export interface ItemListQuery {
  search: string; type?: 'page' | 'note'; status?: string; tagId?: string; collectionId?: string;
  sort: 'created_desc' | 'created_asc' | 'title_asc' | 'title_desc'; limit: number;
}
export interface ItemCursorKey { key: string; id: string }
type Row = Record<string, unknown>;

function toItem(row: Row) {
  return {
    id: String(row.id), url: String(row.original_url), title: String(row.effective_title ?? row.title),
    description: String(row.effective_description ?? row.description ?? ''),
    titleOverride: row.title_override == null ? null : String(row.title_override),
    descriptionOverride: row.description_override == null ? null : String(row.description_override),
    kind: String(row.item_kind ?? 'page'), status: String(row.status), errorCode: row.error_code ? String(row.error_code) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), textPreview: String(row.text_content ?? '').slice(0, 240),
    ...(row.include_text ? { text: String(row.text_content ?? ''), fetchedAt: row.fetched_at ? String(row.fetched_at) : null } : {}),
  };
}

export function createLibraryRepository(database: DatabaseHandle) {
  function related(ownerId: string, itemIds: string[]) {
    if (!itemIds.length) return { tags: new Map<string, unknown[]>(), collections: new Map<string, unknown[]>() };
    const marks = itemIds.map(() => '?').join(',');
    const tags = database.prepare(`SELECT item_tags.item_id AS itemId, tags.id, tags.display_name AS name
      FROM item_tags JOIN tags ON tags.owner_id=item_tags.owner_id AND tags.id=item_tags.tag_id
      WHERE item_tags.owner_id=? AND item_tags.item_id IN (${marks}) ORDER BY tags.normalized_name`)
      .all(ownerId, ...itemIds) as Array<{ itemId: string; id: string; name: string }>;
    const collections = database.prepare(`SELECT collection_items.item_id AS itemId, collections.id, collections.name
      FROM collection_items JOIN collections ON collections.owner_id=collection_items.owner_id AND collections.id=collection_items.collection_id
      WHERE collection_items.owner_id=? AND collection_items.item_id IN (${marks}) ORDER BY collections.normalized_name`)
      .all(ownerId, ...itemIds) as Array<{ itemId: string; id: string; name: string }>;
    const map = <T extends { itemId: string; id: string; name: string }>(rows: T[]) => {
      const result = new Map<string, unknown[]>();
      for (const row of rows) result.set(row.itemId, [...(result.get(row.itemId) ?? []), { id: row.id, name: row.name }]);
      return result;
    };
    return { tags: map(tags), collections: map(collections) };
  }

  function decorate(ownerId: string, rows: Row[], includeDetail = false) {
    const itemIds = rows.map((row) => String(row.id));
    const relationships = related(ownerId, itemIds);
    return rows.map((row) => {
      const dto = { ...toItem(row), tags: relationships.tags.get(String(row.id)) ?? [], collections: relationships.collections.get(String(row.id)) ?? [] };
      if (!includeDetail || row.item_kind !== 'note') return dto;
      const id = String(row.id);
      const note = database.prepare('SELECT body FROM notes WHERE owner_id=? AND item_id=?').get(ownerId, id) as { body: string } | undefined;
      const links = database.prepare('SELECT url FROM note_links WHERE owner_id=? AND item_id=? ORDER BY position').all(ownerId, id) as Array<{ url: string }>;
      const assets = database.prepare(`SELECT asset_objects.id, asset_objects.detected_mime AS mime,
          asset_objects.byte_size AS byteSize
        FROM note_assets JOIN asset_objects ON asset_objects.owner_id=note_assets.owner_id AND asset_objects.id=note_assets.asset_id
        WHERE note_assets.owner_id=? AND note_assets.item_id=? AND asset_objects.state='ready' ORDER BY note_assets.position`)
        .all(ownerId, id) as Array<{ id: string; mime: string; byteSize: number }>;
      if (note) return { ...dto, note: { body: note.body, links: links.map((link) => link.url), assets: assets.map((asset) => ({ ...asset, url: `/api/assets/${asset.id}` })) } };
      return dto;
    });
  }

  function rowById(ownerId: string, itemId: string): Row | undefined {
    return database.prepare(`SELECT saved_items.*, COALESCE(saved_items.title_override,saved_items.title) AS effective_title,
        COALESCE(saved_items.description_override,saved_items.description) AS effective_description,
        extracted_artifacts.text_content, extracted_artifacts.fetched_at, 1 AS include_text
      FROM saved_items LEFT JOIN extracted_artifacts ON extracted_artifacts.item_id=saved_items.id AND extracted_artifacts.owner_id=saved_items.owner_id
      WHERE saved_items.owner_id=? AND saved_items.id=?`).get(ownerId, itemId) as Row | undefined;
  }

  return {
    findByCanonical(ownerId: string, canonicalUrl: string) {
      const row = database.prepare('SELECT id FROM saved_items WHERE owner_id=? AND canonical_url=?').get(ownerId, canonicalUrl) as { id: string } | undefined;
      return row ? this.get(ownerId, row.id) : undefined;
    },
    createPage(ownerId: string, originalUrl: string, canonicalUrl: string, title: string, correlationId: string = randomUUID()) {
      const id = randomUUID(); const now = new Date().toISOString();
      database.transaction(() => {
        database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
          VALUES (?,?,?,?,?,'queued',?,?)`).run(id,ownerId,originalUrl,canonicalUrl,title,now,now);
        database.prepare(`INSERT INTO processing_jobs (id,owner_id,item_id,correlation_id,status,available_at,created_at,updated_at)
          VALUES (?,?,?,?,'queued',?,?,?)`).run(randomUUID(),ownerId,id,correlationId,now,now,now);
      })();
      return this.get(ownerId,id);
    },
    list(ownerId: string, query: ItemListQuery, cursor?: ItemCursorKey) {
      const clauses = ['saved_items.owner_id=?']; const params: unknown[] = [ownerId];
      if (query.type) { clauses.push('saved_items.item_kind=?'); params.push(query.type); }
      if (query.status) { clauses.push('saved_items.status=?'); params.push(query.status); }
      if (query.search) {
        clauses.push(`(COALESCE(saved_items.title_override,saved_items.title) LIKE ? ESCAPE '\\' OR saved_items.original_url LIKE ? ESCAPE '\\')`);
        const safe = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`; params.push(safe, safe);
      }
      if (query.tagId) { clauses.push('EXISTS (SELECT 1 FROM item_tags WHERE owner_id=saved_items.owner_id AND item_id=saved_items.id AND tag_id=?)'); params.push(query.tagId); }
      if (query.collectionId) { clauses.push('EXISTS (SELECT 1 FROM collection_items WHERE owner_id=saved_items.owner_id AND item_id=saved_items.id AND collection_id=?)'); params.push(query.collectionId); }
      const orderings: Record<string, string> = {
        created_desc: 'saved_items.created_at DESC, saved_items.id DESC', created_asc: 'saved_items.created_at ASC, saved_items.id ASC',
        title_asc: 'lower(COALESCE(saved_items.title_override,saved_items.title)) ASC, saved_items.id ASC',
        title_desc: 'lower(COALESCE(saved_items.title_override,saved_items.title)) DESC, saved_items.id DESC',
      };
      if (cursor) {
        const titleSort = query.sort.startsWith('title_'); const expression = titleSort ? 'lower(COALESCE(saved_items.title_override,saved_items.title))' : 'saved_items.created_at';
        const direction = query.sort.endsWith('asc') ? '>' : '<';
        clauses.push(`(${expression} ${direction} ? OR (${expression}=? AND saved_items.id ${direction} ?))`); params.push(cursor.key, cursor.key, cursor.id);
      }
      const rows = database.prepare(`SELECT saved_items.*, COALESCE(saved_items.title_override,saved_items.title) AS effective_title,
          COALESCE(saved_items.description_override,saved_items.description) AS effective_description, extracted_artifacts.text_content
        FROM saved_items LEFT JOIN extracted_artifacts ON extracted_artifacts.item_id=saved_items.id AND extracted_artifacts.owner_id=saved_items.owner_id
        WHERE ${clauses.join(' AND ')} ORDER BY ${orderings[query.sort]} LIMIT ?`)
        .all(...params, query.limit + 1) as Row[];
      const pageRows = rows.slice(0, query.limit);
      return { rows: pageRows, items: decorate(ownerId, pageRows), hasMore: rows.length > query.limit };
    },
    decorateItems(ownerId: string, rows: Row[]) { return decorate(ownerId, rows); },
    get(ownerId: string, itemId: string) {
      const row = rowById(ownerId, itemId);
      return row ? decorate(ownerId, [row], true)[0] : undefined;
    },
    update(ownerId: string, itemId: string, changes: { titleOverride?: string | null; descriptionOverride?: string | null }) {
      const fields: string[] = []; const values: unknown[] = [];
      if (changes.titleOverride !== undefined) { fields.push('title_override=?'); values.push(changes.titleOverride?.trim() || null); }
      if (changes.descriptionOverride !== undefined) { fields.push('description_override=?'); values.push(changes.descriptionOverride?.trim() || null); }
      fields.push('updated_at=?'); values.push(new Date().toISOString(), ownerId, itemId);
      const result = database.prepare(`UPDATE saved_items SET ${fields.join(',')} WHERE owner_id=? AND id=?`).run(...values);
      return result.changes ? this.get(ownerId, itemId) : undefined;
    },
    delete(ownerId: string, itemId: string) {
      const assets = database.prepare(`SELECT DISTINCT asset_objects.id, asset_objects.storage_key AS storageKey FROM note_assets
        JOIN asset_objects ON asset_objects.owner_id=note_assets.owner_id AND asset_objects.id=note_assets.asset_id
        WHERE note_assets.owner_id=? AND note_assets.item_id=?`).all(ownerId, itemId) as Array<{ id: string; storageKey: string }>;
      const deleted = database.transaction(() => {
        if (!database.prepare('SELECT 1 FROM saved_items WHERE owner_id=? AND id=?').get(ownerId, itemId)) return false;
        for (const asset of assets) database.prepare("UPDATE asset_objects SET state='deleting', updated_at=? WHERE owner_id=? AND id=?").run(new Date().toISOString(), ownerId, asset.id);
        database.prepare('DELETE FROM saved_items WHERE owner_id=? AND id=?').run(ownerId, itemId);
        return true;
      })();
      return deleted ? assets : null;
    },
    noteAssets(ownerId: string, itemId: string) {
      return database.prepare('SELECT asset_id AS id, position FROM note_assets WHERE owner_id=? AND item_id=? ORDER BY position').all(ownerId, itemId) as Array<{ id: string; position: number }>;
    },
    isNote(ownerId: string, itemId: string): boolean {
      return Boolean(database.prepare("SELECT 1 FROM saved_items WHERE owner_id=? AND id=? AND item_kind='note'").get(ownerId, itemId));
    },
    saveNote(input: { ownerId: string; itemId: string; isCreate: boolean; body: string; title: string; links: string[]; assetIds: string[]; now: string }) {
      const { ownerId, itemId, isCreate, body, title, links, assetIds, now } = input;
      database.transaction(() => {
        const existing = isCreate ? [] : this.noteAssets(ownerId, itemId);
        if (existing.length + assetIds.length > 5) throw new Error('too_many_images');
        if (isCreate) {
          database.prepare(`INSERT INTO saved_items (id, owner_id, original_url, canonical_url, title, description, status, item_kind, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '', 'ready', 'note', ?, ?)`)
            .run(itemId, ownerId, `rembr://note/${itemId}`, `rembr://note/${itemId}`, title || 'Untitled note', now, now);
          database.prepare('INSERT INTO notes (owner_id, item_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(ownerId, itemId, body, now, now);
        } else {
          database.prepare('UPDATE notes SET body=?, updated_at=? WHERE owner_id=? AND item_id=?').run(body, now, ownerId, itemId);
          database.prepare('DELETE FROM note_links WHERE owner_id=? AND item_id=?').run(ownerId, itemId);
          if (title) database.prepare('UPDATE saved_items SET title_override=?, updated_at=? WHERE owner_id=? AND id=?').run(title.slice(0, 240), now, ownerId, itemId);
          database.prepare('DELETE FROM note_assets WHERE owner_id=? AND item_id=?').run(ownerId, itemId);
        }
        const insertLink = database.prepare('INSERT INTO note_links (id, owner_id, item_id, url, position, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        links.forEach((url, position) => insertLink.run(randomUUID(), ownerId, itemId, url, position, now));
        const insertAsset = database.prepare('INSERT INTO note_assets (owner_id, item_id, asset_id, position) VALUES (?, ?, ?, ?)');
        if (!isCreate) existing.forEach((asset, index) => insertAsset.run(ownerId, itemId, asset.id, index));
        assetIds.forEach((assetId, index) => insertAsset.run(ownerId, itemId, assetId, (isCreate ? 0 : existing.length) + index));
      })();
      return this.get(ownerId, itemId);
    },
    removeNoteAsset(ownerId: string, itemId: string, assetId: string) {
      const asset = database.prepare(`SELECT asset_objects.storage_key AS storageKey FROM note_assets
        JOIN asset_objects ON asset_objects.owner_id=note_assets.owner_id AND asset_objects.id=note_assets.asset_id
        WHERE note_assets.owner_id=? AND note_assets.item_id=? AND note_assets.asset_id=?`)
        .get(ownerId, itemId, assetId) as { storageKey: string } | undefined;
      if (!asset) return undefined;
      database.transaction(() => {
        database.prepare("UPDATE asset_objects SET state='deleting', updated_at=? WHERE owner_id=? AND id=?").run(new Date().toISOString(), ownerId, assetId);
        const remaining = database.prepare('SELECT asset_id AS id FROM note_assets WHERE owner_id=? AND item_id=? AND asset_id<>? ORDER BY position').all(ownerId, itemId, assetId) as Array<{ id: string }>;
        database.prepare('DELETE FROM note_assets WHERE owner_id=? AND item_id=?').run(ownerId, itemId);
        const insert = database.prepare('INSERT INTO note_assets (owner_id,item_id,asset_id,position) VALUES (?,?,?,?)');
        remaining.forEach((row, position) => insert.run(ownerId, itemId, row.id, position));
      })();
      return asset;
    },
  };
}
