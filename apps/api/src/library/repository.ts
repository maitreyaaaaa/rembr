import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { tokenizeSearchTerms } from './search-terms.js';

export interface ItemListQuery {
  search: string; type?: 'page' | 'note'; status?: string; tagId?: string; collectionId?: string;
  sort: 'relevance' | 'created_desc' | 'created_asc' | 'title_asc' | 'title_desc'; matchMode?: 'terms' | 'phrase'; limit: number;
}
export interface ItemCursorKey { key: string; id: string }
type Row = Record<string, unknown>;
const SEARCH_FIELDS = `COALESCE(saved_items.title_override,saved_items.title) ~* ?
  OR COALESCE(saved_items.description_override,saved_items.description,'') ~* ?
  OR saved_items.original_url ~* ?
  OR COALESCE(extracted_artifacts.text_content,'') ~* ?
  OR EXISTS (SELECT 1 FROM notes WHERE notes.owner_id=saved_items.owner_id AND notes.item_id=saved_items.id AND notes.body ~* ?)
  OR EXISTS (SELECT 1 FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id
    AND analysis.item_id=saved_items.id AND (analysis.summary ~* ? OR analysis.visual_description ~* ?
      OR analysis.ocr_text ~* ? OR analysis.transcript ~* ?
      OR analysis.keywords_json ~* ? OR analysis.tags_json ~* ?
      OR analysis.brands_json ~* ? OR analysis.tools_json ~* ?
      OR analysis.people_json ~* ? OR analysis.repositories_json ~* ?))`;
const SEARCH_CONCEPTS: Record<string, string[]> = {
  security: ['security','secure','soc','soc2','compliance','audit','privacy','control','controls','access','data','protection','certification','certifications'],
  compliance: ['compliance','soc','soc2','audit','privacy','control','controls','policy','policies','certification','certifications'],
  privacy: ['privacy','data','protection','security','compliance','policy','policies'],
  marketing: ['marketing','promotion','promotional','brand','campaign','growth','traffic','conversion','content'],
  design: ['design','branding','palette','layout','visual','creative','ui','ux'],
  finance: ['finance','money','revenue','pricing','investment','investing','profit','sales'],
  fitness: ['fitness','workout','training','health','exercise','gym','nutrition'],
  repo: ['repo','repository','github'], github: ['repo','repository','github'],
  skill: ['skills','skill','agent','mcp'], skills: ['skills','skill','agent','mcp'], agent: ['skills','skill','agent','mcp'],
  memory: ['memory','openspace'],
};
function queryGroups(value: string): string[][] {
  return tokenizeSearchTerms(value).map((token) => SEARCH_CONCEPTS[token] ?? [token]);
}
function searchPattern(value: string, allowInflection = false): string {
  const normalized = value.normalize('NFKC').trim();
  const isCjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized);
  const variants = new Set([normalized]);
  if (allowInflection && !isCjk && /^[\p{L}\p{M}]+$/u.test(normalized)) {
    if (/[bcdfghjklmnpqrstvwxz]y$/iu.test(normalized)) {
      const stem = normalized.slice(0, -1);
      variants.add(`${stem}ies`);
      variants.add(`${stem}ied`);
    } else {
      variants.add(`${normalized}s`);
      variants.add(`${normalized}es`);
      variants.add(`${normalized}ed`);
      variants.add(`${normalized}ing`);
      if (normalized.endsWith('e')) variants.add(`${normalized.slice(0, -1)}ing`);
    }
  }
  const literal = [...variants].map((variant) => variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[[:space:]]+'));
  if (isCjk) return literal.join('|');
  return `(^|[^[:alnum:]])(${literal.join('|')})([^[:alnum:]]|$)`;
}
const TERM_SCORE_FIELDS: Array<{ points: number; placeholders: number; sql: (count: number) => string }> = [
  { points: 30, placeholders: 1, sql: (count) => Array.from({ length: count }, () => 'COALESCE(saved_items.title_override,saved_items.title) ~* ?').join(' OR ') },
  { points: 18, placeholders: 1, sql: (count) => Array.from({ length: count }, () => "COALESCE(saved_items.description_override,saved_items.description,'') ~* ?").join(' OR ') },
  { points: 12, placeholders: 1, sql: (count) => Array.from({ length: count }, () => 'saved_items.original_url ~* ?').join(' OR ') },
  { points: 10, placeholders: 1, sql: (count) => Array.from({ length: count }, () => "COALESCE(extracted_artifacts.text_content,'') ~* ?").join(' OR ') },
  { points: 10, placeholders: 1, sql: (count) => Array.from({ length: count }, () => 'EXISTS (SELECT 1 FROM notes WHERE notes.owner_id=saved_items.owner_id AND notes.item_id=saved_items.id AND notes.body ~* ?)').join(' OR ') },
  { points: 8, placeholders: 10, sql: (count) => Array.from({ length: count }, () => `EXISTS (SELECT 1 FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
    AND (analysis.summary ~* ? OR analysis.visual_description ~* ?
      OR analysis.ocr_text ~* ? OR analysis.transcript ~* ?
      OR analysis.keywords_json ~* ? OR analysis.tags_json ~* ?
      OR analysis.brands_json ~* ? OR analysis.tools_json ~* ?
      OR analysis.people_json ~* ? OR analysis.repositories_json ~* ?))`).join(' OR ') },
];
function termScoreSql(group: string[]): string {
  return `+ (${TERM_SCORE_FIELDS.map((field) => `CASE WHEN (${field.sql(group.length)}) THEN ${field.points} ELSE 0 END`).join(' + ')})`;
}
function termScoreParams(group: string[]): string[] {
  return TERM_SCORE_FIELDS.flatMap((field) => group.flatMap((term) => Array.from({ length: field.placeholders }, () => searchPattern(term, true))));
}

function toItem(row: Row) {
  const jobStatus = String(row.job_status ?? '');
  const status = row.pause_cause ? 'paused' : jobStatus === 'cancel_requested' ? 'cancel_requested' : jobStatus === 'cancelled' ? 'cancelled' : jobStatus === 'partial' ? 'partial' : jobStatus === 'retry_wait' ? 'retry_wait' : String(row.status);
  return {
    id: String(row.id), url: String(row.original_url), title: String(row.effective_title ?? row.title),
    description: String(row.effective_description ?? row.description ?? ''),
    titleOverride: row.title_override == null ? null : String(row.title_override),
    descriptionOverride: row.description_override == null ? null : String(row.description_override),
    kind: String(row.item_kind ?? 'page'), status, errorCode: row.error_code ? String(row.error_code) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), textPreview: String(row.text_content || row.note_preview || '').slice(0, 240),
    ...(row.include_text ? { text: String(row.text_content ?? ''), fetchedAt: row.fetched_at ? String(row.fetched_at) : null } : {}),
  };
}

export function createLibraryRepository(database: DatabaseHandle) {
  async function related(ownerId: string, itemIds: string[]) {
    if (!itemIds.length) return { tags: new Map<string, unknown[]>(), collections: new Map<string, unknown[]>() };
    const marks = itemIds.map(() => '?').join(',');
    const tags = await database.prepare(`SELECT item_tags.item_id AS "itemId", tags.id, tags.display_name AS name
      FROM item_tags JOIN tags ON tags.owner_id=item_tags.owner_id AND tags.id=item_tags.tag_id
      WHERE item_tags.owner_id=? AND item_tags.item_id IN (${marks}) ORDER BY tags.normalized_name`)
      .all(ownerId, ...itemIds) as Array<{ itemId: string; id: string; name: string }>;
    const collections = await database.prepare(`SELECT collection_items.item_id AS "itemId", collections.id, collections.name
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

  async function decorate(ownerId: string, rows: Row[], includeDetail = false) {
    const itemIds = rows.map((row) => String(row.id));
    const relationships = await related(ownerId, itemIds);
    return Promise.all(rows.map(async (row) => {
      const dto = { ...toItem(row), tags: relationships.tags.get(String(row.id)) ?? [], collections: relationships.collections.get(String(row.id)) ?? [] };
      if (!includeDetail) return dto;
      const id = String(row.id);
      if (row.item_kind !== 'note') {
        const media = await database.prepare(`SELECT id,detected_mime AS mime,byte_size AS "byteSize",status,error_code AS "errorCode"
          FROM media_artifacts WHERE owner_id=? AND item_id=? AND active=1 ORDER BY created_at,id`)
          .all(ownerId, id) as Array<{ id: string; mime: string | null; byteSize: number; status: string; errorCode: string | null }>;
        return { ...dto, media: media.map((asset) => ({ ...asset, url: asset.status === 'ready' ? `/api/media/${asset.id}` : null })) };
      }
      const note = await database.prepare('SELECT body FROM notes WHERE owner_id=? AND item_id=?').get(ownerId, id) as { body: string } | undefined;
      const links = await database.prepare('SELECT url FROM note_links WHERE owner_id=? AND item_id=? ORDER BY position').all(ownerId, id) as Array<{ url: string }>;
      const assets = await database.prepare(`SELECT asset_objects.id, asset_objects.detected_mime AS mime,
          asset_objects.byte_size AS "byteSize"
        FROM note_assets JOIN asset_objects ON asset_objects.owner_id=note_assets.owner_id AND asset_objects.id=note_assets.asset_id
        WHERE note_assets.owner_id=? AND note_assets.item_id=? AND asset_objects.state='ready' ORDER BY note_assets.position`)
        .all(ownerId, id) as Array<{ id: string; mime: string; byteSize: number }>;
      if (note) return { ...dto, note: { body: note.body, links: links.map((link) => link.url), assets: assets.map((asset) => ({ ...asset, url: `/api/assets/${asset.id}` })) } };
      return dto;
    }));
  }

  async function rowById(ownerId: string, itemId: string) {
    return await database.prepare(`SELECT saved_items.*, COALESCE(saved_items.title_override,saved_items.title) AS effective_title,
        COALESCE(saved_items.description_override,saved_items.description) AS effective_description,
        extracted_artifacts.text_content, extracted_artifacts.fetched_at, 1 AS include_text,
        processing_jobs.status AS job_status, job_pause_states.pause_cause
      FROM saved_items LEFT JOIN extracted_artifacts ON extracted_artifacts.item_id=saved_items.id AND extracted_artifacts.owner_id=saved_items.owner_id
      LEFT JOIN processing_jobs ON processing_jobs.item_id=saved_items.id AND processing_jobs.owner_id=saved_items.owner_id
      LEFT JOIN job_pause_states ON job_pause_states.job_id=processing_jobs.id AND job_pause_states.owner_id=processing_jobs.owner_id
      WHERE saved_items.owner_id=? AND saved_items.id=?`).get(ownerId, itemId) as Row | undefined;
  }

  return {
    async findByCanonical(ownerId: string, canonicalUrl: string) {
      const row = await database.prepare('SELECT id FROM saved_items WHERE owner_id=? AND canonical_url=?').get(ownerId, canonicalUrl) as { id: string } | undefined;
      return row ? this.get(ownerId, row.id) : undefined;
    },
    async createPage(ownerId: string, originalUrl: string, canonicalUrl: string, title: string, correlationId: string = randomUUID()) {
      const id = randomUUID(); const now = new Date().toISOString();
      await database.transaction(async () => {
        await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
          VALUES (?,?,?,?,?,'queued',?,?)`).run(id,ownerId,originalUrl,canonicalUrl,title,now,now);
        await database.prepare(`INSERT INTO processing_jobs (id,owner_id,item_id,correlation_id,status,available_at,created_at,updated_at)
          VALUES (?,?,?,?,'queued',?,?,?)`).run(randomUUID(),ownerId,id,correlationId,now,now,now);
      })();
      return this.get(ownerId,id);
    },
    async list(ownerId: string, query: ItemListQuery, cursor?: ItemCursorKey) {
      const clauses = ['saved_items.owner_id=?']; const params: unknown[] = [ownerId];
      if (query.type) { clauses.push('saved_items.item_kind=?'); params.push(query.type); }
      if (query.status) {
        clauses.push(`(CASE WHEN job_pause_states.pause_cause IS NOT NULL THEN 'paused'
          WHEN processing_jobs.status IN ('cancel_requested','cancelled','partial','retry_wait') THEN processing_jobs.status
          WHEN processing_jobs.status='completed' THEN 'ready' ELSE saved_items.status END)=?`);
        params.push(query.status);
      }
      const safeSearch = searchPattern(query.search);
      if (query.search) {
        if (query.matchMode === 'phrase') {
          clauses.push(`(${SEARCH_FIELDS})`);
          params.push(...Array.from({ length: 15 }, () => safeSearch));
        } else {
          for (const group of queryGroups(query.search)) {
            clauses.push(`(${group.map(() => `(${SEARCH_FIELDS})`).join(' OR ')})`);
            for (const term of group) {
              const pattern = searchPattern(term, true);
              params.push(...Array.from({ length: 15 }, () => pattern));
            }
          }
        }
      }
      if (query.tagId) { clauses.push('EXISTS (SELECT 1 FROM item_tags WHERE owner_id=saved_items.owner_id AND item_id=saved_items.id AND tag_id=?)'); params.push(query.tagId); }
      if (query.collectionId) { clauses.push('EXISTS (SELECT 1 FROM collection_items WHERE owner_id=saved_items.owner_id AND item_id=saved_items.id AND collection_id=?)'); params.push(query.collectionId); }
      const orderings: Record<string, string> = {
        relevance: 'search_score DESC, created_at DESC, id DESC',
        created_desc: 'created_at DESC, id DESC', created_asc: 'created_at ASC, id ASC',
        title_asc: 'lower(effective_title) ASC, id ASC',
        title_desc: 'lower(effective_title) DESC, id DESC',
      };
      let cursorWhere = '';
      let cursorParams: unknown[] = [];
      if (cursor && query.sort === 'relevance') {
        let key: unknown;
        try { key = JSON.parse(cursor.key); } catch { key = null; }
        if (!Array.isArray(key) || typeof key[0] !== 'number' || !Number.isFinite(key[0]) || typeof key[1] !== 'string') {
          throw new Error('Invalid relevance cursor.');
        }
        cursorWhere = 'WHERE (search_score < ? OR (search_score = ? AND (created_at < ? OR (created_at = ? AND id < ?))))';
        cursorParams = [key[0], key[0], key[1], key[1], cursor.id];
      } else if (cursor) {
        const titleSort = query.sort.startsWith('title_'); const expression = titleSort ? 'lower(COALESCE(saved_items.title_override,saved_items.title))' : 'saved_items.created_at';
        const direction = query.sort.endsWith('asc') ? '>' : '<';
        clauses.push(`(${expression} ${direction} ? OR (${expression}=? AND saved_items.id ${direction} ?))`); params.push(cursor.key, cursor.key, cursor.id);
      }
      const scoreExpression = query.sort === 'relevance' && query.search.trim() ? `
        (CASE WHEN lower(COALESCE(saved_items.title_override,saved_items.title))=lower(?) THEN 100 ELSE 0 END
        + CASE WHEN COALESCE(saved_items.title_override,saved_items.title) ~* ? THEN 70 ELSE 0 END
        + CASE WHEN COALESCE(saved_items.description_override,saved_items.description,'') ~* ? THEN 40 ELSE 0 END
        + CASE WHEN saved_items.original_url ~* ? THEN 30 ELSE 0 END
        + CASE WHEN COALESCE(extracted_artifacts.text_content,'') ~* ? THEN 20 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM notes WHERE notes.owner_id=saved_items.owner_id AND notes.item_id=saved_items.id AND notes.body ~* ?) THEN 20 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
            AND (analysis.summary ~* ? OR analysis.visual_description ~* ?
              OR analysis.ocr_text ~* ? OR analysis.transcript ~* ?
            OR analysis.keywords_json ~* ? OR analysis.tags_json ~* ?
            OR analysis.brands_json ~* ? OR analysis.tools_json ~* ?
            OR analysis.people_json ~* ? OR analysis.repositories_json ~* ?)) THEN 15 ELSE 0 END
        ${query.matchMode === 'phrase' ? '' : queryGroups(query.search).map((group) => termScoreSql(group)).join(' ')}
        )` : 'NULL';
      const scoreParams = query.sort === 'relevance' && query.search.trim() ? [query.search, ...Array.from({ length: 15 }, () => safeSearch),
        ...(query.matchMode === 'phrase' ? [] : queryGroups(query.search).flatMap((group) => termScoreParams(group)))] : [];
      const rows = await database.prepare(`WITH ranked_items AS (
          SELECT saved_items.*, COALESCE(saved_items.title_override,saved_items.title) AS effective_title,
            COALESCE(saved_items.description_override,saved_items.description) AS effective_description,
            extracted_artifacts.text_content,
            (SELECT LEFT(notes.body,240) FROM notes WHERE notes.owner_id=saved_items.owner_id AND notes.item_id=saved_items.id) AS note_preview,
            processing_jobs.status AS job_status, job_pause_states.pause_cause,
            ${scoreExpression} AS search_score
          FROM saved_items
          LEFT JOIN extracted_artifacts ON extracted_artifacts.item_id=saved_items.id AND extracted_artifacts.owner_id=saved_items.owner_id
          LEFT JOIN processing_jobs ON processing_jobs.item_id=saved_items.id AND processing_jobs.owner_id=saved_items.owner_id
          LEFT JOIN job_pause_states ON job_pause_states.job_id=processing_jobs.id AND job_pause_states.owner_id=processing_jobs.owner_id
          WHERE ${clauses.join(' AND ')}
        )
        SELECT * FROM ranked_items ${cursorWhere} ORDER BY ${orderings[query.sort]} LIMIT ?`)
        .all(...scoreParams, ...params, ...cursorParams, query.limit + 1) as Row[];
      const pageRows = rows.slice(0, query.limit);
      return { rows: pageRows, items: await decorate(ownerId, pageRows), hasMore: rows.length > query.limit };
    },
    decorateItems(ownerId: string, rows: Row[]) { return decorate(ownerId, rows); },
    async get(ownerId: string, itemId: string) {
      const row = await rowById(ownerId, itemId);
      return row ? (await decorate(ownerId, [row], true))[0] : undefined;
    },
    async update(ownerId: string, itemId: string, changes: { titleOverride?: string | null; descriptionOverride?: string | null }) {
      const fields: string[] = []; const values: unknown[] = [];
      if (changes.titleOverride !== undefined) { fields.push('title_override=?'); values.push(changes.titleOverride?.trim() || null); }
      if (changes.descriptionOverride !== undefined) { fields.push('description_override=?'); values.push(changes.descriptionOverride?.trim() || null); }
      fields.push('updated_at=?'); values.push(new Date().toISOString(), ownerId, itemId);
      const result = await database.prepare(`UPDATE saved_items SET ${fields.join(',')} WHERE owner_id=? AND id=?`).run(...values);
      return result.changes ? this.get(ownerId, itemId) : undefined;
    },
    async delete(ownerId: string, itemId: string) {
      const assets = await database.prepare(`SELECT DISTINCT asset_objects.id, asset_objects.storage_key AS "storageKey" FROM note_assets
        JOIN asset_objects ON asset_objects.owner_id=note_assets.owner_id AND asset_objects.id=note_assets.asset_id
        WHERE note_assets.owner_id=? AND note_assets.item_id=?`).all(ownerId, itemId) as Array<{ id: string; storageKey: string }>;
      const mediaKeys = (await database.prepare('SELECT storage_key FROM media_artifacts WHERE owner_id=? AND item_id=? AND storage_key IS NOT NULL').all(ownerId, itemId) as Array<{ storage_key: string }>).map((row) => row.storage_key);
      const deleted = await database.transaction(async () => {
        if (!await database.prepare('SELECT 1 FROM saved_items WHERE owner_id=? AND id=?').get(ownerId, itemId)) return false;
        const now = new Date().toISOString();
        for (const asset of assets) await database.prepare("UPDATE asset_objects SET state='deleting', updated_at=? WHERE owner_id=? AND id=?").run(new Date().toISOString(), ownerId, asset.id);
        for (const storageKey of mediaKeys) await database.prepare(`INSERT INTO media_cleanup_queue (storage_key,created_at,updated_at) VALUES (?,?,?) ON CONFLICT DO NOTHING`).run(storageKey, now, now);
        await database.prepare('DELETE FROM saved_items WHERE owner_id=? AND id=?').run(ownerId, itemId);
        return true;
      })();
      return deleted ? { assets, mediaKeys } : null;
    },
    async noteAssets(ownerId: string, itemId: string) {
      return await database.prepare('SELECT asset_id AS id, position FROM note_assets WHERE owner_id=? AND item_id=? ORDER BY position').all(ownerId, itemId) as Array<{ id: string; position: number }>;
    },
    async isNote(ownerId: string, itemId: string) {
      return Boolean(await database.prepare("SELECT 1 FROM saved_items WHERE owner_id=? AND id=? AND item_kind='note'").get(ownerId, itemId));
    },
    async saveNote(input: { ownerId: string; itemId: string; isCreate: boolean; body: string; title: string; links: string[]; assetIds: string[]; now: string }) {
      const { ownerId, itemId, isCreate, body, title, links, assetIds, now } = input;
      await database.transaction(async () => {
        const existing = isCreate ? [] : await this.noteAssets(ownerId, itemId);
        if (existing.length + assetIds.length > 5) throw new Error('too_many_images');
        if (isCreate) {
          await database.prepare(`INSERT INTO saved_items (id, owner_id, original_url, canonical_url, title, description, status, item_kind, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '', 'ready', 'note', ?, ?)`)
            .run(itemId, ownerId, `rembr://note/${itemId}`, `rembr://note/${itemId}`, title || 'Untitled note', now, now);
          await database.prepare('INSERT INTO notes (owner_id, item_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(ownerId, itemId, body, now, now);
        } else {
          await database.prepare('UPDATE notes SET body=?, updated_at=? WHERE owner_id=? AND item_id=?').run(body, now, ownerId, itemId);
          await database.prepare('DELETE FROM note_links WHERE owner_id=? AND item_id=?').run(ownerId, itemId);
          if (title) await database.prepare('UPDATE saved_items SET title_override=?, updated_at=? WHERE owner_id=? AND id=?').run(title.slice(0, 240), now, ownerId, itemId);
          await database.prepare('DELETE FROM note_assets WHERE owner_id=? AND item_id=?').run(ownerId, itemId);
        }
        const insertLink = database.prepare('INSERT INTO note_links (id, owner_id, item_id, url, position, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        for (const [position, url] of links.entries()) await insertLink.run(randomUUID(), ownerId, itemId, url, position, now);
        const insertAsset = database.prepare('INSERT INTO note_assets (owner_id, item_id, asset_id, position) VALUES (?, ?, ?, ?)');
        if (!isCreate) for (const [index, asset] of existing.entries()) await insertAsset.run(ownerId, itemId, asset.id, index);
        for (const [index, assetId] of assetIds.entries()) await insertAsset.run(ownerId, itemId, assetId, (isCreate ? 0 : existing.length) + index);
      })();
      return await this.get(ownerId, itemId);
    },
    async removeNoteAsset(ownerId: string, itemId: string, assetId: string) {
      const asset = await database.prepare(`SELECT asset_objects.storage_key AS "storageKey" FROM note_assets
        JOIN asset_objects ON asset_objects.owner_id=note_assets.owner_id AND asset_objects.id=note_assets.asset_id
        WHERE note_assets.owner_id=? AND note_assets.item_id=? AND note_assets.asset_id=?`)
        .get(ownerId, itemId, assetId) as { storageKey: string } | undefined;
      if (!asset) return undefined;
      await database.transaction(async () => {
        await database.prepare("UPDATE asset_objects SET state='deleting', updated_at=? WHERE owner_id=? AND id=?").run(new Date().toISOString(), ownerId, assetId);
        const remaining = await database.prepare('SELECT asset_id AS id FROM note_assets WHERE owner_id=? AND item_id=? AND asset_id<>? ORDER BY position').all(ownerId, itemId, assetId) as Array<{ id: string }>;
        await database.prepare('DELETE FROM note_assets WHERE owner_id=? AND item_id=?').run(ownerId, itemId);
        const insert = database.prepare('INSERT INTO note_assets (owner_id,item_id,asset_id,position) VALUES (?,?,?,?)');
        for (const [position, row] of remaining.entries()) await insert.run(ownerId, itemId, row.id, position);
      })();
      return asset;
    },
  };
}
