import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { tokenizeSearchTerms } from '../library/search-terms.js';
import { matchingRuleTerms } from './matching.js';

const ITEM_SCAN_LIMIT = 2_000;
const MIN_MATCHES = 2;
const MAX_COLLECTIONS = 30;
const CATEGORY_RULES = [
  { slug: 'fashion-clothes', name: 'Fashion / clothes', description: 'Outfits, clothing, accessories, and style references.', terms: ['fashion','clothes','clothing','outfit','wardrobe','style','dress','shirt','jacket','jeans','sneakers','shoes','accessories','bag','watch','jewelry'], group: 'Topics' },
  { slug: 'products', name: 'Products', description: 'Shopping research, comparisons, and things to buy later.', terms: ['product','products','shop','shopping','buy','price','deal','review','comparison','amazon','etsy','store','cart','gadget','gear'], group: 'Products' },
  { slug: 'ui-inspiration', name: 'UI inspiration', description: 'Screens, layouts, components, and interface ideas.', terms: ['ui','ux','interface','dashboard','landing page','component','design system','web design','app design','layout','figma','tailwind','react'], group: 'Topics' },
  { slug: 'recipes', name: 'Recipes', description: 'Food ideas, recipes, restaurants, and cooking references.', terms: ['recipe','food','cooking','meal','restaurant','dinner','lunch','breakfast','pasta','ramen','kitchen','bake'], group: 'Topics' },
  { slug: 'product-ideas', name: 'Product ideas', description: 'Product concepts, market examples, and business ideas.', terms: ['startup','saas','business','pricing','growth','market','customer','launch','mvp','founder'], group: 'Topics' },
  { slug: 'design-tools', name: 'Design tools', description: 'Creative and design tools, templates, and workflows.', terms: ['tool','tools','figma','canva','photoshop','illustrator','framer','webflow','plugin','template'], group: 'Tools' },
  { slug: 'video-research', name: 'Video research', description: 'Videos, reels, transcripts, and watch-later research.', terms: ['youtube','tiktok','video','reel','shorts','transcript','clip','podcast','watch'], group: 'Topics' },
  { slug: 'social-inspiration', name: 'Social inspiration', description: 'Posts and creators saved from social platforms.', terms: ['instagram','pinterest','twitter','linkedin','reddit','creator','post','thread'], group: 'Topics' },
  { slug: 'research-notes', name: 'Research notes', description: 'Articles, notes, studies, guides, and references.', terms: ['research','article','reference','notes','paper','study','guide','tutorial','documentation'], group: 'Topics' },
] as const;

type SourceType = 'rule' | 'capture' | 'topic' | 'entity' | 'collection' | 'platform';
type SmartItem = { id: string; title: string; description: string; url: string; text: string; note: string; analysisText: string; status: string; kind: string; platform: string; createdAt: string; tags: string[]; analysisTags: string[]; keywords: string[]; brands: string[]; tools: string[]; people: string[]; repositories: string[]; sourceCollections: Array<{ platform: string; name: string }> };
type CandidateItem = { item: SmartItem; confidence: number; reason: string; overrideAction?: 'include' | 'exclude' };
type Candidate = { slug: string; name: string; description: string; sourceType: SourceType; folderGroup: string; matchSignals: Set<string>; items: Map<string, CandidateItem> };
type CollectionRow = { id: string; owner_id: string; slug: string; name: string; description: string; source_type: SourceType; pinned: boolean | number; hidden: boolean | number; folder_color: string | null; generation_metadata: string; created_at: string; updated_at: string };
type StoredMatch = { collection_id: string; item_id: string; confidence: number; reason: string; override_action: 'include' | 'exclude' | null; created_at: string };
type RefreshState = { revision: string | number; built_revision: string | number; lease_token: string | null; generated_at: string | null; truncated: boolean; failed: boolean };
type DbItemRow = Record<string, unknown>;

function readStrings(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean).slice(0, 30) : []; }
  catch { return []; }
}
function unique(values: string[], limit = 8): string[] { return [...new Set(values.map((value) => value.trim().replace(/\s+/g, ' ').slice(0, 80)).filter(Boolean))].slice(0, limit); }
function slugify(value: string): string { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function safeMetadata(value: string): Record<string, unknown> { try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } }

function toSmartItem(row: DbItemRow, tags: string[]): SmartItem {
  const metadata = safeMetadata(String(row.source_metadata_json ?? ''));
  const platform = String(row.source_platform ?? '');
  return {
    id: String(row.id), title: String(row.title ?? 'Untitled save'), description: String(row.description ?? ''), url: String(row.url ?? ''),
    text: String(row.text_content ?? ''), note: String(row.note_body ?? ''), analysisText: String(row.analysis_text ?? ''), status: String(row.effective_status ?? row.status ?? ''),
    kind: String(row.item_kind ?? 'page'), platform, createdAt: String(row.created_at),
    tags, analysisTags: readStrings(row.analysis_tags_json), keywords: readStrings(row.keywords_json),
    brands: readStrings(row.brands_json), tools: readStrings(row.tools_json),
    people: readStrings(row.people_json), repositories: readStrings(row.repositories_json),
    sourceCollections: strings(metadata.collections).map((name) => ({ platform, name })),
  };
}

function searchText(item: SmartItem): string {
  let host = '';
  try { host = new URL(item.url).hostname; } catch { /* Invalid stored URLs do not contribute domain text. */ }
  return [item.title, item.description, item.url, host, item.text, item.note, item.analysisText, item.platform, ...item.tags, ...item.analysisTags, ...item.keywords, ...item.brands, ...item.tools, ...item.people, ...item.repositories].join(' ').toLowerCase();
}
function matchesSearch(item: SmartItem, query: string): boolean {
  const terms = tokenizeSearchTerms(query);
  if (!terms.length) return true;
  const text = searchText(item);
  return terms.every((term) => text.includes(term));
}

function candidatesFrom(items: SmartItem[]): Candidate[] {
  const candidates = new Map<string, Candidate>();
  const add = (item: SmartItem, input: { slug: string; name: string; description: string; sourceType: SourceType; group: string; signals: string[]; confidence: number; reason: string }) => {
    if (!input.slug) return;
    const candidate = candidates.get(input.slug) ?? {
      slug: input.slug, name: input.name.slice(0, 80), description: input.description.slice(0, 500),
      sourceType: input.sourceType, folderGroup: input.group, matchSignals: new Set<string>(), items: new Map<string, CandidateItem>(),
    };
    for (const signal of input.signals) candidate.matchSignals.add(signal);
    const existing = candidate.items.get(item.id);
    if (!existing || existing.confidence < input.confidence) candidate.items.set(item.id, { item, confidence: input.confidence, reason: input.reason.slice(0, 220) });
    candidates.set(input.slug, candidate);
  };

  for (const item of items) {
    if (['failed', 'paused', 'cancelled'].includes(item.status)) continue;
    const text = searchText(item);
    for (const { platform, name } of item.sourceCollections) {
      const normalizedName = name.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!normalizedName || /^(saved posts|saved items|all saves)$/i.test(normalizedName)) continue;
      const platformLabel = platform ? `${platform[0]!.toUpperCase()}${platform.slice(1)}` : 'Imported';
      const slug = slugify(`${platform}-${normalizedName}`);
      if (slug) add(item, {
        slug: `imported-${slug}`, name: normalizedName,
        description: `Saves from your ${platformLabel} collection “${normalizedName}”.`,
        sourceType: 'platform', group: `${platformLabel} collections`, signals: [platformLabel, normalizedName],
        confidence: 1, reason: `Imported from your ${platformLabel} collection “${normalizedName}”.`,
      });
    }
    for (const rule of CATEGORY_RULES) {
      const matches = matchingRuleTerms(text, rule.terms);
      if (matches.length) add(item, { slug: rule.slug, name: rule.name, description: rule.description, sourceType: 'rule', group: rule.group, signals: matches.slice(0, 4), confidence: Math.min(0.95, 0.58 + matches.length * 0.08), reason: `Matched ${matches.slice(0, 3).join(', ')}.` });
    }
    if (item.kind === 'note') add(item, { slug: 'capture-notes', name: 'Notes', description: 'Notes you created in your library.', sourceType: 'capture', group: 'Captures', signals: ['Notes'], confidence: 0.66, reason: 'Saved as a note.' });
    else add(item, { slug: 'capture-links', name: 'Links', description: 'Web pages and links saved to your library.', sourceType: 'capture', group: 'Captures', signals: ['Links'], confidence: 0.55, reason: 'Saved as a web page.' });
    for (const label of unique([...item.analysisTags, ...item.keywords], 12)) {
      const slug = slugify(label);
      if (slug) add(item, { slug: `topic-${slug}`, name: label, description: `Saves related to ${label}.`, sourceType: 'topic', group: 'Topics', signals: [label], confidence: 0.74, reason: `Existing analysis identified ${label}.` });
    }
    for (const [kind, group, labels] of [
      ['brand', 'Brands', item.brands], ['tool', 'Tools', item.tools],
      ['person', 'People', item.people], ['repository', 'Repositories', item.repositories],
    ] as const) {
      for (const label of unique(labels, 5)) {
        const slug = slugify(label);
        if (slug) add(item, {
          slug: `${kind}-${slug}`, name: label, description: `Saved items linked to the ${kind} label ${label}.`,
          sourceType: 'entity', group, signals: [label], confidence: 0.86,
          reason: `Existing media analysis labeled ${label} as a ${kind}.`,
        });
      }
    }
    if (item.platform && !/^iscraper/i.test(item.platform)) {
      const slug = slugify(item.platform);
      if (slug) add(item, { slug: `platform-${slug}`, name: `${item.platform} saves`, description: `Everything saved from ${item.platform}.`, sourceType: 'platform', group: 'Sources', signals: [item.platform], confidence: 0.55, reason: `Saved from ${item.platform}.` });
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.items.size - left.items.size || left.name.localeCompare(right.name))
}

interface Cursor { owner: string; collection: string; search: string; offset: number }
function encodeCursor(cursor: Cursor): string { return Buffer.from(JSON.stringify(cursor)).toString('base64url'); }
function decodeCursor(value: string, expected: Omit<Cursor, 'offset'>): number | null {
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    return cursor.owner === expected.owner && cursor.collection === expected.collection && cursor.search === expected.search && Number.isSafeInteger(cursor.offset) && cursor.offset >= 0 ? cursor.offset : null;
  } catch { return null; }
}

export class SmartCollectionError extends Error {
  constructor(public readonly code: 'not_found' | 'invalid_cursor', message: string) { super(message); }
}

export function createSmartCollectionService(database: DatabaseHandle) {
  async function loadItems(ownerId: string, itemIds?: string[]): Promise<{ items: SmartItem[]; truncated: boolean }> {
    if (itemIds?.length === 0) return { items: [], truncated: false };
    const selection = itemIds ? `AND saved_items.id IN (${itemIds.map(() => '?').join(',')})` : '';
    const rows = await database.prepare(`SELECT saved_items.id,
        COALESCE(saved_items.title_override,saved_items.title) AS title,
        COALESCE(saved_items.description_override,saved_items.description,'') AS description,
        saved_items.original_url AS url, saved_items.status, saved_items.item_kind, saved_items.source_platform,
        saved_items.created_at, saved_items.source_metadata_json, LEFT(COALESCE(extracted_artifacts.text_content,''),2000) AS text_content,
        LEFT(COALESCE(notes.body,''),2000) AS note_body,
        (SELECT LEFT(COALESCE(analysis.summary,'') || ' ' || COALESCE(analysis.visual_description,'') || ' '
            || COALESCE(analysis.ocr_text,'') || ' ' || COALESCE(analysis.transcript,''),2000)
          FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
          ORDER BY analysis.generation DESC LIMIT 1) AS analysis_text,
        (SELECT analysis.tags_json FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id
          AND analysis.item_id=saved_items.id ORDER BY analysis.generation DESC LIMIT 1) AS analysis_tags_json,
        (SELECT analysis.keywords_json FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id
          AND analysis.item_id=saved_items.id ORDER BY analysis.generation DESC LIMIT 1) AS keywords_json,
        (SELECT analysis.brands_json FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id
          AND analysis.item_id=saved_items.id ORDER BY analysis.generation DESC LIMIT 1) AS brands_json,
        (SELECT analysis.tools_json FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id
          AND analysis.item_id=saved_items.id ORDER BY analysis.generation DESC LIMIT 1) AS tools_json,
        (SELECT analysis.people_json FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id
          AND analysis.item_id=saved_items.id ORDER BY analysis.generation DESC LIMIT 1) AS people_json,
        (SELECT analysis.repositories_json FROM ai_analysis_results analysis WHERE analysis.owner_id=saved_items.owner_id
          AND analysis.item_id=saved_items.id ORDER BY analysis.generation DESC LIMIT 1) AS repositories_json,
        COALESCE((SELECT CASE WHEN pause.pause_cause IS NOT NULL THEN 'paused'
            WHEN job.status IN ('partial','failed','retry_wait','cancel_requested','cancelled') THEN job.status
            WHEN job.status='completed' THEN 'ready' ELSE saved_items.status END
          FROM processing_jobs job LEFT JOIN job_pause_states pause ON pause.job_id=job.id AND pause.owner_id=job.owner_id
          WHERE job.owner_id=saved_items.owner_id AND job.item_id=saved_items.id
          ORDER BY job.generation DESC LIMIT 1), saved_items.status) AS effective_status
      FROM saved_items
      LEFT JOIN extracted_artifacts ON extracted_artifacts.owner_id=saved_items.owner_id AND extracted_artifacts.item_id=saved_items.id
      LEFT JOIN notes ON notes.owner_id=saved_items.owner_id AND notes.item_id=saved_items.id
      WHERE saved_items.owner_id=? ${selection} ORDER BY saved_items.created_at DESC, saved_items.id DESC LIMIT ?`).all(ownerId, ...(itemIds ?? []), ITEM_SCAN_LIMIT) as DbItemRow[];
    if (!rows.length) return { items: [], truncated: false };
    const ids = rows.map((row) => String(row.id));
    const marks = ids.map(() => '?').join(',');
    const tagRows = await database.prepare(`SELECT item_tags.item_id, tags.display_name AS name FROM item_tags
        JOIN tags ON tags.owner_id=item_tags.owner_id AND tags.id=item_tags.tag_id
        WHERE item_tags.owner_id=? AND item_tags.item_id IN (${marks})`).all(ownerId, ...ids) as Array<{ item_id: string; name: string }>;
    const tagMap = new Map<string, string[]>();
    for (const row of tagRows) tagMap.set(row.item_id, [...(tagMap.get(row.item_id) ?? []), row.name]);
    const importedRows = await database.prepare(`SELECT item_id,source_platform,source_metadata_json FROM import_entries
      WHERE owner_id=? AND item_id IN (${marks}) AND status<>'failed'`).all(ownerId, ...ids) as Array<{ item_id: string; source_platform: string; source_metadata_json: string }>;
    const importedCollections = new Map<string, Array<{ platform: string; name: string }>>();
    for (const imported of importedRows) {
      const metadata = safeMetadata(imported.source_metadata_json);
      const collections = strings(metadata.collections).map((name) => ({ platform: imported.source_platform, name }));
      importedCollections.set(imported.item_id, [...(importedCollections.get(imported.item_id) ?? []), ...collections]);
    }
    return { items: rows.map((row) => {
      const item = toSmartItem(row, tagMap.get(String(row.id)) ?? []);
      item.sourceCollections = [...item.sourceCollections, ...(importedCollections.get(item.id) ?? [])];
      return item;
    }), truncated: rows.length >= ITEM_SCAN_LIMIT };
  }

  async function generate(ownerId: string) {
    const loaded = await loadItems(ownerId);
    const allCandidates = candidatesFrom(loaded.items);
    const candidates = allCandidates.filter((candidate) => candidate.items.size >= (candidate.folderGroup.endsWith(' collections') ? 1 : MIN_MATCHES))
      .sort((left, right) => Number(right.folderGroup.endsWith(' collections')) - Number(left.folderGroup.endsWith(' collections')) || right.items.size - left.items.size || left.name.localeCompare(right.name))
      .slice(0, MAX_COLLECTIONS);
    const candidateBySlug = new Map(allCandidates.map((candidate) => [candidate.slug, candidate]));
    const now = new Date().toISOString();
    for (const candidate of candidates) {
      const metadata = JSON.stringify({ generatedName: candidate.name, folderGroup: candidate.folderGroup, matchSignals: unique([...candidate.matchSignals]) });
      await database.prepare(`INSERT INTO smart_collections (id,owner_id,slug,name,description,source_type,generation_metadata,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,slug) DO UPDATE SET description=EXCLUDED.description,
          source_type=EXCLUDED.source_type,generation_metadata=EXCLUDED.generation_metadata,updated_at=EXCLUDED.updated_at`)
        .run(randomUUID(), ownerId, candidate.slug, candidate.name, candidate.description, candidate.sourceType, metadata, now, now);
    }
    const records = await database.prepare(`SELECT id,owner_id,slug,name,description,source_type,pinned,hidden,folder_color,generation_metadata,created_at,updated_at
      FROM smart_collections WHERE owner_id=? AND source_type<>'collection'`).all(ownerId) as CollectionRow[];
    const result = records.map((record) => {
      const metadata = safeMetadata(record.generation_metadata);
      const candidate = candidateBySlug.get(record.slug) ?? {
        slug: record.slug, name: record.name, description: record.description, sourceType: record.source_type,
        folderGroup: typeof metadata.folderGroup === 'string' ? metadata.folderGroup : 'Smart folders',
        matchSignals: new Set(strings(metadata.matchSignals)), items: new Map<string, CandidateItem>(),
      };
      const matches = [...candidate.items.values()].sort((left, right) => right.confidence - left.confidence || right.item.createdAt.localeCompare(left.item.createdAt));
      return {
        id: record.id, slug: record.slug, name: record.name, description: record.description,
        sourceType: record.source_type, pinned: Boolean(record.pinned), hidden: Boolean(record.hidden), color: record.folder_color,
        folderGroup: typeof metadata.folderGroup === 'string' ? metadata.folderGroup : 'Smart folders',
        matchSignals: unique([...strings(metadata.matchSignals), ...matches.slice(0, 6).map((entry) => entry.reason)], 8),
        itemCount: matches.length, previewItems: matches.slice(0, 3).map(({ item }) => item),
        createdAt: record.created_at, updatedAt: record.updated_at, matchedItems: matches,
      };
    });
    result.sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.itemCount - left.itemCount || right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name));
    return { candidates: result, truncated: loaded.truncated };
  }

  async function refreshState(ownerId: string) {
    const state = await database.prepare('SELECT revision,built_revision,lease_token,generated_at,truncated,failed FROM smart_collection_refresh_state WHERE owner_id=?').get<RefreshState>(ownerId);
    const pending = !state || Number(state.revision) > Number(state.built_revision);
    return {
      generatedAt: state?.generated_at ?? null,
      truncated: Boolean(state?.truncated),
      refresh: {
        status: !pending ? 'ready' as const : state?.failed ? 'failed' as const : state?.lease_token ? 'updating' as const : 'pending' as const,
        hasSnapshot: Boolean(state?.generated_at),
      },
    };
  }

  async function storedMatches(ownerId: string, collectionId?: string): Promise<StoredMatch[]> {
    return database.prepare(`SELECT keys.collection_id, keys.item_id,
      CASE WHEN correction.action='include' THEN 1 ELSE COALESCE(member.confidence,0) END AS confidence,
      COALESCE(correction.reason,member.reason,'') AS reason, correction.action AS override_action, item.created_at
      FROM (SELECT collection_id,item_id FROM smart_collection_memberships WHERE owner_id=?
        UNION SELECT collection_id,item_id FROM smart_collection_item_overrides WHERE owner_id=?) keys
      JOIN saved_items item ON item.owner_id=? AND item.id=keys.item_id
      LEFT JOIN smart_collection_memberships member ON member.owner_id=item.owner_id AND member.collection_id=keys.collection_id AND member.item_id=keys.item_id
      LEFT JOIN smart_collection_item_overrides correction ON correction.owner_id=item.owner_id AND correction.collection_id=keys.collection_id AND correction.item_id=keys.item_id
      ${collectionId ? 'WHERE keys.collection_id=?' : ''}
      ORDER BY confidence DESC, item.created_at DESC, item.id DESC`).all<StoredMatch>(ownerId, ownerId, ownerId, ...(collectionId ? [collectionId] : []));
  }

  return {
    async requestRefresh(ownerId: string) {
      await database.prepare(`INSERT INTO smart_collection_refresh_state(owner_id) VALUES (?)
        ON CONFLICT(owner_id) DO UPDATE SET revision=smart_collection_refresh_state.revision+1,
        available_at=CURRENT_TIMESTAMP, failed=FALSE`).run(ownerId);
    },
    async processNextRefresh(ownerId?: string) {
      const token = randomUUID();
      const now = new Date();
      const claim = await database.prepare(`UPDATE smart_collection_refresh_state SET lease_token=?,lease_expires_at=?,attempts=attempts+1,failed=FALSE
        WHERE owner_id=(SELECT owner_id FROM smart_collection_refresh_state
          WHERE revision>built_revision AND available_at<=? AND (lease_token IS NULL OR lease_expires_at<=?)
          ${ownerId ? 'AND owner_id=?' : ''} ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING owner_id,revision`).get<{ owner_id: string; revision: string | number }>(token, new Date(now.getTime() + 5 * 60_000).toISOString(), now.toISOString(), now.toISOString(), ...(ownerId ? [ownerId] : []));
      if (!claim) return null;
      try {
        await database.transaction(async () => {
          const snapshot = await generate(claim.owner_id);
          const current = await database.prepare('SELECT 1 FROM smart_collection_refresh_state WHERE owner_id=? AND lease_token=? FOR UPDATE').get(claim.owner_id, token);
          if (!current) throw new Error('smart_collection_lease_lost');
          await database.prepare('DELETE FROM smart_collection_memberships WHERE owner_id=?').run(claim.owner_id);
          const rows = snapshot.candidates.flatMap((collection) => collection.matchedItems.map(({ item, confidence, reason }) => ({ collection_id: collection.id, item_id: item.id, confidence, reason })));
          for (let start = 0; start < rows.length; start += 1000) {
            await database.prepare(`INSERT INTO smart_collection_memberships(owner_id,collection_id,item_id,confidence,reason)
              SELECT ?,collection_id,item_id,confidence,reason FROM jsonb_to_recordset(?::jsonb)
              AS entry(collection_id TEXT,item_id TEXT,confidence DOUBLE PRECISION,reason TEXT)`).run(claim.owner_id, JSON.stringify(rows.slice(start, start + 1000)));
          }
          await database.prepare(`UPDATE smart_collection_refresh_state SET built_revision=?,generated_at=?,truncated=?,
            lease_token=NULL,lease_expires_at=NULL,failed=FALSE WHERE owner_id=? AND lease_token=?`)
            .run(claim.revision, new Date().toISOString(), snapshot.truncated, claim.owner_id, token);
        })();
        return claim.owner_id;
      } catch (error) {
        await database.prepare(`UPDATE smart_collection_refresh_state SET lease_token=NULL,lease_expires_at=NULL,failed=TRUE,
          available_at=? WHERE owner_id=? AND lease_token=?`).run(new Date(Date.now() + 30_000).toISOString(), claim.owner_id, token);
        throw error;
      }
    },
    async list(ownerId: string, includeHidden = false) {
      const state = await refreshState(ownerId);
      const records = await database.prepare(`SELECT id,owner_id,slug,name,description,source_type,pinned,hidden,folder_color,generation_metadata,created_at,updated_at
        FROM smart_collections WHERE owner_id=? AND source_type<>'collection' ${includeHidden ? '' : 'AND hidden=FALSE'}`).all<CollectionRow>(ownerId);
      const matches = await storedMatches(ownerId);
      const byCollection = new Map<string, StoredMatch[]>();
      for (const match of matches) {
        if (match.override_action === 'exclude') continue;
        const group = byCollection.get(match.collection_id) ?? [];
        group.push(match); byCollection.set(match.collection_id, group);
      }
      const previewIds = [...new Set(records.flatMap((record) => (byCollection.get(record.id) ?? []).slice(0, 3).map((match) => match.item_id)))];
      const previews = new Map((await loadItems(ownerId, previewIds)).items.map((item) => [item.id, item]));
      const collections = records.map((record) => {
        const metadata = safeMetadata(record.generation_metadata);
        const active = byCollection.get(record.id) ?? [];
        return {
          id: record.id, slug: record.slug, name: record.name, description: record.description, sourceType: record.source_type,
          pinned: Boolean(record.pinned), hidden: Boolean(record.hidden), color: record.folder_color,
          folderGroup: typeof metadata.folderGroup === 'string' ? metadata.folderGroup : 'Smart folders',
          matchSignals: strings(metadata.matchSignals), itemCount: active.length,
          previewItems: active.slice(0, 3).flatMap((match) => { const item = previews.get(match.item_id); return item ? [item] : []; }),
          createdAt: record.created_at, updatedAt: record.updated_at,
        };
      });
      collections.sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.itemCount - left.itemCount || left.name.localeCompare(right.name));
      return { collections, ...state };
    },
    async listItems(ownerId: string, collectionId: string, search: string, limit: number, rawCursor?: string) {
      const collection = await database.prepare('SELECT id,name,description FROM smart_collections WHERE owner_id=? AND id=?').get<{ id: string; name: string; description: string }>(ownerId, collectionId);
      if (!collection) throw new SmartCollectionError('not_found', 'Smart collection not found.');
      const state = await refreshState(ownerId);
      const fingerprint = search.trim().toLowerCase();
      const expected = { owner: ownerId, collection: collectionId, search: fingerprint };
      const offset = rawCursor ? decodeCursor(rawCursor, expected) : 0;
      if (offset === null) throw new SmartCollectionError('invalid_cursor', 'Restart this smart collection after changing its search.');
      let matches = await storedMatches(ownerId, collectionId);
      let items = new Map<string, SmartItem>();
      if (fingerprint) {
        items = new Map((await loadItems(ownerId, [...new Set(matches.map((match) => match.item_id))])).items.map((item) => [item.id, item]));
        matches = matches.filter((match) => { const item = items.get(match.item_id); return item && matchesSearch(item, fingerprint); });
      }
      const filtered = matches.filter((match) => match.override_action !== 'exclude');
      const excluded = matches.filter((match) => match.override_action === 'exclude').sort((left, right) => right.created_at.localeCompare(left.created_at));
      const page = filtered.slice(offset, offset + limit);
      const excludedPage = excluded.slice(0, limit);
      if (!fingerprint) items = new Map((await loadItems(ownerId, [...new Set([...page, ...excludedPage].map((match) => match.item_id))])).items.map((item) => [item.id, item]));
      const serialize = (match: StoredMatch) => { const item = items.get(match.item_id); return item ? [{ ...item, matchConfidence: match.confidence, matchReason: match.reason, overrideAction: match.override_action }] : []; };
      const nextCursor = offset + page.length < filtered.length ? encodeCursor({ ...expected, offset: offset + page.length }) : null;
      return {
        collection: { id: collection.id, name: collection.name, description: collection.description, itemCount: filtered.length },
        items: page.flatMap(serialize), excludedItems: excludedPage.flatMap(serialize),
        excludedHasMore: excluded.length > limit, nextCursor, hasMore: nextCursor !== null, ...state,
      };
    },
    async update(ownerId: string, collectionId: string, input: { name?: string; pinned?: boolean; hidden?: boolean; color?: string | null }) {
      const fields: string[] = []; const values: unknown[] = [];
      if (input.name !== undefined) { fields.push('name=?'); values.push(input.name.trim()); }
      if (input.pinned !== undefined) { fields.push('pinned=?'); values.push(input.pinned); }
      if (input.hidden !== undefined) { fields.push('hidden=?'); values.push(input.hidden); }
      if (input.color !== undefined) { fields.push('folder_color=?'); values.push(input.color); }
      if (!fields.length) throw new SmartCollectionError('not_found', 'No smart collection changes were provided.');
      fields.push('updated_at=?'); values.push(new Date().toISOString(), ownerId, collectionId);
      const result = await database.prepare(`UPDATE smart_collections SET ${fields.join(',')} WHERE owner_id=? AND id=?`).run(...values);
      if (!result.changes) throw new SmartCollectionError('not_found', 'Smart collection not found.');
      return (await this.list(ownerId, true)).collections.find((entry) => entry.id === collectionId);
    },
    async setItemOverride(ownerId: string, collectionId: string, itemId: string, action: 'include' | 'exclude' | 'reset') {
      if (!await database.prepare('SELECT 1 FROM smart_collections WHERE owner_id=? AND id=?').get(ownerId, collectionId)
        || !await database.prepare('SELECT 1 FROM saved_items WHERE owner_id=? AND id=?').get(ownerId, itemId)) throw new SmartCollectionError('not_found', 'Smart collection or saved item not found.');
      if (action === 'reset') await database.prepare('DELETE FROM smart_collection_item_overrides WHERE owner_id=? AND collection_id=? AND item_id=?').run(ownerId, collectionId, itemId);
      else await database.prepare(`INSERT INTO smart_collection_item_overrides (owner_id,collection_id,item_id,action,reason,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_id,collection_id,item_id) DO UPDATE SET action=EXCLUDED.action,reason=EXCLUDED.reason,updated_at=EXCLUDED.updated_at`)
        .run(ownerId, collectionId, itemId, action, action === 'include' ? 'Added by you.' : 'Hidden by you.', new Date().toISOString(), new Date().toISOString());
      return this.listItems(ownerId, collectionId, '', 100);
    },
  };
}
