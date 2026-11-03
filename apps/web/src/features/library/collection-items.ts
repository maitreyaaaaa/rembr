import type { SavedItem } from '../../app/contracts.js';

/** The collection API returns matching records, not hydrated library items. */
export interface CollectionItem {
  id: string;
  title: string;
  description: string;
  url: string;
  text: string;
  note: string;
  status: SavedItem['status'];
  kind: SavedItem['kind'];
  createdAt: string;
  tags: string[];
  matchConfidence: number;
  matchReason: string;
  overrideAction?: 'include' | 'exclude' | null;
}

export function collectionItemToSavedItem(item: CollectionItem): SavedItem {
  return {
    id: item.id,
    kind: item.kind,
    url: item.url,
    title: item.title,
    description: item.description,
    textPreview: item.text,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    errorCode: null,
    tags: item.tags.map((name) => ({ id: name, name })),
    ...(item.kind === 'note' ? { note: { body: item.note, links: [], assets: [] } } : {}),
  };
}
