import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ColorPicker } from './arc/color-picker/color-picker.js';
import type { ColorSwatch } from './arc/color-picker/color-picker.js';
import { SavedItemLink } from './SavedItemLink.js';
import { PortedLibraryGrid } from '../features/library/LibraryCards.js';
import type { SavedItem } from '../app/contracts.js';

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
interface SmartItem extends SavedItem { matchConfidence: number; matchReason: string; overrideAction?: 'include' | 'exclude' | null }
interface SmartCollection { id: string; slug: string; name: string; description: string; sourceType: string; pinned: boolean; hidden: boolean; color: string | null; folderGroup: string; matchSignals: string[]; itemCount: number; previewItems: SmartItem[] }
interface SmartCollectionList { collections: SmartCollection[]; truncated: boolean; generatedAt: string }
interface SmartCollectionItems { collection: { id: string; name: string; description: string; itemCount: number }; items: SmartItem[]; excludedItems: SmartItem[]; excludedHasMore: boolean; nextCursor: string | null; hasMore: boolean; truncated: boolean }
interface LibraryMatch { id: string; title: string; description: string; url: string }

export function SmartCollectionsPage({ request }: { request: Request }) {
  const { collectionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<SmartCollectionList | null>(null);
  const [detail, setDetail] = useState<SmartCollectionItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [renamingId, setRenamingId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryMatches, setLibraryMatches] = useState<LibraryMatch[]>([]);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [librarySearched, setLibrarySearched] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [includedIds, setIncludedIds] = useState<Set<string>>(() => new Set());
  const [groupSearchDraft, setGroupSearchDraft] = useState(searchParams.get('search') ?? '');
  const [includeHidden, setIncludeHidden] = useState(searchParams.get('hidden') === 'true');
  const search = searchParams.get('search') ?? '';
  const cursor = searchParams.get('cursor') ?? '';

  useEffect(() => {
    setLibraryMatches([]);
    setLibraryHasMore(false);
    setLibrarySearched(false);
    setLibraryQuery('');
    setIncludedIds(new Set());
  }, [collectionId]);

  useEffect(() => { setGroupSearchDraft(search); }, [collectionId, search]);

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError('');
    try {
      const result = refresh
        ? await request<SmartCollectionList>(`/api/smart-collections/refresh?includeHidden=${includeHidden}`, { method: 'POST' })
        : await request<SmartCollectionList>(`/api/smart-collections?includeHidden=${includeHidden}`);
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load smart collections.'); }
    finally { setLoading(false); }
  }, [includeHidden, request]);

  const loadItems = useCallback(async () => {
    if (!collectionId) { setDetail(null); return; }
    setLoading(true); setError(''); setLoadMoreError('');
    try {
      const query = new URLSearchParams({ search, limit: '25' });
      if (cursor) query.set('cursor', cursor);
      setDetail(await request<SmartCollectionItems>(`/api/smart-collections/${encodeURIComponent(collectionId)}/items?${query}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this smart collection.'); }
    finally { setLoading(false); }
  }, [collectionId, cursor, request, search]);

  const loadNextItems = useCallback(async () => {
    if (!collectionId || !detail?.hasMore || !detail.nextCursor || loadingMore) return;
    setLoadingMore(true); setLoadMoreError('');
    try {
      const query = new URLSearchParams({ search, limit: '25', cursor: detail.nextCursor });
      const next = await request<SmartCollectionItems>(`/api/smart-collections/${encodeURIComponent(collectionId)}/items?${query}`);
      setDetail((current) => current ? { ...next, items: [...current.items, ...next.items] } : next);
    } catch (cause) { setLoadMoreError(cause instanceof Error ? cause.message : 'Could not load more saves.'); }
    finally { setLoadingMore(false); }
  }, [collectionId, detail, loadingMore, request, search]);

  useEffect(() => { if (collectionId) void loadItems(); else void load(); }, [collectionId, load, loadItems]);

  async function updateCollection(collection: SmartCollection, update: { name?: string; pinned?: boolean; hidden?: boolean; color?: string | null }) {
    setBusy(true); setError('');
    try {
      await request(`/api/smart-collections/${encodeURIComponent(collection.id)}`, { method: 'PATCH', body: JSON.stringify(update) });
      await load();
      if (update.name !== undefined) setRenamingId('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this smart collection.'); }
    finally { setBusy(false); }
  }

  async function searchLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = libraryQuery.trim();
    if (!query) { setLibraryMatches([]); setLibrarySearched(false); return; }
    setLibraryMatches([]); setLibraryHasMore(false); setLibrarySearched(false);
    setLibraryLoading(true); setError('');
    try {
      const result = await request<{ items: LibraryMatch[]; hasMore: boolean }>(`/api/items?${new URLSearchParams({ search: query, sort: 'relevance', limit: '10' })}`);
      setLibraryMatches(result.items);
      setLibraryHasMore(result.hasMore);
      setLibrarySearched(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not search your library.'); }
    finally { setLibraryLoading(false); }
  }

  async function includeItem(item: LibraryMatch) {
    if (!collectionId) return;
    setBusy(true); setError('');
    try {
      await request(`/api/smart-collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(item.id)}/override`, { method: 'PUT', body: JSON.stringify({ action: 'include' }) });
      setIncludedIds((current) => new Set(current).add(item.id));
      await loadItems();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add this save to the group.'); }
    finally { setBusy(false); }
  }

  async function exclude(item: SmartItem) {
    if (!collectionId) return;
    setBusy(true); setError('');
    try {
      await request(`/api/smart-collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(item.id)}/override`, { method: 'PUT', body: JSON.stringify({ action: 'exclude' }) });
      await loadItems();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not correct this match.'); }
    finally { setBusy(false); }
  }

  async function resetOverride(item: SmartItem) {
    if (!collectionId) return;
    setBusy(true); setError('');
    try {
      await request(`/api/smart-collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(item.id)}/override`, { method: 'PUT', body: JSON.stringify({ action: 'reset' }) });
      setIncludedIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
      await loadItems();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not restore automatic grouping.'); }
    finally { setBusy(false); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    const value = groupSearchDraft.trim();
    if (value) next.set('search', value); else next.delete('search');
    next.delete('cursor'); setSearchParams(next, { replace: true });
  }
  function toggleHidden(value: boolean) {
    setIncludeHidden(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set('hidden', 'true'); else next.delete('hidden');
    setSearchParams(next, { replace: true });
  }
  if (collectionId) return <>
    <div className="phase2-back"><Link to="/app/smart-collections">← All smart collections</Link></div>
    {detail && <PageHeading title={detail.collection.name} description={detail.collection.description} actions={<span className="smart-collection-detail-count">{detail.collection.itemCount} saved {detail.collection.itemCount === 1 ? 'item' : 'items'}</span>} />}
    <section className="phase2-panel">
      <form className="phase2-filter-grid" onSubmit={submitSearch}><label>Search this group<input type="search" maxLength={120} value={groupSearchDraft} onChange={(event) => setGroupSearchDraft(event.target.value)} placeholder="Title, note, page text, or topic" /></label><button className="quiet-button" type="submit">Search group</button><div><p className="eyebrow">Matching saves</p><strong>{detail?.collection.itemCount ?? 0}</strong></div></form>
      <p className="phase2-helper">Matches are based on saved page text, your notes, existing tags, folders, and analysis. No new AI analysis is run.</p>
    </section>
    <section className="phase2-panel" aria-labelledby="add-save-heading">
      <h2 id="add-save-heading">Add a save to this group</h2>
      <form className="phase2-form" onSubmit={(event) => void searchLibrary(event)}>
        <label>Search your library<input type="search" maxLength={120} value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Find a page or note" /></label>
        <button className="quiet-button" type="submit" disabled={libraryLoading || !libraryQuery.trim()}>{libraryLoading ? 'Searching…' : 'Search library'}</button>
      </form>
      {libraryLoading && <p role="status" className="phase2-helper">Searching your library…</p>}
      {librarySearched && !libraryLoading && libraryMatches.length === 0 && <p role="status" className="phase2-helper">No matching saves found.</p>}
      {libraryMatches.length > 0 && <ul className="item-list" aria-label="Library search results">{libraryMatches.map((item) => <li className="item-card" key={item.id}><div className="item-main"><div className="item-info"><SavedItemLink className="item-title" itemId={item.id}>{item.title}</SavedItemLink><p className="item-description">{item.description || item.url}</p></div><div className="item-actions"><button className="quiet-button" type="button" aria-label={`${includedIds.has(item.id) ? 'Added to group' : 'Add to group'}: ${item.title}`} disabled={busy || includedIds.has(item.id)} onClick={() => void includeItem(item)}>{includedIds.has(item.id) ? 'Added' : 'Add to group'}</button></div></div></li>)}</ul>}
      {libraryHasMore && <p className="phase2-helper" role="status">Showing the first 10 results. Refine your search to narrow the list.</p>}
    </section>
    {error && <p className="notice error" role="alert">{error}</p>}
    {loading ? <div className="phase2-state" role="status">Loading smart collection…</div> : detail?.items.length ? <PortedLibraryGrid
      items={detail.items}
      searchActive={false}
      feedback={{}}
      onFeedback={() => undefined}
      onRemove={(card) => { const item = detail.items.find((entry) => entry.id === card.id); if (item) void exclude(item); }}
      removeLabel="Remove from folder"
      totalCount={search ? undefined : detail.collection.itemCount}
      showSort={false}
      hasMore={detail.hasMore}
      loadingMore={loadingMore}
      loadMoreError={loadMoreError}
      onLoadMore={() => void loadNextItems()}
    /> : !loading && <div className="empty-state"><h2>{search ? 'No saves match that search.' : 'No saves in this group yet.'}</h2><p>{search ? 'Try a broader phrase.' : 'This group updates as your library grows.'}</p></div>}
    {!loading && detail && detail.excludedItems.length > 0 && <section className="phase2-panel" aria-labelledby="excluded-saves-heading"><h2 id="excluded-saves-heading">Removed from this group</h2><p className="phase2-helper">You can restore any save to its automatic grouping. This keeps your earlier correction reversible.</p><ul className="item-list">{detail.excludedItems.map((item) => <li className="item-card" key={item.id}><div className="item-main"><div className="item-info"><SavedItemLink className="item-title" itemId={item.id}>{item.title}</SavedItemLink><p className="item-description">{item.description || item.matchReason}</p></div><div className="item-actions"><button className="quiet-button" type="button" disabled={busy} onClick={() => void resetOverride(item)}>Restore automatic match</button></div></div></li>)}</ul>{detail.excludedHasMore && <p className="phase2-helper" role="status">Showing the first {detail.excludedItems.length} removed saves. Refine your search to find another.</p>}</section>}
    {!loading && detail?.truncated && <p className="phase2-helper">This group is based on the latest library scan.</p>}
  </>;

  return <>
    <PageHeading title="Smart Collections" description="Groups that update from your saved pages, notes, topics, and existing analysis." actions={<button className="primary-button" type="button" disabled={loading || busy} onClick={() => void load(true)}>{loading ? 'Refreshing…' : 'Refresh groups'}</button>} />
    <section className="phase2-panel"><label className="phase2-check"><input type="checkbox" checked={includeHidden} onChange={(event) => toggleHidden(event.currentTarget.checked)} /><span>Show hidden groups</span></label><p className="phase2-helper">Generated on this service from existing library data. No provider key is required. Pin favorites or hide groups you do not use.</p>{data?.truncated && <p className="phase2-helper" role="status">The group suggestions use the latest {(2000).toLocaleString()} saved items.</p>}</section>
    {error && <div className="notice error phase2-retry-notice" role="alert"><span>{error}</span><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></div>}
    {loading && !data ? <div className="phase2-state" role="status">Building smart groups…</div> : data?.collections.length ? <div className="smart-collection-groups">{Object.entries(data.collections.reduce<Record<string, SmartCollection[]>>((groups, collection) => { (groups[collection.folderGroup] ??= []).push(collection); return groups; }, {})).map(([group, collections]) => <section className="phase2-panel" key={group}><h2>{group}</h2><ul className="phase2-collection-grid">{collections.map((collection) => <SmartCollectionCard key={collection.id} collection={collection} busy={busy} renaming={renamingId === collection.id} renameValue={renameValue} onRenameValueChange={setRenameValue} onRename={() => { setRenamingId(collection.id); setRenameValue(collection.name); }} onRenameCancel={() => setRenamingId('')} onRenameSave={(name) => updateCollection(collection, { name })} onPin={() => void updateCollection(collection, { pinned: !collection.pinned })} onColorSave={(color) => updateCollection(collection, { color })} onDelete={() => { if (window.confirm(`Delete “${collection.name}”? Its saved items will remain in your library. You can restore the folder with Show hidden groups.`)) void updateCollection(collection, { hidden: true }); }} onRestore={() => updateCollection(collection, { hidden: false })} />)}</ul></section>)}</div> : !loading && <div className="empty-state"><h2>Your smart groups will appear here.</h2><p>Save more pages, add notes or topics, and Rembr will group related items using rules that work without AI.</p></div>}
    {data && <p className="phase2-helper">Updated {new Date(data.generatedAt).toLocaleString()} · Groups update when opened or refreshed.</p>}
  </>;
}

const defaultFolderColor = '#adff00';
const folderColorSwatches: ColorSwatch[] = [
  { id: 'lime', color: '#ADFF00' }, { id: 'orange', color: '#FF6A00' },
  { id: 'cyan', color: '#27E5C2' }, { id: 'blue', color: '#528BFF' },
  { id: 'purple', color: '#A98AFF' }, { id: 'pink', color: '#FF78B7' },
];

function SmartCollectionCard({ collection, busy, renaming, renameValue, onRenameValueChange, onRename, onRenameCancel, onRenameSave, onPin, onColorSave, onDelete, onRestore }: {
  collection: SmartCollection;
  busy: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRename: () => void;
  onRenameCancel: () => void;
  onRenameSave: (name: string) => Promise<void>;
  onPin: () => void;
  onColorSave: (color: string | null) => Promise<void>;
  onDelete: () => void;
  onRestore: () => Promise<void>;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [colorDraft, setColorDraft] = useState(collection.color ?? defaultFolderColor);
  const folderStyle = { '--smart-folder-color': collection.color ?? defaultFolderColor } as CSSProperties;

  return <li className="smart-folder-card" style={folderStyle}>
    <div className="smart-folder-toolbar">
      <details className="phase2-card-menu smart-folder-menu">
        <summary aria-label={`Folder options for ${collection.name}`}><EllipsisVertical size={18} aria-hidden="true" /></summary>
        <div className="phase2-card-menu-items">
          <button className="smart-folder-menu-action" type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setColorDraft(collection.color ?? defaultFolderColor); setColorOpen((open) => !open); }}>Change color</button>
          <button className="smart-folder-menu-action" type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onRename(); }}>Rename</button>
          <button className="smart-folder-menu-action" type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onPin(); }}>{collection.pinned ? 'Unpin folder' : 'Pin folder'}</button>
          {collection.hidden
            ? <button className="smart-folder-menu-action" type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void onRestore(); }}>Restore folder</button>
            : <button className="smart-folder-menu-action" type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onDelete(); }}>Delete folder</button>}
        </div>
      </details>
    </div>
    {colorOpen && <div className="smart-folder-color-editor"><ColorPicker label="Folder color" value={colorDraft} onValueChange={setColorDraft} background="#090b09" defaultSwatches={folderColorSwatches} className="smart-folder-color-picker" /><div className="smart-folder-color-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => { void onColorSave(colorDraft).then(() => setColorOpen(false)); }}>Save color</button><button className="quiet-button" type="button" disabled={busy} onClick={() => { void onColorSave(null).then(() => setColorOpen(false)); }}>Reset</button></div></div>}
    <Link className="smart-folder-link" to={`/app/smart-collections/${encodeURIComponent(collection.id)}`} aria-label={`Open ${collection.name}, ${collection.itemCount} saves`}><AnimatedFolderIllustration /></Link>
    {renaming ? <form className="phase2-form" onSubmit={(event) => { event.preventDefault(); const name = renameValue.trim(); if (name && name !== collection.name) void onRenameSave(name); else onRenameCancel(); }}><label>Folder name<input autoFocus maxLength={80} required value={renameValue} onChange={(event) => onRenameValueChange(event.target.value)} /></label><div className="phase2-card-actions"><button className="quiet-button" type="submit" disabled={busy || !renameValue.trim()}>Save name</button><button className="quiet-button" type="button" disabled={busy} onClick={onRenameCancel}>Cancel</button></div></form> : <h3><Link to={`/app/smart-collections/${encodeURIComponent(collection.id)}`}>{collection.name}</Link></h3>}
  </li>;
}

function AnimatedFolderIllustration() {
  return <span className="smart-folder-visual" aria-hidden="true">
    <span className="smart-folder-back" />
    <span className="smart-folder-papers">
      <span className="smart-folder-paper smart-folder-paper--left"><i /></span>
      <span className="smart-folder-paper smart-folder-paper--middle"><i /></span>
      <span className="smart-folder-paper smart-folder-paper--right"><i /></span>
    </span>
    <svg className="smart-folder-flap" viewBox="0 0 321 241" focusable="false">
      <path d="M0 25C0 11.1929 11.1929 0 25 0h111.084c6.96 0 13.605 2.90139 18.336 8.00608l23.66 25.52822c4.731 5.1047 11.376 8.0061 18.336 8.0061H296c13.807 0 25 11.1929 25 25V216c0 13.807-11.193 25-25 25H25C11.1929 241 0 229.807 0 216V25Z" />
    </svg>
  </span>;
}

function PageHeading({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="phase2-page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="phase2-heading-actions">{actions}</div>}</div>;
}
