import type { DatabaseHandle } from '../db/database.js';

const ITEM_LIMIT = 200;
const CONCEPT_LIMIT = 80;
const GROUP_ITEM_LIMIT = 25;
const LINK_LIMIT = 1_000;

type ItemRow = { id: string; title: string; url: string; status: string; created_at: string; keywords_json: string | null; tags_json: string | null; brands_json: string | null; tools_json: string | null; people_json: string | null; repositories_json: string | null };
type ConceptType = 'topic' | 'domain' | 'brand' | 'tool' | 'person' | 'repository';
type GraphItem = { id: string; title: string; status: string; createdAt: string };
type GraphConcept = { id: string; type: ConceptType; label: string; itemCount: number; items: GraphItem[] };

function stringsFromJson(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, 12) : [];
  } catch { return []; }
}

function safeDomain(value: string): string | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return hostname.length <= 253 ? hostname : null;
  } catch { return null; }
}

function normalizeLabel(label: string): string {
  return label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function publicLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function buildKnowledgeGraph(input: {
  items: ItemRow[];
}) {
  const byItem = new Map<string, Map<string, { type: ConceptType; label: string }>>();
  const items = input.items.map((row): GraphItem => ({ id: row.id, title: row.title || 'Untitled save', status: row.status, createdAt: row.created_at }));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const add = (itemId: string, type: ConceptType, rawLabel: string) => {
    const label = publicLabel(rawLabel);
    const normalized = normalizeLabel(label);
    if (!label || !normalized) return;
    const concepts = byItem.get(itemId) ?? new Map<string, { type: ConceptType; label: string }>();
    concepts.set(`${type}:${normalized}`, { type, label });
    byItem.set(itemId, concepts);
  };

  for (const row of input.items) {
    const domain = safeDomain(row.url);
    if (domain) add(row.id, 'domain', domain);
    for (const label of stringsFromJson(row.tags_json)) add(row.id, 'topic', label);
    for (const label of stringsFromJson(row.keywords_json)) add(row.id, 'topic', label);
    for (const label of stringsFromJson(row.brands_json)) add(row.id, 'brand', label);
    for (const label of stringsFromJson(row.tools_json)) add(row.id, 'tool', label);
    for (const label of stringsFromJson(row.people_json)) add(row.id, 'person', label);
    for (const label of stringsFromJson(row.repositories_json)) add(row.id, 'repository', label);
  }

  const concepts = new Map<string, GraphConcept>();
  for (const [itemId, linked] of byItem) {
    const publicItem = itemById.get(itemId);
    if (!publicItem) continue;
    for (const [key, concept] of linked) {
      const id = `concept:${key}`;
      const node = concepts.get(id) ?? { id, type: concept.type, label: concept.label, itemCount: 0, items: [] };
      node.itemCount += 1;
      if (node.items.length < GROUP_ITEM_LIMIT) node.items.push(publicItem);
      concepts.set(id, node);
    }
  }

  const ranked = [...concepts.values()].sort((a, b) => b.itemCount - a.itemCount || a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  const visibleConcepts = ranked.slice(0, CONCEPT_LIMIT);
  const links = visibleConcepts.flatMap((concept) => concept.items.map((item) => ({
    id: `${item.id}:${concept.id}`, source: `item:${item.id}`, target: concept.id, type: concept.type,
  }))).slice(0, LINK_LIMIT);
  const nodes = [
    ...items.map((item) => ({ id: `item:${item.id}`, type: 'item' as const, label: item.title, itemId: item.id })),
    ...visibleConcepts.map(({ items: _items, ...concept }) => concept),
  ];
  return {
    nodes,
    links,
    groups: visibleConcepts,
    stats: { indexedItems: items.length, conceptNodes: visibleConcepts.length, links: links.length },
    truncated: input.items.length >= ITEM_LIMIT || ranked.length > CONCEPT_LIMIT || links.length >= LINK_LIMIT,
  };
}

export function createKnowledgeGraphRepository(database: DatabaseHandle) {
  return {
    async get(ownerId: string) {
      const items = await database.prepare(`SELECT saved_items.id,
          COALESCE(saved_items.title_override,saved_items.title) AS title,
          saved_items.original_url AS url, saved_items.status, saved_items.created_at,
          (SELECT analysis.keywords_json FROM ai_analysis_results analysis
            WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
            ORDER BY analysis.generation DESC LIMIT 1) AS keywords_json,
          (SELECT analysis.tags_json FROM ai_analysis_results analysis
            WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
            ORDER BY analysis.generation DESC LIMIT 1) AS tags_json,
          (SELECT analysis.brands_json FROM ai_analysis_results analysis
            WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
            ORDER BY analysis.generation DESC LIMIT 1) AS brands_json,
          (SELECT analysis.tools_json FROM ai_analysis_results analysis
            WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
            ORDER BY analysis.generation DESC LIMIT 1) AS tools_json,
          (SELECT analysis.people_json FROM ai_analysis_results analysis
            WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
            ORDER BY analysis.generation DESC LIMIT 1) AS people_json,
          (SELECT analysis.repositories_json FROM ai_analysis_results analysis
            WHERE analysis.owner_id=saved_items.owner_id AND analysis.item_id=saved_items.id
            ORDER BY analysis.generation DESC LIMIT 1) AS repositories_json
        FROM saved_items
        WHERE saved_items.owner_id=?
        ORDER BY saved_items.created_at DESC, saved_items.id DESC LIMIT ?`).all(ownerId, ITEM_LIMIT) as ItemRow[];
      return buildKnowledgeGraph({ items });
    },
  };
}
