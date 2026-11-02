import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { gsap } from 'gsap';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Brain,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  RotateCcw,
  Search,
  Tag,
  X,
} from 'lucide-react';

export type RembrDetailStatus =
  | 'queued'
  | 'processing'
  | 'retry_wait'
  | 'cancel_requested'
  | 'cancelled'
  | 'paused'
  | 'partial'
  | 'ready'
  | 'failed';

export interface RembrDetailTag {
  id: string;
  name: string;
}

export interface RembrDetailAsset {
  id: string;
  url: string;
  mime: string;
  byteSize: number;
}

export interface RembrDetailMedia {
  id: string;
  url: string | null;
  mime: string | null;
  byteSize: number;
  status: 'ready' | 'failed';
}

/** Structural view of App.tsx's SavedItem; the app remains the data owner. */
export interface RembrDetailItem {
  id: string;
  url: string;
  title: string;
  description: string;
  titleOverride?: string | null;
  descriptionOverride?: string | null;
  kind: 'page' | 'note';
  status: RembrDetailStatus;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  textPreview: string;
  text?: string;
  fetchedAt?: string;
  tags: RembrDetailTag[];
  note?: {
    body: string;
    links: string[];
    assets: RembrDetailAsset[];
  };
  media?: RembrDetailMedia[];
}

export interface RembrDetailAnalysis {
  status: string;
  pauseReason: string | null;
  errorCode: string | null;
  updatedAt: string | null;
  result: null | {
    status: string;
    model: string;
    summary: string;
    visualDescription: string;
    ocrText: string;
    transcript: string;
    keywords: string[];
    tags: string[];
    brands: string[];
    tools: string[];
    people: string[];
    repositories: string[];
    imageCount: number;
    videoCount: number;
    createdAt: string;
  };
}

export type RembrDetailAction = 'cancel' | 'retry' | 'reprocess';

export interface RembrDetailDrawerProps {
  item: RembrDetailItem;
  analysis?: RembrDetailAnalysis | null;
  allTags?: RembrDetailTag[];
  busyAction?: RembrDetailAction | null;
  error?: string;
  onClose: () => void;
  onOpenOriginal: (item: RembrDetailItem) => void;
  onEdit: (item: RembrDetailItem) => void;
  onCancelProcessing: (item: RembrDetailItem) => void;
  onRetryProcessing: (item: RembrDetailItem) => void;
  onReprocess: (item: RembrDetailItem) => void;
  onToggleTag?: (tag: RembrDetailTag, add: boolean) => void;
}

const statusText: Record<RembrDetailStatus, string> = {
  queued: 'Waiting to process',
  processing: 'Saving page content',
  retry_wait: 'Retry scheduled',
  cancel_requested: 'Canceling',
  cancelled: 'Canceled',
  paused: 'Paused',
  partial: 'Partially ready',
  ready: 'Ready to read',
  failed: 'Could not process',
};
const MAX_ITEM_TAGS = 5;

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function readableBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function canCancel(status: RembrDetailStatus) {
  return ['queued', 'processing', 'retry_wait', 'cancel_requested'].includes(status);
}

function actionLabel(action: RembrDetailAction) {
  return action === 'cancel' ? 'Cancel processing' : action === 'retry' ? 'Retry processing' : 'Reprocess';
}

export function RembrDetailDrawer({
  item,
  analysis,
  allTags = [],
  busyAction = null,
  error = '',
  onClose,
  onOpenOriginal,
  onEdit,
  onCancelProcessing,
  onRetryProcessing,
  onReprocess,
  onToggleTag,
}: RembrDetailDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const isNote = item.kind === 'note';
  const readyMedia = (item.media ?? []).filter((asset) => asset.status === 'ready' && asset.url);
  const noteAssets = item.note?.assets ?? [];
  const canRetry = item.status === 'failed';
  const canReprocess = item.status === 'ready' || item.status === 'partial';
  const displayTitle = item.titleOverride || item.title || 'Untitled save';
  const savedText = item.text || item.textPreview;
  const attachedTagIds = new Set(item.tags.map((tag) => tag.id));
  const normalizedTagSearch = tagSearch.trim().toLocaleLowerCase();
  const matchingTags = normalizedTagSearch.length >= 2
    ? allTags.filter((tag) => !attachedTagIds.has(tag.id) && tag.name.toLocaleLowerCase().includes(normalizedTagSearch)).slice(0, 8)
    : [];

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    closeRef.current?.focus();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) gsap.fromTo(panel, { x: '100%' }, { x: 0, duration: 0.5, ease: 'power3.out' });
    return () => { gsap.killTweensOf(panel); };
  }, []);

  function onDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (preview) setPreview(null);
      else onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function runAction(action: RembrDetailAction) {
    if (action === 'cancel') onCancelProcessing(item);
    else if (action === 'retry') onRetryProcessing(item);
    else onReprocess(item);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-md"
      onClick={onClose}
      data-testid="rembr-detail-drawer-backdrop"
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rembr-detail-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-white/10 bg-black text-foreground shadow-2xl shadow-black"
      >
        <header className="sticky top-0 z-10 flex items-center justify-end border-b border-white/10 bg-black/90 px-4 py-2 backdrop-blur sm:px-6">
          <button ref={closeRef} type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground" aria-label="Close item details">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
          {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
          <section aria-labelledby="rembr-detail-title">
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-primary">
              <span>{isNote ? 'Personal note' : 'Saved page'}</span>
              {formatDate(item.createdAt) && <span className="text-muted-foreground">/ Saved {formatDate(item.createdAt)}</span>}
              {!isNote && <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 ${item.status === 'failed' ? 'text-destructive' : item.status === 'ready' ? 'text-primary' : 'text-muted-foreground'}`}>
                {['queued', 'processing', 'retry_wait', 'cancel_requested'].includes(item.status)
                  ? <LoaderCircle className="h-3 w-3 animate-spin" />
                  : item.status === 'ready' ? <CheckCircle2 className="h-3 w-3" /> : <CircleHelp className="h-3 w-3" />}
                {statusText[item.status]}
              </span>}
            </div>

            <h2 id="rembr-detail-title" className="mb-2 break-words font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {displayTitle}
            </h2>
            {(item.descriptionOverride || item.description) && <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{item.descriptionOverride || item.description}</p>}

            <div className="flex flex-wrap gap-2">
              {!isNote && item.url && <button type="button" onClick={() => onOpenOriginal(item)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary">
                Open original <ArrowUpRight className="h-3.5 w-3.5" />
              </button>}
              <button type="button" onClick={() => onEdit(item)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary">
                <FileText className="h-3.5 w-3.5" /> {isNote ? 'Edit note' : 'Edit details'}
              </button>
              {canCancel(item.status) && <button type="button" disabled={busyAction !== null || item.status === 'cancel_requested'} onClick={() => runAction('cancel')} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60">
                {busyAction === 'cancel' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                {busyAction === 'cancel' || item.status === 'cancel_requested' ? 'Canceling…' : actionLabel('cancel')}
              </button>}
              {canRetry && <ActionButton action="retry" busyAction={busyAction} onClick={runAction} />}
              {canReprocess && <ActionButton action="reprocess" busyAction={busyAction} onClick={runAction} />}
            </div>
          </section>

          {!isNote && item.status === 'failed' && <div role="status" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Rembr could not make a readable copy. The source link is still available{item.errorCode ? ` (${item.errorCode.replaceAll('_', ' ')}).` : '.'}</p>
          </div>}

          {isNote ? <section aria-labelledby="rembr-note-heading">
            <SectionHeading icon={<FileText className="h-3.5 w-3.5" />} label="Note" />
            <h3 id="rembr-note-heading" className="sr-only">Note contents</h3>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{item.note?.body || 'This note is empty.'}</div>
          </section> : <section aria-labelledby="rembr-copy-heading">
            <SectionHeading icon={<BookOpen className="h-3.5 w-3.5" />} label="Saved copy" />
            <h3 id="rembr-copy-heading" className="sr-only">Saved page copy</h3>
            {item.status === 'processing' || item.status === 'queued' ? <div role="status" className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin text-primary" /> The readable copy will appear when processing finishes.</div>
              : savedText ? <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-relaxed text-muted-foreground">{savedText}</div>
                : <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-relaxed text-muted-foreground">{item.status === 'failed' ? 'No readable copy is available for this save.' : 'There is no readable text for this save yet.'}</p>}
          </section>}

          {analysis && analysis.status !== 'not_requested' && <details className="group rounded-2xl border border-white/10 bg-white/[0.025]">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-muted-foreground outline-none marker:hidden hover:text-primary focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
              <Brain className="h-4 w-4 text-primary" /> Read more <span className="font-normal text-muted-foreground">· AI media notes</span><ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <section className="space-y-4 border-t border-white/10 p-4" aria-labelledby="rembr-analysis-heading">
              <h3 id="rembr-analysis-heading" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">AI media notes</h3>
              <p className="text-sm text-muted-foreground">{analysisStatusText(analysis)}</p>
              {analysis.result && <div className="space-y-3 text-sm leading-relaxed">
              {analysis.result.summary && <p className="font-semibold text-foreground">{analysis.result.summary}</p>}
              {analysis.result.visualDescription && <DetailText label="Visual notes">{analysis.result.visualDescription}</DetailText>}
              {analysis.result.ocrText && <DetailText label="Text in media" preserve>{analysis.result.ocrText}</DetailText>}
              {analysis.result.transcript && <DetailText label="Speech transcript" preserve>{analysis.result.transcript}</DetailText>}
              {analysis.result.keywords.length > 0 && <DetailText label="Keywords">{analysis.result.keywords.join(', ')}</DetailText>}
              {analysis.result.tags.length > 0 && <DetailText label="AI topics">{analysis.result.tags.join(', ')}</DetailText>}
              {analysis.result.brands.length > 0 && <DetailText label="Brand labels">{analysis.result.brands.join(', ')}</DetailText>}
              {analysis.result.tools.length > 0 && <DetailText label="Tool labels">{analysis.result.tools.join(', ')}</DetailText>}
              {analysis.result.people.length > 0 && <DetailText label="People named in text">{analysis.result.people.join(', ')}</DetailText>}
              {analysis.result.repositories.length > 0 && <DetailText label="Repository labels">{analysis.result.repositories.join(', ')}</DetailText>}
              <p className="text-xs text-muted-foreground">Generated by {analysis.result.model}. {analysis.result.imageCount} images and {analysis.result.videoCount} videos analyzed.</p>
              </div>}
            </section>
          </details>}

          {!isNote && readyMedia.length > 0 && <section aria-label="Saved media">
            <SectionHeading icon={<ImageIcon className="h-3.5 w-3.5" />} label="Saved media" />
            <div className="grid gap-3 sm:grid-cols-2">{readyMedia.map((asset) => <MediaPreview key={asset.id} id={asset.id} url={asset.url!} mime={asset.mime} byteSize={asset.byteSize} onPreview={(url) => setPreview({ url, label: displayTitle })} />)}</div>
            {item.media?.some((asset) => asset.status === 'failed') && <p className="mt-3 text-xs text-muted-foreground">Some page media could not be saved. The readable page is still available.</p>}
          </section>}

          {isNote && noteAssets.length > 0 && <section aria-label="Note images">
            <SectionHeading icon={<ImageIcon className="h-3.5 w-3.5" />} label="Images" />
            <div className="grid gap-3 sm:grid-cols-2">{noteAssets.map((asset) => <button type="button" key={asset.id} onClick={() => setPreview({ url: asset.url, label: displayTitle })} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] text-left transition hover:border-primary">
              <img src={asset.url} alt={`Image attached to ${displayTitle}`} className="max-h-64 w-full object-cover" loading="lazy" />
              <span className="block p-3 text-xs text-muted-foreground">{readableBytes(asset.byteSize)}</span>
            </button>)}</div>
          </section>}

          {isNote && item.note?.links.length ? <section>
            <SectionHeading icon={<ArrowUpRight className="h-3.5 w-3.5" />} label="Links in this note" />
            <ul className="space-y-2">{item.note.links.map((link) => <li key={link}><a href={link} target="_blank" rel="noreferrer" className="break-all text-sm text-muted-foreground underline decoration-white/20 underline-offset-4 hover:text-primary">{link}</a></li>)}</ul>
          </section> : null}

          {(item.tags.length > 0 || onToggleTag) && <section>
            {(item.tags.length > 0 || onToggleTag) && <div className="mb-4">
              <SectionHeading icon={<Tag className="h-3.5 w-3.5" />} label="Tags" />
              <div className="flex flex-wrap gap-2">{item.tags.slice(0, MAX_ITEM_TAGS).map((tag) => onToggleTag
                ? <button key={tag.id} type="button" aria-label={`Remove tag ${tag.name}`} onClick={() => onToggleTag(tag, false)} className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs text-primary transition hover:border-destructive/60 hover:text-destructive">{tag.name} <span aria-hidden="true">×</span></button>
                : <span key={tag.id} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground">{tag.name}</span>)}</div>
              {onToggleTag && item.tags.length < MAX_ITEM_TAGS && <button type="button" aria-expanded={tagPickerOpen} onClick={() => { setTagPickerOpen((open) => !open); setTagSearch(''); }} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"><Tag className="h-3.5 w-3.5" /> Add tag</button>}
              {tagPickerOpen && item.tags.length < MAX_ITEM_TAGS && <div className="mt-3 max-w-md">
                <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus type="search" value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="Find a tag" className="min-h-10 w-full rounded-xl border border-white/10 bg-black px-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" /></label>
                {normalizedTagSearch.length > 0 && normalizedTagSearch.length < 2 && <p className="mt-2 text-xs text-muted-foreground">Type at least two characters.</p>}
                {matchingTags.length > 0 && <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">{matchingTags.map((tag) => <button key={tag.id} type="button" onClick={() => { onToggleTag?.(tag, true); setTagSearch(''); }} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary">{tag.name}</button>)}</div>}
                {normalizedTagSearch.length >= 2 && matchingTags.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No matching tags.</p>}
              </div>}
              {item.tags.length >= MAX_ITEM_TAGS && <p className="mt-2 text-xs text-muted-foreground">Five tags maximum. Remove one to add another.</p>}
            </div>}
          </section>}

          <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 pt-5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Saved {formatDate(item.createdAt)}
            {item.fetchedAt && <><span aria-hidden="true">·</span><Clock3 className="h-3.5 w-3.5" /> Processed {formatDate(item.fetchedAt)}</>}
          </footer>
        </div>
      </section>

      {preview && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4 backdrop-blur-sm" onClick={() => setPreview(null)}>
        <button type="button" className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-black/70 text-white hover:bg-white/10" onClick={() => setPreview(null)} aria-label="Close image preview"><X className="h-5 w-5" /></button>
        <img src={preview.url} alt={preview.label} className="max-h-[88vh] max-w-[92vw] rounded-2xl border border-white/10 object-contain shadow-2xl shadow-black" />
      </div>}
    </div>
  );
}

function ActionButton({ action, busyAction, onClick }: { action: 'retry' | 'reprocess'; busyAction: RembrDetailAction | null; onClick: (action: RembrDetailAction) => void }) {
  const busy = busyAction === action;
  return <button type="button" disabled={busyAction !== null} onClick={() => onClick(action)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
    {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
    {busy ? `${actionLabel(action)}…` : actionLabel(action)}
  </button>;
}

function SectionHeading({ icon, label }: { icon: ReactNode; label: string }) {
  return <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">{icon}<span>{label}</span></div>;
}

function DetailText({ children, label, preserve = false }: { children: string; label: string; preserve?: boolean }) {
  return <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={preserve ? 'whitespace-pre-wrap text-muted-foreground' : 'text-foreground'}>{children}</p></div>;
}

function analysisStatusText(analysis: RembrDetailAnalysis) {
  if (analysis.status === 'processing' || analysis.status === 'queued') return 'Analysis is running.';
  if (analysis.status === 'paused') return `Analysis paused${analysis.pauseReason ? `: ${analysis.pauseReason.replaceAll('_', ' ')}` : ''}.`;
  if (analysis.status === 'failed') return 'Analysis could not be completed. Your saved page is available.';
  if (analysis.result?.status === 'partial') return 'Partial analysis. Some public media was unavailable or skipped.';
  if (analysis.status === 'completed') return 'Analysis complete.';
  return 'Analysis details for this save.';
}

function MediaPreview({ id, url, mime, byteSize, onPreview }: { id: string; url: string; mime: string | null; byteSize: number; onPreview: (url: string) => void }) {
  if (mime?.startsWith('video/')) return <figure className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
    <video key={id} src={url} controls preload="metadata" aria-label="Video saved from this page" className="max-h-64 w-full" />
    <figcaption className="p-3 text-xs text-muted-foreground">Video · {readableBytes(byteSize)}</figcaption>
  </figure>;
  if (mime?.startsWith('audio/')) return <figure className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-3">
    <audio key={id} src={url} controls preload="metadata" aria-label="Audio saved from this page" className="w-full" />
    <figcaption className="mt-2 text-xs text-muted-foreground">Audio · {readableBytes(byteSize)}</figcaption>
  </figure>;
  return <button type="button" onClick={() => onPreview(url)} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] text-left transition hover:border-primary">
    <img key={id} src={url} alt="Image saved from this page" className="max-h-64 w-full object-cover" loading="lazy" />
    <span className="block p-3 text-xs text-muted-foreground">{readableBytes(byteSize)}</span>
  </button>;
}

export default RembrDetailDrawer;
