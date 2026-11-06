import type { AiPreference, LibraryAnswer, SavedItem, SemanticSearchPreference, VisualSearchPreference, VisualSearchResult, WebSearchResultView } from '../../app/contracts.js';
import { AI_SEARCH_DISCLOSURE_VERSION, SEMANTIC_SEARCH_DISCLOSURE_VERSION, VISUAL_SEARCH_DISCLOSURE_VERSION } from '../../app/contracts.js';
import { api, prepareVisualSearchImage } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { SavedItemLink } from '../../components/SavedItemLink.js';
import { LibraryCardSkeletons, PortedLibraryGrid } from './LibraryCards.js';
import { LibrarySearchResults } from './LibrarySearchResults.js';
import { SelectedSavesQuestionPanel } from './SelectedSavesQuestionPanel.js';

function mentionItemType(item: SavedItem): string {
  if (item.kind === 'note') return 'Note';
  if (/instagram\.com\/(?:[^/]+\/)?reel\//i.test(item.url)) return 'Reel';
  if (item.media?.some((asset) => asset.mime?.startsWith('video/'))) return 'Video';
  return 'Post';
}

function mentionItemSource(item: SavedItem): string {
  try { return new URL(item.url).hostname.replace(/^www\./, ''); }
  catch { return item.kind === 'note' ? 'Rembr note' : 'Saved item'; }
}

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const visualSearchInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const mentionRequestRef = useRef(0);
  const [composerSources, setComposerSources] = useState<SavedItem[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<SavedItem[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [composerAnswer, setComposerAnswer] = useState<LibraryAnswer | null>(null);
  const [composerAnswerError, setComposerAnswerError] = useState('');
  const [composerAnswerBusy, setComposerAnswerBusy] = useState(false);
  const [visualSearchPreference, setVisualSearchPreference] = useState<VisualSearchPreference | null>(null);
  const [visualPreferenceError, setVisualPreferenceError] = useState(false);
  const [visualImage, setVisualImage] = useState<File | null>(null);
  const [visualPreview, setVisualPreview] = useState<string | null>(null);
  const [visualResult, setVisualResult] = useState<VisualSearchResult | null>(null);
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualError, setVisualError] = useState('');
  const [visualFeedback, setVisualFeedback] = useState<Record<string, 'helpful' | 'not_helpful'>>({});
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResultView | null>(null);
  const [semanticResults, setSemanticResults] = useState<SavedItem[]>([]);
  const [semanticSearchError, setSemanticSearchError] = useState('');
  const [libraryAnswer, setLibraryAnswer] = useState<LibraryAnswer | null>(null);
  const [webSearchBusy, setWebSearchBusy] = useState(false);
  const [webSearchError, setWebSearchError] = useState('');
  const [libraryAnswerError, setLibraryAnswerError] = useState('');
  const [answerSources, setAnswerSources] = useState<SavedItem[]>([]);
  const [answerQuestion, setAnswerQuestion] = useState('');
  const [answerBusy, setAnswerBusy] = useState(false);
  const [answerError, setAnswerError] = useState('');
  const [answerResult, setAnswerResult] = useState<LibraryAnswer | null>(null);
  const [aiPreference, setAiPreference] = useState<AiPreference | null>(null);
  const [semanticPreference, setSemanticPreference] = useState<SemanticSearchPreference | null>(null);
  const [semanticIndexBusy, setSemanticIndexBusy] = useState(false);
  const [semanticIndexStatus, setSemanticIndexStatus] = useState('');
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
  useEffect(() => {
    if (searchMode === 'web' && mentionQuery !== null) return;
    const timer = window.setTimeout(() => void load(), search.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, mentionQuery, search, searchMode]);
  useEffect(() => {
    if (mentionQuery === null || searchMode !== 'web') {
      setMentionSuggestions([]); setMentionLoading(false); return;
    }
    const requestId = ++mentionRequestRef.current;
    let active = true;
    const timer = window.setTimeout(() => {
      setMentionLoading(true);
      void api<{ items: SavedItem[] }>(`/api/items/suggestions?q=${encodeURIComponent(mentionQuery)}`)
        .then(({ items: results }) => {
          if (active && mentionRequestRef.current === requestId) {
            const selected = new Set(composerSources.map((item) => item.id));
            setMentionSuggestions(results.filter((item) => !selected.has(item.id)));
            setActiveMentionIndex(0);
          }
        })
        .catch(() => { if (active && mentionRequestRef.current === requestId) setMentionSuggestions([]); })
        .finally(() => { if (active && mentionRequestRef.current === requestId) setMentionLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [composerSources, mentionQuery, searchMode]);
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
  useEffect(() => {
    let active = true;
    void api<{ preference: AiPreference }>('/api/knowledge/ai-preferences')
      .then(({ preference }) => { if (active) setAiPreference(preference); })
      .catch(() => { if (active) setAiPreference(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void api<{ preference: SemanticSearchPreference }>('/api/semantic/preferences')
      .then(({ preference }) => { if (active) setSemanticPreference(preference); })
      .catch(() => { if (active) setSemanticPreference(null); });
    return () => { active = false; };
  }, []);
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
    if (visualSearchPreference && !visualSearchPreference.providerAvailable) { setVisualError('Image search is temporarily unavailable. Your selected image has not been sent.'); return; }
    setVisualBusy(true); setVisualError(''); setVisualFeedback({});
    try {
      if (!visualSearchPreference?.enabled) {
        const saved = await api<{ preference: VisualSearchPreference }>('/api/ai/visual-search-preferences', {
          method: 'PUT', body: JSON.stringify({ enabled: true, disclosureVersion: VISUAL_SEARCH_DISCLOSURE_VERSION }),
        });
        setVisualSearchPreference(saved.preference);
      }
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
  async function updateVisualSearchPreference(enabled: boolean) {
    try {
      const saved = await api<{ preference: VisualSearchPreference }>('/api/ai/visual-search-preferences', {
        method: 'PUT', body: JSON.stringify({ enabled, ...(enabled ? { disclosureVersion: VISUAL_SEARCH_DISCLOSURE_VERSION } : {}) }),
      });
      setVisualSearchPreference(saved.preference);
      if (!enabled) setVisualResult(null);
      setVisualError('');
    } catch (cause) { setVisualError(messageOf(cause, 'Could not update image-search settings.')); }
  }
  async function searchWebAndLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visualImage) { await searchByImage(event); return; }
    if (webSearchBusy) return;
    const queryText = search.trim();
    if (!queryText) return;
    if (searchMode !== 'web') return;
    setWebSearchBusy(true); setWebSearchError(''); setLibraryAnswerError(''); setSemanticSearchError(''); setWebSearchResult(null); setLibraryAnswer(null); setSemanticResults([]);
    const [web, library, semantic] = await Promise.allSettled([
      api<WebSearchResultView>('/api/web-search', { method: 'POST', body: JSON.stringify({ query: queryText }) }),
      api<LibraryAnswer>('/api/knowledge/answer', { method: 'POST', body: JSON.stringify({ question: queryText }) }),
      api<{ items: SavedItem[] }>(`/api/semantic/search?q=${encodeURIComponent(queryText)}`),
    ]);
    if (web.status === 'fulfilled') setWebSearchResult(web.value);
    else setWebSearchError(messageOf(web.reason, 'Web search could not be completed.'));
    if (library.status === 'fulfilled') setLibraryAnswer(library.value);
    else setLibraryAnswerError(messageOf(library.reason, 'Your saved library could not be searched.'));
    if (semantic.status === 'fulfilled') setSemanticResults(semantic.value.items);
    else setSemanticSearchError(messageOf(semantic.reason, 'Meaning-based library search could not be completed.'));
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
    setWebSearchResult(null); setLibraryAnswer(null); setSemanticResults([]); setWebSearchError(''); setLibraryAnswerError(''); setSemanticSearchError('');
    setMentionQuery(null); setMentionRange(null);
    if (mode === 'saved') { setComposerSources([]); setComposerAnswer(null); setComposerAnswerError(''); }
    if (mode !== 'saved') { chooseVisualImage(undefined); setVisualResult(null); }
  }
  async function indexSemanticLibrary() {
    if (semanticIndexBusy) return;
    setSemanticIndexBusy(true); setSemanticIndexStatus('Preparing your saved library for meaning-based search…');
    let afterId: string | undefined;
    let indexed = 0;
    try {
      if (!semanticPreference?.enabled) {
        const saved = await api<{ preference: SemanticSearchPreference }>('/api/semantic/preferences', {
          method: 'PUT', body: JSON.stringify({ enabled: true, disclosureVersion: SEMANTIC_SEARCH_DISCLOSURE_VERSION }),
        });
        setSemanticPreference(saved.preference);
      }
      for (;;) {
        const result = await api<{ indexed: number; nextAfterId: string | null; hasMore: boolean }>('/api/semantic/index', {
          method: 'POST', body: JSON.stringify(afterId ? { afterId } : {}),
        });
        indexed += result.indexed;
        setSemanticIndexStatus(`Indexed ${indexed.toLocaleString()} saved ${indexed === 1 ? 'item' : 'items'} so far…`);
        if (!result.hasMore) break;
        if (!result.nextAfterId) throw new Error('Indexing did not return a continuation point.');
        afterId = result.nextAfterId;
      }
      const latest = await api<{ preference: SemanticSearchPreference }>('/api/semantic/preferences');
      setSemanticPreference(latest.preference);
      setSemanticIndexStatus(`Meaning-based search is ready. ${indexed.toLocaleString()} ${indexed === 1 ? 'item was' : 'items were'} newly indexed.`);
    } catch (cause) {
      setSemanticIndexStatus(messageOf(cause, 'Indexing stopped. Try again when the service is available.'));
    } finally { setSemanticIndexBusy(false); }
  }
  async function updateSemanticSearchPreference(enabled: boolean) {
    try {
      const saved = await api<{ preference: SemanticSearchPreference }>('/api/semantic/preferences', {
        method: 'PUT', body: JSON.stringify({ enabled, ...(enabled ? { disclosureVersion: SEMANTIC_SEARCH_DISCLOSURE_VERSION } : {}) }),
      });
      setSemanticPreference(saved.preference);
      if (!enabled) setSemanticIndexStatus('Meaning-based search is disabled and its saved index was removed.');
    } catch (cause) { setSemanticIndexStatus(messageOf(cause, 'Could not update meaning-based search settings.')); }
  }
  async function disableAiAnswers() {
    try {
      const saved = await api<{ preference: AiPreference }>('/api/knowledge/ai-preferences', {
        method: 'PUT', body: JSON.stringify({ enabled: false }),
      });
      setAiPreference(saved.preference);
      setLibraryAnswer(null); setComposerAnswer(null);
    } catch (cause) { setLibraryAnswerError(messageOf(cause, 'Could not disable AI answers.')); }
  }
  function toggleAnswerSource(item: SavedItem) {
    setAnswerError(''); setAnswerResult(null);
    setAnswerSources((current) => {
      if (current.some((source) => source.id === item.id)) return current.filter((source) => source.id !== item.id);
      if (current.length >= 8) { setAnswerError('Choose up to eight saved items for one question.'); return current; }
      return [...current, item];
    });
  }
  async function askAboutSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = answerQuestion.trim();
    if (!question || !answerSources.length || answerBusy) return;
    if (!aiPreference?.providerAvailable) { setAnswerError('Grounded answers are temporarily unavailable. Your selected saves have not been sent.'); return; }
    setAnswerBusy(true); setAnswerError(''); setAnswerResult(null);
    try {
      if (!aiPreference.enabled) {
        const saved = await api<{ preference: AiPreference }>('/api/knowledge/ai-preferences', {
          method: 'PUT', body: JSON.stringify({ enabled: true, disclosureVersion: AI_SEARCH_DISCLOSURE_VERSION }),
        });
        setAiPreference(saved.preference);
      }
      setAnswerResult(await api<LibraryAnswer>('/api/knowledge/answer', {
        method: 'POST', body: JSON.stringify({ question, sourceIds: answerSources.map((source) => source.id) }),
      }));
    } catch (cause) { setAnswerError(messageOf(cause, 'Rembr could not answer from those saves.')); }
    finally { setAnswerBusy(false); }
  }
  function updateMentionQuery(value: string, caret: number) {
    if (searchMode !== 'web') { setMentionQuery(null); setMentionRange(null); return; }
    const prefix = value.slice(0, caret);
    const match = /(^|[\s([{])@([^\s@]*)$/u.exec(prefix);
    if (!match) { setMentionQuery(null); setMentionRange(null); return; }
    const tokenStart = caret - (match[0] ?? '').length + (match[1] ?? '').length;
    setMentionQuery(match[2] ?? '');
    setMentionRange({ start: tokenStart, end: caret });
    setActiveMentionIndex(0);
  }
  function selectMention(item: SavedItem) {
    if (composerSources.some((source) => source.id === item.id)) return;
    if (composerSources.length >= 8) {
      setComposerAnswerError('Choose up to eight saved items for one question.');
      setMentionQuery(null); setMentionRange(null); return;
    }
    const start = mentionRange?.start ?? search.length;
    const end = mentionRange?.end ?? search.length;
    setSearch(`${search.slice(0, start)}${search.slice(end)}`);
    setComposerSources((current) => current.some((source) => source.id === item.id) ? current : [...current, item]);
    setComposerAnswer(null); setComposerAnswerError('');
    setMentionQuery(null); setMentionRange(null); setMentionSuggestions([]);
    requestAnimationFrame(() => {
      const input = composerInputRef.current;
      input?.focus(); input?.setSelectionRange(start, start);
    });
  }
  async function askAboutComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = search.trim();
    if (!question || !composerSources.length || composerAnswerBusy) return;
    if (!aiPreference?.providerAvailable) { setComposerAnswerError('Grounded answers are temporarily unavailable. Your selected saves have not been sent.'); return; }
    setComposerAnswerBusy(true); setComposerAnswerError(''); setComposerAnswer(null);
    try {
      if (!aiPreference.enabled) {
        const saved = await api<{ preference: AiPreference }>('/api/knowledge/ai-preferences', {
          method: 'PUT', body: JSON.stringify({ enabled: true, disclosureVersion: AI_SEARCH_DISCLOSURE_VERSION }),
        });
        setAiPreference(saved.preference);
      }
      setComposerAnswer(await api<LibraryAnswer>('/api/knowledge/answer', {
        method: 'POST', body: JSON.stringify({ question, sourceIds: composerSources.map((source) => source.id) }),
      }));
    } catch (cause) { setComposerAnswerError(messageOf(cause, 'Rembr could not answer from those saves.')); }
    finally { setComposerAnswerBusy(false); }
  }
  function removeComposerSource(item: SavedItem) {
    setComposerSources((current) => current.filter((source) => source.id !== item.id));
    setComposerAnswer(null); setComposerAnswerError('');
  }
  function submitComposer(event: FormEvent<HTMLFormElement>) {
    if (searchMode === 'web' && composerSources.length) void askAboutComposer(event);
    else if (searchMode === 'web') void searchWebAndLibrary(event);
    else event.preventDefault();
  }
  return <div className="library-page"><div className="phase2-page-heading"><div><h1>Your library</h1><p>Search saved pages and notes.</p></div></div>
    <SelectedSavesQuestionPanel sources={answerSources} answerQuestion={answerQuestion} onQuestionChange={setAnswerQuestion} aiPreference={aiPreference} answerError={answerError} answerBusy={answerBusy} answerResult={answerResult} onClear={() => { setAnswerSources([]); setAnswerResult(null); setAnswerError(''); }} onRemove={toggleAnswerSource} onDisableAi={() => void disableAiAnswers()} onSubmit={(event) => void askAboutSelected(event)} />
    <section className="library-search-composer" aria-label="Search your library or the web">
      <form onSubmit={submitComposer}>
        <label className="visually-hidden" htmlFor="library-search-composer-input">Search your saved posts, links, and notes</label>
        <textarea data-rembr-tour-target="reference-composer" ref={composerInputRef} id="library-search-composer-input" rows={1} maxLength={120} placeholder={searchMode === 'web' ? 'Ask about your library… Type @ to add a post or reel' : 'Search your saved posts, links, and notes…'} value={search} aria-autocomplete={mentionQuery !== null ? 'list' : undefined} aria-expanded={mentionQuery !== null} aria-controls={mentionQuery !== null ? 'library-mention-suggestions' : undefined} aria-activedescendant={mentionQuery !== null && mentionSuggestions[activeMentionIndex] ? `library-mention-${mentionSuggestions[activeMentionIndex]!.id}` : undefined} onChange={(event) => { const value = event.currentTarget.value; setSearch(value); setComposerAnswer(null); setComposerAnswerError(''); updateMentionQuery(value, event.currentTarget.selectionStart); }} onKeyDown={(event) => {
          if (mentionQuery !== null) {
            if (event.key === 'ArrowDown' && mentionSuggestions.length) { event.preventDefault(); setActiveMentionIndex((index) => (index + 1) % mentionSuggestions.length); return; }
            if (event.key === 'ArrowUp' && mentionSuggestions.length) { event.preventDefault(); setActiveMentionIndex((index) => (index - 1 + mentionSuggestions.length) % mentionSuggestions.length); return; }
            if (event.key === 'Escape') { event.preventDefault(); setMentionQuery(null); setMentionRange(null); return; }
            if (event.key === 'Enter' && !event.shiftKey) {
              if (mentionSuggestions[activeMentionIndex]) { event.preventDefault(); selectMention(mentionSuggestions[activeMentionIndex]!); return; }
              if (mentionLoading) { event.preventDefault(); return; }
            }
          }
          if (event.key === 'Enter' && ((event.ctrlKey || event.metaKey) || (searchMode === 'web' && !event.shiftKey))) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} onBlur={() => window.setTimeout(() => { setMentionQuery(null); setMentionRange(null); }, 120)} />
        {composerSources.length > 0 && <div className="library-composer-sources" aria-label={`${composerSources.length} referenced saves`}>
          {composerSources.map((source) => <span className="library-composer-source" key={source.id}><span className="library-composer-source-type">{mentionItemType(source)}</span><span className="library-composer-source-title">{source.title || 'Untitled save'}</span><button type="button" aria-label={`Remove ${source.title || 'save'} reference`} onClick={() => removeComposerSource(source)}>×</button></span>)}
        </div>}
        {mentionQuery !== null && <div className="library-mention-menu" id="library-mention-suggestions" role="listbox" aria-label="Saved items to reference">
          <div className="library-mention-menu-heading">{mentionQuery ? 'Matching saves' : 'Recent saves'}</div>
          {mentionLoading && <p className="library-mention-menu-state" role="status">Finding saved items…</p>}
          {!mentionLoading && mentionSuggestions.length === 0 && <p className="library-mention-menu-state">No matching saves. Try another title or caption.</p>}
          {!mentionLoading && mentionSuggestions.map((item, index) => <button type="button" role="option" aria-selected={index === activeMentionIndex} id={`library-mention-${item.id}`} className="library-mention-option" key={item.id} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveMentionIndex(index)} onClick={() => selectMention(item)}>
            {item.cover?.url ? <img className="library-mention-thumbnail" src={item.cover.url} alt="" /> : <span className="library-mention-thumbnail library-mention-placeholder" aria-hidden="true">{mentionItemType(item) === 'Reel' || mentionItemType(item) === 'Video' ? '▶' : '▤'}</span>}
            <span className="library-mention-copy"><strong>{item.title || 'Untitled save'}</strong><span>{mentionItemSource(item)} · {mentionItemType(item)}{item.description ? ` · ${item.description}` : item.textPreview ? ` · ${item.textPreview}` : ''}</span></span>
          </button>)}
          <div className="library-mention-menu-footer">↑↓ to move · Enter to add · Esc to close</div>
        </div>}
        <div className="library-search-composer-controls">
          <input ref={visualSearchInputRef} className="visually-hidden visual-search-input" id="visual-search-image" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose an image to search your saved library" aria-describedby="visual-search-file-help" disabled={visualBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; chooseVisualImage(file); event.currentTarget.value = ''; if (file) { const next = new URLSearchParams(searchParams); next.delete('mode'); setSearchParams(next); } }} />
          <label className="library-search-add" htmlFor="visual-search-image" aria-label="Add an image to search your saved library"><Plus size={20} aria-hidden="true" /></label>
          <div className="library-search-mode" role="group" aria-label="Choose search mode">
            <button type="button" className={searchMode === 'saved' ? 'active' : ''} aria-pressed={searchMode === 'saved'} onClick={() => selectSearchMode('saved')}>Saved</button>
            <button type="button" data-rembr-tour-target="search-ai" className={searchMode === 'web' ? 'active' : ''} aria-pressed={searchMode === 'web'} onClick={() => { selectSearchMode('web'); setVisualResult(null); }}>AI + saved</button>
          </div>
        {searchMode === 'saved' && visualImage && visualSearchPreference?.enabled && <><p className="library-ask-privacy">The selected image will be sent to Meta AI for visual search.</p><button className="phase2-text-button" type="button" onClick={() => void updateVisualSearchPreference(false)}>Disable image search</button></>}
        {searchMode === 'saved' && visualImage && <button className="primary-button library-search-submit" type="submit" disabled={visualBusy || !visualSearchPreference?.providerAvailable}>{visualBusy ? 'Searching…' : 'Find similar saves'}</button>}
          {searchMode === 'saved' && !visualImage && <span className="library-search-hint">Searches your library by keywords only</span>}
        </div>
        {searchMode === 'web' && composerSources.length > 0 && <>
          {aiPreference?.enabled && <><p className="library-ask-privacy library-composer-ai-note">Your question and selected saves will be sent to Meta AI.</p><button className="phase2-text-button" type="button" onClick={() => void disableAiAnswers()}>Disable AI answers</button></>}
          {composerAnswerError && <p className="notice error" role="alert">{composerAnswerError}</p>}
          <button className="primary-button library-composer-ask" type="submit" disabled={composerAnswerBusy || !search.trim() || !aiPreference?.providerAvailable}>{composerAnswerBusy ? 'Thinking…' : `Ask about ${composerSources.length} ${composerSources.length === 1 ? 'save' : 'saves'}`}</button>
        </>}
      </form>
      {searchMode === 'web' && <div className="library-ai-search-tools">
        <div><strong>Meaning-based search</strong><p>{semanticPreference?.providerAvailable ? `${semanticPreference.indexedItems} of ${semanticPreference.eligibleItems} saved items indexed.` : 'Meaning-based search is unavailable; web and keyword search still work.'}</p></div>
        {semanticPreference?.enabled && <p className="library-ask-privacy">Meaning-based search is enabled. Saved text is sent to the embedding provider when you update the index.</p>}
        {semanticPreference?.enabled && <button className="phase2-text-button" type="button" onClick={() => void updateSemanticSearchPreference(false)}>Disable meaning-based search</button>}
        <button className="quiet-button" type="button" disabled={semanticIndexBusy || !semanticPreference?.providerAvailable} onClick={() => void indexSemanticLibrary()}><RefreshCw size={14} aria-hidden="true" />{semanticIndexBusy ? 'Indexing…' : 'Update AI search index'}</button>
      </div>}
      {semanticIndexStatus && <p className="library-search-status" role="status">{semanticIndexStatus}</p>}
      {visualImage && <div className="visual-search-preview library-composer-preview"><img src={visualPreview ?? ''} alt="Selected image for private library search" /><div><span>{visualImage.name}</span><button className="phase2-text-button" type="button" disabled={visualBusy} onClick={() => chooseVisualImage(undefined)}>Remove image</button></div></div>}
      {visualSearchPreference && !visualSearchPreference.providerAvailable && <p className="library-search-disclosure">Image search is temporarily unavailable; keyword search still works.</p>}
      <span className="visually-hidden" id="visual-search-file-help">PNG, JPEG, or WebP up to 8 MiB. The browser resizes it before upload. Image search only searches your saved library.</span>
      {visualPreferenceError && <p className="notice error" role="alert">Could not load image-search settings. <button className="phase2-text-button" type="button" onClick={() => void loadVisualSearchPreference()}>Try again</button></p>}
      {visualError && <p className="notice error" role="alert">{visualError}</p>}
      {visualBusy && <p className="phase2-state" role="status">Analyzing the selected image and searching your private library…</p>}
      {visualResult && <div className="visual-search-results" aria-live="polite"><p><strong>{visualResult.results.length} visual matches</strong></p>{visualResult.visualDescription && <p className="phase2-helper">Description used to find matches: {visualResult.visualDescription}</p>}{visualResult.results.length ? <ul className="phase2-manage-list">{visualResult.results.map((item) => <li key={item.id}><SavedItemLink itemId={item.id}>{item.title}</SavedItemLink><div className="phase2-card-actions"><button className="quiet-button" type="button" aria-label={`Mark ${item.title} helpful for this image search`} aria-pressed={visualFeedback[item.id] === 'helpful'} onClick={() => void rateVisualSearchResult(item, 'helpful')}>Helpful</button><button className="quiet-button" type="button" aria-label={`Mark ${item.title} not helpful for this image search`} aria-pressed={visualFeedback[item.id] === 'not_helpful'} onClick={() => void rateVisualSearchResult(item, 'not_helpful')}>Not helpful</button></div></li>)}</ul> : <p>No saved items matched the visual details. Try a different image or use text search.</p>}</div>}
    </section>
    <LibrarySearchResults composerAnswer={composerAnswer} composerAnswerBusy={composerAnswerBusy} webSearchError={webSearchError} libraryAnswerError={libraryAnswerError} semanticSearchError={semanticSearchError} onRetry={() => void searchWebAndLibrary({ preventDefault() {} } as FormEvent<HTMLFormElement>)} webSearchBusy={webSearchBusy} semanticResults={semanticResults} webSearchResult={webSearchResult} search={search} libraryAnswer={libraryAnswer} />
    {searchMode === 'web' && search && <h2 className="library-saved-matches-heading">Saved keyword matches</h2>}
    {error && <div className="notice error phase2-retry-notice" role="alert"><span>{error}</span><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></div>}
    {loading ? <LibraryCardSkeletons count={Math.min(20, Math.max(4, Math.ceil((window.innerWidth - 100) / 320) * 2))} /> : items.length === 0 ? <div className="empty-state"><span>✳</span><h2>{searchMode === 'web' && search ? 'No saved items match these keywords.' : 'Your library is ready for its first save.'}</h2><p>{searchMode === 'web' && search ? 'Live public sources appear above when your web search is complete.' : 'Save a page or write a note to start building your library.'}</p><div className="phase2-heading-actions"><Link className="quiet-button" to="/app/notes/new" state={{ returnTo: `${location.pathname}${location.search}` }}>Write a note</Link><Link className="primary-button" to="/app/add">Save a page</Link></div></div> : <PortedLibraryGrid items={items} searchActive={Boolean(search)} sort={sort} onSortChange={updateSort} feedback={searchFeedback} onFeedback={rateSearchResult} onRemove={remove} selectedForAnswer={Object.fromEntries(answerSources.map((source) => [source.id, true]))} onToggleAnswerSource={toggleAnswerSource} hasMore={hasMore} loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={loadMore} />}
    {!loading && <span className="visually-hidden" aria-live="polite">{items.length} saved items loaded</span>}
  </div>;
}

