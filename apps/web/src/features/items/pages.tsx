import type { Asset, AiAnalysisView, SavedItem, Tag } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf, sameAppPath } from '../../app/helpers.js';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { RembrDetailDrawer, type RembrDetailAction } from './RembrDetailDrawer.js';
import { PageHeader, ErrorState } from '../../app/RouteStates.js';

export function ItemDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { itemId = '' } = useParams();
  const [item, setItem] = useState<SavedItem | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisView | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyJobAction, setBusyJobAction] = useState<RembrDetailAction | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [itemResult, aiResult] = await Promise.all([
        api<{ item: SavedItem }>(`/api/items/${encodeURIComponent(itemId)}`),
        api<AiAnalysisView>(`/api/ai/items/${encodeURIComponent(itemId)}`).catch(() => null),
      ]);
      setItem(itemResult.item);
      setAiAnalysis(aiResult);
    } catch (cause) {
      setError(messageOf(cause, 'Could not load this item.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [itemId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!item || !['queued', 'processing', 'retry_wait', 'cancel_requested', 'paused'].includes(item.status)) return undefined;
    const timer = window.setInterval(() => { void load(true); }, 2500);
    return () => window.clearInterval(timer);
  }, [item, load]);
  useEffect(() => {
    if (!aiAnalysis || !['queued', 'processing'].includes(aiAnalysis.status)) return undefined;
    const timer = window.setInterval(() => { void load(true); }, 4000);
    return () => window.clearInterval(timer);
  }, [aiAnalysis, load]);
  useEffect(() => {
    let alive = true;
    void api<{ tags: Tag[] }>('/api/tags').then((result) => { if (alive) setAllTags(result.tags); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  async function updateTag(tag: Tag, add: boolean) {
    if (!item) return;
    setError('');
    try {
      await api(`/api/items/${encodeURIComponent(item.id)}/tags/${encodeURIComponent(tag.id)}`, { method: add ? 'PUT' : 'DELETE' });
      await load();
    } catch (cause) {
      setError(messageOf(cause, 'Could not update item tags.'));
    }
  }

  async function jobAction(action: RembrDetailAction) {
    if (!item) return;
    setBusyJobAction(action);
    setError('');
    try {
      await api(`/api/items/${encodeURIComponent(item.id)}/job/${action}`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(messageOf(cause, `Could not ${action} this job.`));
    } finally {
      setBusyJobAction(null);
    }
  }

  async function updateMemoryPreference(enabled: boolean, reason: string) {
    if (!item) return;
    setMemoryBusy(true);
    setError('');
    try {
      await api(`/api/knowledge/items/${encodeURIComponent(item.id)}/memory`, {
        method: 'PATCH', body: JSON.stringify({ enabled, reason }),
      });
      await load(true);
    } catch (cause) {
      setError(messageOf(cause, 'Could not update this memory preference.'));
    } finally {
      setMemoryBusy(false);
    }
  }

  if (loading) return <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-md" role="status" aria-label="Loading saved item">
    <section className="h-full w-full max-w-2xl space-y-8 overflow-hidden border-l border-white/10 bg-black p-6 sm:p-8" aria-busy="true">
      <div className="flex justify-end"><div className="h-10 w-10 animate-pulse rounded-lg bg-white/10" /></div>
      <div className="space-y-4"><div className="h-3 w-36 animate-pulse rounded bg-white/10" /><div className="h-10 w-4/5 animate-pulse rounded bg-white/10" /><div className="h-4 w-3/5 animate-pulse rounded bg-white/10" /><div className="flex gap-2"><div className="h-10 w-32 animate-pulse rounded-full bg-white/10" /><div className="h-10 w-28 animate-pulse rounded-full bg-white/10" /></div></div>
      <div className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.025]" /><div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/[0.025]" />
      <span className="visually-hidden">Loading saved item…</span>
    </section>
  </div>;
  if (error && !item) return <ErrorState message={error} />;
  if (!item) return <ErrorState message="This item was not found." />;

  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const libraryHref = sameAppPath(returnTo);

  return <RembrDetailDrawer
    item={item}
    analysis={aiAnalysis}
    allTags={allTags}
    busyAction={busyJobAction}
    busyMemory={memoryBusy}
    error={error}
    onClose={() => navigate(libraryHref, { replace: true })}
    onOpenOriginal={(currentItem) => {
      try {
        const original = new URL(currentItem.url);
        if (!['https:', 'http:'].includes(original.protocol)) throw new Error('Only web links can be opened from Rembr.');
        window.open(original.href, '_blank', 'noopener,noreferrer');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not open the original page.');
      }
    }}
    onEdit={(currentItem) => navigate(
      currentItem.kind === 'note'
        ? `/app/notes/${encodeURIComponent(currentItem.id)}/edit`
        : `/app/items/${encodeURIComponent(currentItem.id)}/edit`,
      { state: { returnTo: libraryHref } },
    )}
    onCancelProcessing={() => void jobAction('cancel')}
    onRetryProcessing={() => void jobAction('retry')}
    onReprocess={() => void jobAction('reprocess')}
    onToggleTag={(tag, add) => void updateTag(tag, add)}
    onUpdateMemoryPreference={(enabled, reason) => void updateMemoryPreference(enabled, reason)}
  />;
}

export function ItemEditPage() {
  const { itemId = '' } = useParams(); const navigate = useNavigate(); const location = useLocation(); const returnTo = sameAppPath((location.state as { returnTo?: string } | null)?.returnTo); const [item, setItem] = useState<SavedItem | null>(null); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [summary, setSummary] = useState(''); const [whySaved, setWhySaved] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let alive = true; void api<{ item: SavedItem }>(`/api/items/${encodeURIComponent(itemId)}`).then(({ item: result }) => { if (alive) { setItem(result); const summaryText = result.summaryOverride ?? result.summary ?? ''; const rawTitle = result.title ?? ''; setTitle(result.titleOverride ?? (((/#/u.test(rawTitle) || rawTitle.length > 110 || rawTitle.trim() === (result.originalCaption || result.description).trim()) && summaryText ? summaryText.split(/[.!?\n]/, 1)[0]?.slice(0, 100).trim() : null) ?? rawTitle)); setDescription(result.descriptionOverride ?? result.description); setSummary(summaryText); setWhySaved(result.whySaved ?? result.remembering?.reason ?? ''); } }).catch((cause) => { if (alive) setError(messageOf(cause, 'Could not load this item.')); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [itemId]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { await api(`/api/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify({ titleOverride: title, descriptionOverride: description, summaryOverride: summary, whySaved }) }); navigate(`/app/items/${encodeURIComponent(itemId)}`, { replace: true, state: { returnTo } }); } catch (cause) { setError(messageOf(cause, 'Could not update item details.')); } finally { setBusy(false); } }
  if (loading) return <div className="phase2-state" role="status">Loading item…</div>;
  if (!item) return <ErrorState message={error || 'This item was not found.'} />;
  return <><div className="phase2-back"><Link to={`/app/items/${encodeURIComponent(itemId)}`} state={{ returnTo }}>← Cancel and return</Link></div><PageHeader title="Edit page details" description="Personalize the title and summary shown in your library. The original source and caption stay available." /><section className="phase2-panel phase2-narrow"><form className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="item-title">Title</label><input id="item-title" maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} /><label htmlFor="item-summary">What this is</label><textarea id="item-summary" rows={4} maxLength={2000} value={summary} onChange={(event) => setSummary(event.target.value)} /><label htmlFor="why-saved">Why I saved this <span>(optional)</span></label><textarea id="why-saved" rows={2} maxLength={1000} value={whySaved} onChange={(event) => setWhySaved(event.target.value)} placeholder="A project, person, or idea…" /><label htmlFor="item-description">Original caption or description</label><textarea id="item-description" rows={5} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form></section></>;
}

export function NoteEditorPage() {
  const { itemId } = useParams(); const editing = Boolean(itemId); const navigate = useNavigate(); const location = useLocation(); const returnTo = sameAppPath((location.state as { returnTo?: string } | null)?.returnTo);
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [linksText, setLinksText] = useState(''); const [images, setImages] = useState<File[]>([]); const [existingAssets, setExistingAssets] = useState<Asset[]>([]); const [loading, setLoading] = useState(editing); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const imagePreviews = useMemo(() => images.map((file) => ({ file, url: URL.createObjectURL(file) })), [images]);
  useEffect(() => () => imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url)), [imagePreviews]);
  useEffect(() => { if (!itemId) return; let alive = true; void api<{ item: SavedItem }>(`/api/items/${encodeURIComponent(itemId)}`).then(({ item }) => { if (!alive) return; setTitle(item.titleOverride ?? item.title); setBody(item.note?.body ?? ''); setLinksText(item.note?.links?.join('\n') ?? ''); setExistingAssets(item.note?.assets ?? []); }).catch((cause) => { if (alive) setError(messageOf(cause, 'Could not load this note.')); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [itemId]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); const links = linksText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); if (links.length > 20) { setError('Add up to 20 links.'); return; } try { for (const value of links) { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } } catch { setError('Each note link must be a complete HTTP or HTTPS URL.'); return; } if (images.some((image) => image.size > 5 * 1024 * 1024)) { setError('Each image must be 5 MiB or smaller.'); return; } setBusy(true); const form = new FormData(); form.set('title', title.trim() || 'Untitled note'); form.set('body', body); form.set('links', JSON.stringify(links)); images.forEach((image) => form.append('images', image)); try { const path = editing ? `/api/notes/${encodeURIComponent(itemId!)}` : '/api/notes'; const result = await api<{ item: SavedItem }>(path, { method: editing ? 'PATCH' : 'POST', body: form }); navigate(`/app/items/${encodeURIComponent(result.item.id)}`, { state: { returnTo } }); } catch (cause) { setError(messageOf(cause, 'Could not save this note.')); } finally { setBusy(false); } }
  async function removeAsset(asset: Asset) { if (!itemId || !window.confirm('Remove this image from the note?')) return; setError(''); try { await api(`/api/notes/${encodeURIComponent(itemId)}/assets/${encodeURIComponent(asset.id)}`, { method: 'DELETE' }); setExistingAssets((current) => current.filter((entry) => entry.id !== asset.id)); } catch (cause) { setError(messageOf(cause, 'Could not remove image.')); } }
  if (loading) return <div className="phase2-state" role="status">Loading note…</div>;
  const linkCount = linksText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
  return <><div className="phase2-back"><Link to={editing ? `/app/items/${encodeURIComponent(itemId!)}` : returnTo} state={editing ? { returnTo } : undefined}>← Cancel and return</Link></div><PageHeader title={editing ? 'Edit note' : 'Write a note'} description="Notes live beside your saved pages." /><section className="phase2-panel phase2-narrow"><form className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="note-title">Title</label><input id="note-title" required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A title for this note" /><label htmlFor="note-body">Note</label><textarea id="note-body" rows={12} maxLength={20000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a note…" /><div className="phase2-char-count">{body.length.toLocaleString()} / 20,000</div><label htmlFor="note-links">Links <span>(one per line, up to 20)</span></label><textarea id="note-links" rows={4} value={linksText} onChange={(event) => setLinksText(event.target.value)} placeholder="https://example.com" /><div className="phase2-char-count">{linkCount} / 20 links</div><label htmlFor="note-images">Add images <span>(up to {Math.max(0, 5 - existingAssets.length)} more, max 5 MiB each)</span></label><input id="note-images" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={existingAssets.length >= 5} onChange={(event) => { const picked = Array.from(event.target.files ?? []); const max = Math.max(0, 5 - existingAssets.length); if (picked.length > max) setError(`This note can have at most five images. Select ${max} or fewer.`); else setError(''); setImages(picked.slice(0, max)); }} />{(existingAssets.length > 0 || images.length > 0) && <div className="phase2-asset-previews">{existingAssets.map((asset) => <figure key={asset.id}><img src={asset.url} alt="Existing note attachment" /><figcaption><span>Saved image</span><button className="quiet-button danger-button" type="button" onClick={() => void removeAsset(asset)}>Remove</button></figcaption></figure>)}{imagePreviews.map(({ file, url }, index) => <figure key={`${file.name}-${file.size}-${index}`}><img src={url} alt={`Preview of ${file.name}`} /><figcaption><span>{file.name}</span><button className="quiet-button danger-button" type="button" onClick={() => setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</button></figcaption></figure>)}</div>}{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Saving note…' : editing ? 'Save note' : 'Create note'}</button></form></section></>;
}
