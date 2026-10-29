import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import type { DatabaseHandle } from '../db/database.js';

export type ExportItem = {
  id: string;
  title: string;
  url: string;
  description: string;
  status: string;
  createdAt: string;
  note: string;
  summary: string;
  keywords: string[];
  analysisTags: string[];
  brands: string[];
  tools: string[];
  people: string[];
  repositories: string[];
};

export type ExportRelation = { itemId: string; id: string; name: string };

type ExportConcept = { id: string; type: 'tag' | 'collection' | 'topic' | 'domain' | 'brand' | 'tool' | 'person' | 'repository'; label: string; itemIds: string[] };

function safeFileName(value: string): string {
  return value.normalize('NFKC').replace(/[<>:"/\\|?*#^]/g, ' ').replace(/\p{Cc}/gu, ' ').replaceAll('[', ' ').replaceAll(']', ' ')
    .replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 80) || 'Untitled';
}

function fileStem(label: string, id: string): string {
  const suffix = createHash('sha256').update(id).digest('hex').slice(0, 10);
  return `${safeFileName(label)} -- ${suffix}`;
}

function wikiLink(path: string, label: string): string {
  return `[[${path.replaceAll('|', ' ')}|${label.replaceAll('[', ' ').replaceAll(']', ' ').replaceAll('|', ' ')}]]`;
}

function markdownUrl(value: string): string {
  return value.replace(/[()<>\s]/g, (character) => encodeURIComponent(character));
}

function listFromJson(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, 12) : [];
  } catch { return []; }
}

export function buildObsidianExport(items: ExportItem[], tags: ExportRelation[], collections: ExportRelation[]) {
  const itemIds = new Set(items.map((item) => item.id));
  const concepts = new Map<string, ExportConcept>();
  const conceptItems = new Map<string, Set<string>>();
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemConcepts = new Map<string, string[]>();
  const addConcept = (itemId: string, type: ExportConcept['type'], rawLabel: string) => {
    if (!itemIds.has(itemId)) return;
    const label = rawLabel.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!label) return;
    const key = `${type}:${label.toLocaleLowerCase()}`;
    const id = `concept:${key}`;
    const concept = concepts.get(id) ?? { id, type, label, itemIds: [] };
    const members = conceptItems.get(id) ?? new Set<string>();
    if (!members.has(itemId)) {
      concept.itemIds.push(itemId);
      members.add(itemId);
    }
    conceptItems.set(id, members);
    concepts.set(id, concept);
    const linked = itemConcepts.get(itemId) ?? [];
    if (!linked.includes(id)) linked.push(id);
    itemConcepts.set(itemId, linked);
  };

  for (const relation of tags) addConcept(relation.itemId, 'tag', relation.name);
  for (const relation of collections) addConcept(relation.itemId, 'collection', relation.name);
  for (const item of items) {
    try {
      const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, '');
      if (host) addConcept(item.id, 'domain', host);
    } catch { /* Keep malformed historical URLs in the item note, without a domain node. */ }
    for (const label of item.analysisTags) addConcept(item.id, 'topic', label);
    for (const label of item.keywords) addConcept(item.id, 'topic', label);
    for (const label of item.brands) addConcept(item.id, 'brand', label);
    for (const label of item.tools) addConcept(item.id, 'tool', label);
    for (const label of item.people) addConcept(item.id, 'person', label);
    for (const label of item.repositories) addConcept(item.id, 'repository', label);
  }

  const itemPaths = new Map(items.map((item) => [item.id, `IScraper Items/${fileStem(item.title, item.id)}`]));
  const conceptPaths = new Map([...concepts.values()].map((concept) => [concept.id, `IScraper Graph/${fileStem(concept.label, concept.id)}`]));
  const nodes = [
    ...items.map((item) => ({ id: `item:${item.id}`, type: 'item', itemId: item.id, label: item.title, url: item.url, status: item.status, createdAt: item.createdAt, description: item.description, note: item.note, summary: item.summary })),
    ...[...concepts.values()].map(({ id, type, label, itemIds: linkedItems }) => ({ id, type, label, itemCount: linkedItems.length, itemIds: linkedItems })),
  ];
  const links = [...concepts.values()].flatMap((concept) => concept.itemIds.map((itemId) => ({
    id: `item:${itemId}->${concept.id}`, source: `item:${itemId}`, target: concept.id, type: concept.type,
  })));
  const graph = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    stats: { indexedItems: items.length, conceptNodes: concepts.size, links: links.length },
    nodes,
    links,
  };

  const files: Array<{ path: string; content: string }> = [];
  for (const item of items) {
    const path = itemPaths.get(item.id)!;
    const relatedConcepts = (itemConcepts.get(item.id) ?? []).map((id) => concepts.get(id)!).sort((a, b) => a.label.localeCompare(b.label));
    files.push({
      path: `${path}.md`,
      content: [
        `# ${item.title.replace(/[\r\n]+/g, ' ')}`,
        '',
        `Status: ${item.status}`,
        `Saved: ${item.createdAt}`,
        `Source: <${markdownUrl(item.url)}>`,
        '',
        '## Description',
        item.description || 'No description available.',
        '',
        '## Summary',
        item.summary || 'No summary available.',
        '',
        '## Note',
        item.note || 'No user note.',
        '',
        '## Graph Links',
        relatedConcepts.length ? relatedConcepts.map((concept) => wikiLink(conceptPaths.get(concept.id)!, concept.label)).join(' ') : 'No graph links.',
        '',
      ].join('\n'),
    });
  }
  for (const concept of concepts.values()) {
    const linkedItems = concept.itemIds.map((id) => itemsById.get(id)!).sort((a, b) => a.title.localeCompare(b.title));
    files.push({
      path: `${conceptPaths.get(concept.id)!}.md`,
      content: [
        `# ${concept.label.replace(/[\r\n]+/g, ' ')}`,
        '',
        `Type: ${concept.type}`,
        `Linked saves: ${linkedItems.length}`,
        '',
        '## Saves',
        ...(linkedItems.length ? linkedItems.map((item) => `- ${wikiLink(itemPaths.get(item.id)!, item.title)}`) : ['No linked saves.']),
        '',
      ].join('\n'),
    });
  }
  files.push({ path: 'graph.json', content: JSON.stringify(graph, null, 2) });
  return { graph, files };
}

export function createObsidianExportRepository(database: DatabaseHandle) {
  return {
    async build(ownerId: string) {
      const rows = await database.prepare(`SELECT saved_items.id,
          COALESCE(saved_items.title_override,saved_items.title) AS title,
          saved_items.original_url AS url,
          COALESCE(saved_items.description_override,saved_items.description) AS description,
          saved_items.status, saved_items.created_at AS "createdAt",
          COALESCE(notes.body, '') AS note,
          COALESCE(analysis.summary, '') AS summary,
          analysis.keywords_json AS keywords_json, analysis.tags_json AS tags_json,
          analysis.brands_json AS brands_json, analysis.tools_json AS tools_json,
          analysis.people_json AS people_json, analysis.repositories_json AS repositories_json
        FROM saved_items
        LEFT JOIN notes ON notes.owner_id=saved_items.owner_id AND notes.item_id=saved_items.id
        LEFT JOIN LATERAL (
          SELECT summary, keywords_json, tags_json, brands_json, tools_json, people_json, repositories_json FROM ai_analysis_results
          WHERE owner_id=saved_items.owner_id AND item_id=saved_items.id
          ORDER BY generation DESC LIMIT 1
        ) analysis ON TRUE
        WHERE saved_items.owner_id=?
        ORDER BY saved_items.created_at, saved_items.id`).all(ownerId) as Array<Omit<ExportItem, 'keywords' | 'analysisTags' | 'brands' | 'tools' | 'people' | 'repositories'> & { keywords_json: string | null; tags_json: string | null; brands_json: string | null; tools_json: string | null; people_json: string | null; repositories_json: string | null }>;
      const items: ExportItem[] = rows.map((row) => ({ ...row, keywords: listFromJson(row.keywords_json), analysisTags: listFromJson(row.tags_json), brands: listFromJson(row.brands_json), tools: listFromJson(row.tools_json), people: listFromJson(row.people_json), repositories: listFromJson(row.repositories_json) }));
      const tagRelations: ExportRelation[] = [];
      const collectionRelations: ExportRelation[] = [];
      for (let offset = 0; offset < items.length; offset += 500) {
        const ids = items.slice(offset, offset + 500).map((item) => item.id);
        const marks = ids.map(() => '?').join(',');
        const [tagRows, collectionRows] = await Promise.all([
          database.prepare(`SELECT item_tags.item_id AS "itemId", tags.id, tags.display_name AS name FROM item_tags JOIN tags ON tags.owner_id=item_tags.owner_id AND tags.id=item_tags.tag_id WHERE item_tags.owner_id=? AND item_tags.item_id IN (${marks})`).all(ownerId, ...ids) as Promise<ExportRelation[]>,
          database.prepare(`SELECT collection_items.item_id AS "itemId", collections.id, collections.name FROM collection_items JOIN collections ON collections.owner_id=collection_items.owner_id AND collections.id=collection_items.collection_id WHERE collection_items.owner_id=? AND collection_items.item_id IN (${marks})`).all(ownerId, ...ids) as Promise<ExportRelation[]>,
        ]);
        tagRelations.push(...tagRows);
        collectionRelations.push(...collectionRows);
      }
      return buildObsidianExport(items, tagRelations, collectionRelations);
    },
    async zip(ownerId: string): Promise<Buffer> {
      const { files } = await this.build(ownerId);
      const archive = new JSZip();
      for (const file of files) archive.file(file.path, file.content);
      return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    },
  };
}
