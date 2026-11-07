import { useCallback, useEffect, useState } from 'react';
import { Brain, ArrowUpRight, Check, Clock3, Eye, LoaderCircle, SkipForward } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import posthog from '../../posthog.js';
import type { SavedItem } from '../../app/contracts.js';
import { ErrorState, PageHeader } from '../../app/RouteStates.js';

interface RecallPrompt { id: string; itemId: string; reason: string; question: string }
interface RecallQueue { prompt: RecallPrompt | null; remainingThisWeek: number }
type RecallOutcome = 'remembered' | 'partial' | 'forgot' | 'skipped';

const quickFeedback: Array<{ outcome: Exclude<RecallOutcome, 'skipped'>; label: string }> = [
  { outcome: 'remembered', label: 'I remembered' },
  { outcome: 'partial', label: 'Partly' },
  { outcome: 'forgot', label: 'I forgot' },
];

export function MemoryRecallPage() {
  const [queue, setQueue] = useState<RecallQueue | null>(null);
  const [item, setItem] = useState<SavedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [outcome, setOutcome] = useState<RecallOutcome | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setMessage(''); setItem(null); setOutcome(null);
    try { setQueue(await api<RecallQueue>('/api/knowledge/recall/next', { method: 'POST' })); }
    catch (cause) { setError(messageOf(cause, 'Could not load a memory prompt.')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function reveal() {
    if (!queue?.prompt) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ item: SavedItem }>(`/api/knowledge/recall/prompts/${encodeURIComponent(queue.prompt.id)}/reveal`, { method: 'POST' });
      setItem(result.item);
    } catch (cause) { setError(messageOf(cause, 'Could not reveal this save.')); }
    finally { setBusy(false); }
  }

  async function respond(value: RecallOutcome) {
    if (!queue?.prompt) return;
    setBusy(true); setError('');
    try {
      await api(`/api/knowledge/recall/prompts/${encodeURIComponent(queue.prompt.id)}/respond`, { method: 'POST', body: JSON.stringify({ outcome: value }) });
      posthog.capture('memory_recall_responded', { outcome: value });
      setOutcome(value);
      if (value === 'skipped') setMessage('Skipped. This will not count as forgotten.');
      else setMessage(value === 'remembered' ? 'Nice. Rembr will give this one more time before it returns.' : 'Thanks. Rembr will bring this one back sooner.');
    } catch (cause) { setError(messageOf(cause, 'Could not save your response.')); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="phase2-state" role="status">Loading your memories…</div>;
  if (error && !queue) return <ErrorState message={error} />;
  const prompt = queue?.prompt;
  const media = item?.media?.filter((asset) => asset.status === 'ready' && asset.url) ?? [];
  const noteAssets = item?.note?.assets ?? [];
  const preview = item?.kind === 'note' ? item.note?.body : item?.text || item?.textPreview || item?.description;

  return <main className="mx-auto w-full max-w-3xl space-y-6 px-1 pb-14">
    <PageHeader title="Remember" description="Bring back the saves you chose to keep in mind." />
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice success" role="status">{message}</p>}
    {!prompt ? <section className="phase2-panel space-y-3 text-center">
      <Brain className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
      <h2 className="text-lg font-semibold">{queue?.remainingThisWeek === 0 ? 'That’s enough for this week.' : 'Nothing due right now.'}</h2>
      <p className="text-sm text-muted-foreground">{queue?.remainingThisWeek === 0 ? 'You’ll see up to three prompts in a rolling week. Come back later for more.' : 'When a saved item is due, it will appear here. You can opt in from any item’s details.'}</p>
      <Link to="/app" className="quiet-button inline-flex min-h-10 items-center">Back to your library</Link>
    </section> : <section className="phase2-panel space-y-5">
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> A moment to remember</span><span>{queue?.remainingThisWeek ?? 0} prompts left this week</span></div>
      <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Before you look</p><h2 className="text-2xl font-semibold leading-snug">{prompt.question}</h2>{prompt.reason && <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Why you saved it:</span> {prompt.reason}</p>}<p className="text-sm text-muted-foreground">Take a moment to think of the idea, then reveal the original save.</p></div>
      {!item && !outcome && <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void reveal()} className="primary-button inline-flex min-h-11 items-center gap-2">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Show the saved item</button><button type="button" disabled={busy} onClick={() => void respond('skipped')} className="quiet-button inline-flex min-h-11 items-center gap-2"><SkipForward className="h-4 w-4" /> Skip for now</button></div>}
      {item && <article className="space-y-4 rounded-2xl border border-white/10 bg-black/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">Saved {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.createdAt))}</p><h3 className="mt-1 text-lg font-semibold">{item.title || 'Untitled save'}</h3></div>{item.url && item.kind !== 'note' && <a href={item.url} target="_blank" rel="noopener noreferrer" className="quiet-button inline-flex min-h-10 items-center gap-2">Open original <ArrowUpRight className="h-3.5 w-3.5" /></a>}</div>
        {item.cover?.url && <img src={item.cover.url} alt="Saved item preview" className="max-h-72 w-full rounded-xl object-cover" />}
        {media.map((asset) => asset.mime?.startsWith('video/') ? <video key={asset.id} controls preload="none" src={asset.url ?? undefined} className="max-h-80 w-full rounded-xl" /> : asset.mime?.startsWith('audio/') ? <audio key={asset.id} controls preload="none" src={asset.url ?? undefined} className="w-full" /> : asset.mime?.startsWith('image/') ? <img key={asset.id} src={asset.url ?? ''} alt="Saved media" className="max-h-72 w-full rounded-xl object-contain" /> : null)}
        {noteAssets.map((asset) => <img key={asset.id} src={asset.url} alt="Image saved with this note" className="max-h-72 w-full rounded-xl object-contain" />)}
        {preview && <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white/[0.035] p-4 text-sm leading-relaxed text-muted-foreground">{preview}</div>}
        {item.remembering?.reason && <p className="text-sm text-primary">Why saved: {item.remembering.reason}</p>}
      </article>}
      {item && !outcome && <div className="space-y-3"><p className="text-sm font-medium">How well did you remember it?</p><div className="flex flex-wrap gap-2">{quickFeedback.map((choice) => <button key={choice.outcome} type="button" disabled={busy} onClick={() => void respond(choice.outcome)} className="quiet-button inline-flex min-h-10 items-center gap-2">{choice.outcome === 'remembered' && <Check className="h-4 w-4" />}{choice.label}</button>)}</div></div>}
      {outcome && <div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" /> Your next prompt is spaced from this response.</span><button type="button" onClick={() => void load()} className="primary-button min-h-10" disabled={busy}>Next memory</button></div>}
    </section>}
  </main>;
}
