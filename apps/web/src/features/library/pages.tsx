import type { KnowledgeGraph, LibraryAnswer, LibraryCheckup, SavedItem, VisualSearchPreference, VisualSearchResult, WebSearchResultView } from '../../app/contracts.js';
import { api, prepareVisualSearchImage } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SavedItemLink } from '../../components/SavedItemLink.js';
import { LibraryCardSkeletons, PortedLibraryGrid } from './LibraryCards.js';
import { RembrCheckupPanel } from './RembrCheckupPanel.js';
import { RembrKnowledgeGraphPanel } from '../knowledge/RembrKnowledgeGraphPanel.js';

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const visualSearchInputRef = useRef<HTMLInputElement>(null);
  const [visualSearchPreference, setVisualSearchPreference] = useState<VisualSearchPreference | null>(null);
  const [visualPreferenceError, setVisualPreferenceError] = useState(false);
  const [visualImage, setVisualImage] = useState<File | null>(null);
  const [visualPreview, setVisualPreview] = useState<string | null>(null);
  const [visualResult, setVisualResult] = useState<VisualSearchResult | null>(null);
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualError, setVisualError] = useState('');
  const [visualFeedback, setVisualFeedback] = useState<Record<string, 'helpful' | 'not_helpful'>>({});
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResultView | null>(null);
  const [libraryAnswer, setLibraryAnswer] = useState<LibraryAnswer | null>(null);
  const [webSearchBusy, setWebSearchBusy] = useState(false);
  const [webSearchError, setWebSearchError] = useState('');
  const [libraryAnswerError, setLibraryAnswerError] = useState('');
  const [items, setItems] = useState<SavedItem[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false); const [searchEventIds, setSearchEventIds] = useState<Record<string, string>>({}); const [searchFeedback, setSearchFeedback] = useState<Record<string, 'helpful' | 'not_helpful'>>({});
  const [loadingMore, setLoadingMore] = useState(false); const [loadMoreError, setLoadMoreError] = useState(''); const loadingMoreRef = useRef(false); const itemListGenerationRef = useRef(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const search = searchParams.get('search') ?? ''; const searchMode = searchParams.get('mode') === 'web' ? 'web' : 'saved'; const sort = searchParams.get('sort') ?? (search ? 'relevance' : 'created_desc');
  const query = useMemo(() => new URLSearchParams({ search, sort, limit: '20' }).toString(), [search, sort]);
  const load = useCallback(async () => { const generation = ++itemListGenerationRef.current; setLoading(true); setLoadingMore(false); setError(''); setSearchEventIds({}); setSearchFeedback({}); setItems([]); setNextCursor(null); setHasMore(false); setLoadMoreError(''); loadingMoreRef.current = false; try { const body = await api<{ items: SavedItem[]; nextCursor: string | null; hasMore: boolean; searchEventId: string | null }>(`/api/items?${query}`); if (generation !== itemListGenerationRef.current) return; setItems(body.items); setNextCursor(body.nextCursor); setHasMore(body.hasMore); if (body.searchEventId) setSearchEventIds(Object.fromEntries(body.items.map((item) => [item.id, body.searchEventId!]))); } catch (cause) { if (generation === itemListGenerationRef.current) setError(messageOf(cause, 'Could not load your library.')); } finally { if (generation === itemListGenerationRef.current) setLoading(false); } }, [query]);
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || !nextCursor) return;
    const generation = itemListGenerationRef.current;
    loadingMoreRef.current = true; setLoadingMore(true); setLoadMoreError('');
    try {
      const params = new URLSearchParams(query); params.set('cursor', nextCursor);
      const body = await api<{ items: SavedItem[]; nextCursor: string | null; hasMore: boolean; searchEventId: string | null }>(`/api/items?${params}`);
      if (generation !== itemListGenerationRef.current) return;
      setItems((current) => { const seen = new Set(current.map((item) => item.id)); return [...current, ...body.items.filter((item) => !seen.has(item.id))]; });
      if (body.searchEventId) setSearchEventIds((current) => ({ ...current, ...Object.fromEntries(body.items.map((item) => [item.id, body.searchEventId!])) }));
      setNextCursor(body.nextCursor); setHasMore(body.hasMore);
    } catch (cause) { if (generation === itemListGenerationRef.current) setLoadMoreError(messageOf(cause, 'Could not load more saved items.')); }
    finally { if (generation === itemListGenerationRef.current) { loadingMoreRef.current = false; setLoadingMore(false); } }
  }, [hasMore, nextCursor, query]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), search.trim() ? 300 : 0); return () => window.clearTimeout(timer); }, [load, search]);
  const loadVisualSearchPreference = useCallback(async () => {
    setVisualPreferenceError(false);
    try {
      const { preference } = await api<{ preference: VisualSearchPreference }>('/api/ai/visual-search-preferences');
      setVisualSearchPreference(preference);
    } catch {
      setVisualPreferenceError(true);
    }
  }, []);
  useEffect(() => { void loadVisualSearchPreference(); }, [loadVisualSearchPreference]);
  useEffect(() => () => { if (visualPreview) URL.revokeObjectURL(visualPreview); }, [visualPreview]);
  function updateSort(value: string) { const next = new URLSearchParams(searchParams); if (value === 'created_desc') next.delete('sort'); else next.set('sort', value); next.delete('cursor'); setSearchParams(next); }
  function setSearch(value: string) { setWebSearchResult(null); setLibraryAnswer(null); setWebSearchError(''); setLibraryAnswerError(''); const next = new URLSearchParams(searchParams); if (value) { next.set('search', value); if (!searchParams.has('sort')) next.set('sort', 'relevance'); } else { next.delete('search'); if (next.get('sort') === 'relevance') next.delete('sort'); } next.delete('cursor'); setSearchParams(next, { replace: true }); }
  async function remove(item: SavedItem) { if (!window.confirm(`Remove “${item.title}” and its child data from your library?`)) return; try { await api(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not remove item.')); } }
  async function rateSearchResult(item: SavedItem, rating: 'helpful' | 'not_helpful') { const searchEventId = searchEventIds[item.id]; if (!searchEventId) return; setError(''); try { await api('/api/search/feedback', { method: 'POST', body: JSON.stringify({ searchEventId, itemId: item.id, rating }) }); setSearchFeedback((current) => ({ ...current, [item.id]: rating })); } catch (cause) { setError(messageOf(cause, 'Could not save search feedback.')); } }
  function chooseVisualImage(file: File | undefined) {
    setVisualError(''); setVisualResult(null); setVisualFeedback({});
    if (!file) { setVisualImage(null); setVisualPreview(null); return; }
    setVisualImage(file); setVisualPreview(URL.createObjectURL(file));
  }
  async function searchByImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!visualImage) return;
    if (!visualSearchPreference?.enabled) { setVisualError('Enable image search in Settings before searching. Your selected image has not been sent.'); return; }
    if (!visualSearchPreference.providerAvailable) { setVisualError('Image search is temporarily unavailable. Your selected image has not been sent.'); return; }
    setVisualBusy(true); setVisualError(''); setVisualFeedback({});
    try {
      const image = await prepareVisualSearchImage(visualImage);
      const form = new FormData(); form.set('image', image, image.name);
      setVisualResult(await api<VisualSearchResult>('/api/visual-search', { method: 'POST', body: form }));
    } catch (cause) {
      setVisualError(cause instanceof Error && !('status' in cause)
        ? cause.message
        : messageOf(cause, 'Could not search your library with this image.'));
    }
    finally { setVisualBusy(false); }
  }
  async function searchWebAndLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visualImage) { await searchByImage(event); return; }
    if (webSearchBusy) return;
    const queryText = search.trim();
    if (!queryText) return;
    if (searchMode !== 'web') return;
    setWebSearchBusy(true); setWebSearchError(''); setLibraryAnswerError(''); setWebSearchResult(null); setLibraryAnswer(null);
    const [web, library] = await Promise.allSettled([
      api<WebSearchResultView>('/api/web-search', { method: 'POST', body: JSON.stringify({ query: queryText }) }),
      api<LibraryAnswer>('/api/knowledge/answer', { method: 'POST', body: JSON.stringify({ question: queryText }) }),
    ]);
    if (web.status === 'fulfilled') setWebSearchResult(web.value);
    else setWebSearchError(messageOf(web.reason, 'Web search could not be completed.'));
    if (library.status === 'fulfilled') setLibraryAnswer(library.value);
    else setLibraryAnswerError(messageOf(library.reason, 'Your saved library could not be searched.'));
    setWebSearchBusy(false);
  }
  async function rateVisualSearchResult(item: SavedItem, rating: 'helpful' | 'not_helpful') {
    if (!visualResult?.searchEventId) return;
    try {
      await api('/api/search/feedback', { method: 'POST', body: JSON.stringify({ searchEventId: visualResult.searchEventId, itemId: item.id, rating }) });
      setVisualFeedback((current) => ({ ...current, [item.id]: rating }));
    } catch (cause) { setVisualError(messageOf(cause, 'Could not save visual-search feedback.')); }
  }
  function selectSearchMode(mode: 'saved' | 'web') {
    const next = new URLSearchParams(searchParams);
    if (mode === 'saved') next.delete('mode'); else next.set('mode', mode);
    next.delete('cursor');
    setSearchParams(next);
    setWebSearchResult(null); setLibraryAnswer(null); setWebSearchError(''); setLibraryAnswerError('');
    if (mode !== 'saved') { chooseVisualImage(undefined); setVisualResult(null); }
  }
  function submitComposer(event: FormEvent<HTMLFormElement>) {
    if (searchMode === 'web') void searchWebAndLibrary(event);
    else event.preventDefault();
  }
  return <div className="library-page"><div className="phase2-page-heading"><div><h1>Your library</h1><p>Search saved pages and notes.</p></div></div>
    <section className="library-search-composer" aria-label="Search your library or the web">
      <form onSubmit={submitComposer}>
        <label className="visually-hidden" htmlFor="library-search-composer-input">Search your saved posts, links, and notes</label>
        <textarea id="library-search-composer-input" rows={1} maxLength={120} placeholder={searchMode === 'web' ? 'Search the web…' : 'Search your saved posts, links, and notes…'} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && ((event.ctrlKey || event.metaKey) || (searchMode === 'web' && !event.shiftKey))) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <div className="library-search-composer-controls">
          <input ref={visualSearchInputRef} className="visually-hidden visual-search-input" id="visual-search-image" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose an image to search your saved library" aria-describedby="visual-search-file-help" disabled={visualBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; chooseVisualImage(file); event.currentTarget.value = ''; if (file) { const next = new URLSearchParams(searchParams); next.delete('mode'); setSearchParams(next); } }} />
          <label className="library-search-add" htmlFor="visual-search-image" aria-label="Add an image to search your saved library"><Plus size={20} aria-hidden="true" /></label>
          <div className="library-search-mode" role="group" aria-label="Choose search mode">
            <button type="button" className={searchMode === 'saved' ? 'active' : ''} aria-pressed={searchMode === 'saved'} onClick={() => selectSearchMode('saved')}>Saved</button>
            <button type="button" className={searchMode === 'web' ? 'active' : ''} aria-pressed={searchMode === 'web'} onClick={() => { selectSearchMode('web'); setVisualResult(null); }}>AI + saved</button>
          </div>
          {searchMode === 'saved' && visualImage && <button className="primary-button library-search-submit" type="submit" disabled={visualBusy}>{visualBusy ? 'Searching…' : 'Find similar saves'}</button>}
          {searchMode === 'saved' && !visualImage && <span className="library-search-hint">Searches your library by keywords only</span>}
        </div>
      </form>
      {visualImage && <div className="visual-search-preview library-composer-preview"><img src={visualPreview ?? ''} alt="Selected image for private library search" /><div><span>{visualImage.name}</span><button className="phase2-text-button" type="button" disabled={visualBusy} onClick={() => chooseVisualImage(undefined)}>Remove image</button></div></div>}
      {visualSearchPreference && !visualSearchPreference.enabled && <p className="library-search-disclosure">Image search is off. <Link to="/app/settings/preferences">Review image-search consent</Link> to enable it.</p>}
      {visualSearchPreference?.enabled && !visualSearchPreference.providerAvailable && <p className="library-search-disclosure">Image search is temporarily unavailable; keyword search still works.</p>}
      <span className="visually-hidden" id="visual-search-file-help">PNG, JPEG, or WebP up to 8 MiB. The browser resizes it before upload. Image search only searches your saved library.</span>
      {visualPreferenceError && <p className="notice error" role="alert">Could not load image-search settings. <button className="phase2-text-button" type="button" onClick={() => void loadVisualSearchPreference()}>Try again</button></p>}
      {visualError && <p className="notice error" role="alert">{visualError}</p>}
      {visualBusy && <p className="phase2-state" role="status">Analyzing the selected image and searching your private library…</p>}
      {visualResult && <div className="visual-search-results" aria-live="polite"><p><strong>{visualResult.results.length} visual matches</strong></p>{visualResult.visualDescription && <p className="phase2-helper">Description used to find matches: {visualResult.visualDescription}</p>}{visualResult.results.length ? <ul className="phase2-manage-list">{visualResult.results.map((item) => <li key={item.id}><SavedItemLink itemId={item.id}>{item.title}</SavedItemLink><div className="phase2-card-actions"><button className="quiet-button" type="button" aria-label={`Mark ${item.title} helpful for this image search`} aria-pressed={visualFeedback[item.id] === 'helpful'} onClick={() => void rateVisualSearchResult(item, 'helpful')}>Helpful</button><button className="quiet-button" type="button" aria-label={`Mark ${item.title} not helpful for this image search`} aria-pressed={visualFeedback[item.id] === 'not_helpful'} onClick={() => void rateVisualSearchResult(item, 'not_helpful')}>Not helpful</button></div></li>)}</ul> : <p>No saved items matched the visual details. Try a different image or use text search.</p>}</div>}
    </section>
    {(webSearchError || libraryAnswerError) && <div className="notice error" role="alert"><span>{[webSearchError, libraryAnswerError].filter(Boolean).join(' ')}</span><button className="quiet-button" type="button" onClick={() => void searchWebAndLibrary({ preventDefault() {} } as FormEvent<HTMLFormElement>)}>Try again</button></div>}
    {webSearchBusy && <p className="phase2-state" role="status">Searching the web and your saved library…</p>}
    {webSearchResult && <section className="phase2-panel web-search-results" aria-labelledby="web-search-result-title"><h2 id="web-search-result-title">Web results for “{search}”</h2><p>{webSearchResult.summary}</p><h3>Web sources</h3><ul>{webSearchResult.citations.map((citation) => <li key={citation.url}><a href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a>{citation.snippet && <p>{citation.snippet}</p>}</li>)}</ul></section>}
    {libraryAnswer && <section className="phase2-panel web-search-results" aria-labelledby="library-answer-title"><h2 id="library-answer-title">From your saved library</h2><p>{libraryAnswer.answer}</p>{libraryAnswer.citations.length > 0 && <><h3>Saved sources</h3><ul>{libraryAnswer.citations.map((citation) => <li key={citation.id}><SavedItemLink itemId={citation.id}>{citation.title}</SavedItemLink>{citation.snippet && <p>{citation.snippet}</p>}</li>)}</ul></>}</section>}
    {searchMode === 'web' && search && <h2 className="library-saved-matches-heading">Saved keyword matches</h2>}
    {error && <div className="notice error phase2-retry-notice" role="alert"><span>{error}</span><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></div>}
    {loading ? <LibraryCardSkeletons count={Math.min(20, Math.max(4, Math.ceil((window.innerWidth - 100) / 320) * 2))} /> : items.length === 0 ? <div className="empty-state"><span>✳</span><h2>{searchMode === 'web' && search ? 'No saved items match these keywords.' : 'Your library is ready for its first save.'}</h2><p>{searchMode === 'web' && search ? 'Live public sources appear above when your web search is complete.' : 'Save a page or write a note to start building your library.'}</p><div className="phase2-heading-actions"><Link className="quiet-button" to="/app/notes/new" state={{ returnTo: `${location.pathname}${location.search}` }}>Write a note</Link><Link className="primary-button" to="/app/add">Save a page</Link></div></div> : <PortedLibraryGrid items={items} searchActive={Boolean(search)} sort={sort} onSortChange={updateSort} feedback={searchFeedback} onFeedback={rateSearchResult} onRemove={remove} hasMore={hasMore} loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={loadMore} />}
    {!loading && <span className="visually-hidden" aria-live="polite">{items.length} saved items loaded</span>}
  </div>;
}

export function KnowledgeGraphPage() {
  const navigate = useNavigate();
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exported, setExported] = useState(false);
  const [exportingObsidian, setExportingObsidian] = useState(false);
  const [obsidianExported, setObsidianExported] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setGraph((await api<{ graph: KnowledgeGraph }>('/api/knowledge/graph')).graph); }
    catch (cause) { setError(messageOf(cause, 'Could not load your knowledge graph.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function exportGraph() {
    if (!graph) return;
    const payload = {
      formatVersion: 1,
      product: 'Rembr',
      exportedAt: new Date().toISOString(),
      coverage: {
        indexedItems: graph.stats.indexedItems,
        conceptNodes: graph.stats.conceptNodes,
        links: graph.stats.links,
        complete: !graph.truncated,
        truncated: graph.truncated,
      },
      graph: { nodes: graph.nodes, links: graph.links, groups: graph.groups },
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `rembr-knowledge-graph-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    setExported(true);
    window.setTimeout(() => setExported(false), 1800);
  }
  async function exportObsidianGraph() {
    setExportingObsidian(true);
    setError('');
    try {
      const response = await fetch('/api/knowledge/graph/export/obsidian', { credentials: 'include' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
        if (response.status === 401 || response.status === 403) window.dispatchEvent(new CustomEvent('rembr:auth-error', { detail: { status: response.status, code: payload.error?.code ?? 'request_failed' } }));
        throw new Error(payload.error?.message ?? 'Could not export the Obsidian graph. Try again.');
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = 'rembr-obsidian-graph.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setObsidianExported(true);
      window.setTimeout(() => setObsidianExported(false), 1800);
    } catch (cause) {
      setError(messageOf(cause, 'Could not export the Obsidian graph. Try again.'));
    } finally {
      setExportingObsidian(false);
    }
  }

  return <RembrKnowledgeGraphPanel
    graph={graph}
    loading={loading}
    error={error}
    filter={filter}
    onFilterChange={setFilter}
    onRetry={() => void load()}
    onSelectItem={(itemId) => navigate(`/app/items/${encodeURIComponent(itemId)}`, { state: { returnTo: '/app/graph' } })}
    onExportJson={exportGraph}
    onExportObsidian={() => void exportObsidianGraph()}
    exportingObsidian={exportingObsidian}
    exported={exported}
    obsidianExported={obsidianExported}
  />;
}

export function LibraryCheckupPage() {
  const navigate = useNavigate();
  const [checkup, setCheckup] = useState<LibraryCheckup | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [error, setError] = useState('');
  const [reminderBusyId, setReminderBusyId] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setCheckup((await api<{ checkup: LibraryCheckup }>('/api/knowledge/checkup')).checkup); }
    catch (cause) { setError(messageOf(cause, 'Could not review your library.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function scheduleReminder(itemId: string, preset: 'tomorrow' | 'week' | 'month', note: string) {
    setReminderBusyId(itemId); setError('');
    try { await api('/api/knowledge/reminders', { method: 'POST', body: JSON.stringify({ itemId, preset, note }) }); await load(); }
    catch (cause) { setError(messageOf(cause, 'Could not set this reminder.')); }
    finally { setReminderBusyId(''); }
  }
  async function updateReminder(reminderId: string, status: 'done' | 'dismissed') {
    setReminderBusyId(reminderId); setError('');
    try { await api(`/api/knowledge/reminders/${encodeURIComponent(reminderId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (cause) { setError(messageOf(cause, 'Could not update this reminder.')); }
    finally { setReminderBusyId(''); }
  }
  async function checkLinks() {
    setCheckingLinks(true); setError('');
    try { await api('/api/knowledge/links/check', { method: 'POST', body: JSON.stringify({ limit: 10 }) }); await load(); }
    catch (cause) { setError(messageOf(cause, 'Could not check your saved links.')); }
    finally { setCheckingLinks(false); }
  }
  return <RembrCheckupPanel
    checkup={checkup}
    loading={loading}
    checkingLinks={checkingLinks}
    reminderBusyId={reminderBusyId}
    error={error}
    onRetry={() => void load()}
    onCheckLinks={() => void checkLinks()}
    onOpenItem={(itemId) => navigate(`/app/items/${encodeURIComponent(itemId)}`, { state: { returnTo: '/app/checkup' } })}
    onScheduleReminder={(itemId, preset, note) => void scheduleReminder(itemId, preset, note)}
    onUpdateReminder={(reminderId, status) => void updateReminder(reminderId, status)}
  />;
}
