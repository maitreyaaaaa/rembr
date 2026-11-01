import { useId, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { LoadingSpinner, SkeletonRows } from './LoadingStates.jsx';

export interface RembrCheckupItem {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export interface RembrDuplicateImport {
  id: string;
  itemId: string;
  importedTitle: string;
  matchedItemTitle: string;
  sourcePlatform: string;
  importedAt: string;
}

export interface RembrLinkHealthCheck {
  id: string;
  itemId: string;
  title: string;
  status: 'ok' | 'broken' | 'unknown';
  sourceUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  errorCode: string;
  errorMessage: string;
  checkedAt: string;
}

export interface RembrCheckupReminder {
  id: string;
  itemId: string;
  remindAt: string;
  status: 'pending';
  reason: string;
  note: string;
  item: RembrCheckupItem;
}

export interface RembrCheckupPayload {
  generatedAt: string;
  summary: {
    savedItems: number;
    unorganizedItems: number;
    needsAttention: number;
    olderSaves: number;
  };
  duplicateImports: {
    count: number;
    recent: RembrDuplicateImport[];
  };
  linkHealth: {
    checkedItems: number;
    brokenCount: number;
    unknownCount: number;
    lastCheckedAt: string | null;
    brokenLinks: RembrLinkHealthCheck[];
  };
  needsAttention: RembrCheckupItem[];
  olderSaves: RembrCheckupItem[];
  dueReminders: RembrCheckupReminder[];
  upcomingReminders: RembrCheckupReminder[];
  weeklyRediscovery: RembrCheckupItem[];
  dailyPick: RembrCheckupItem | null;
  readOnly: true;
}

export type RembrReminderPreset = 'tomorrow' | 'week' | 'month';
export type RembrReminderUpdate = 'done' | 'dismissed';

export interface RembrCheckupPanelProps {
  checkup: RembrCheckupPayload | null;
  loading: boolean;
  checkingLinks: boolean;
  reminderBusyId: string;
  error: string;
  onRetry: () => void;
  onCheckLinks: () => void;
  onOpenItem: (itemId: string) => void;
  onScheduleReminder: (itemId: string, preset: RembrReminderPreset, note: string) => void;
  onUpdateReminder: (reminderId: string, status: RembrReminderUpdate) => void;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
}

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : pluralValue}`;
}

function itemStatus(status: string) {
  const labels: Record<string, string> = {
    queued: 'Waiting to process', processing: 'Saving page content', retry_wait: 'Retry scheduled',
    cancel_requested: 'Canceling', cancelled: 'Canceled', paused: 'Paused', partial: 'Partially ready',
    ready: 'Ready to read', failed: 'Could not process',
  };
  return labels[status] ?? status.replaceAll('_', ' ');
}

export function RembrCheckupPanel({
  checkup,
  loading,
  checkingLinks,
  reminderBusyId,
  error,
  onRetry,
  onCheckLinks,
  onOpenItem,
  onScheduleReminder,
  onUpdateReminder,
}: RembrCheckupPanelProps) {
  if (loading && !checkup) return <CheckupSkeleton />;

  if (!checkup) {
    return <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6 md:px-10 md:py-12">
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-8" aria-labelledby="checkup-empty-title">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Library checkup</div>
        {error ? <ErrorState error={error} onRetry={onRetry} /> : <>
          <h1 id="checkup-empty-title" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Review your library</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Your checkup is not available yet. Try again to load your saved link health and rediscovery lists.</p>
          <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 motion-reduce:transition-none"><RefreshCw className="h-4 w-4" /> Retry checkup</button>
        </>}
      </section>
    </div>;
  }

  const hasLibrary = checkup.summary.savedItems > 0;
  const hasAnyFindings = checkup.summary.needsAttention > 0
    || checkup.summary.olderSaves > 0
    || checkup.summary.unorganizedItems > 0
    || checkup.duplicateImports.count > 0
    || checkup.linkHealth.checkedItems > 0
    || checkup.dueReminders.length > 0
    || checkup.upcomingReminders.length > 0
    || checkup.weeklyRediscovery.length > 0
    || Boolean(checkup.dailyPick);

  return <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 pb-28 pt-8 sm:px-6 md:px-10 md:py-12">
    <header className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="p-6 md:p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Library checkup</div>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">Clean up and rediscover</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Review link checks, import matches, and saves worth revisiting. Nothing changes in your library automatically.</p>
          <p className="mt-4 text-xs text-muted-foreground">{checkup.generatedAt ? `Updated ${formatDate(checkup.generatedAt)}.` : 'Current library checkup.'} Link checks run only when you ask; reminders are your choice.</p>
        </div>
        <div className="border-t border-white/10 bg-black/30 p-6 md:p-8 lg:border-l lg:border-t-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <Metric icon={<Copy className="h-3.5 w-3.5" />} label="Already-saved imports" value={checkup.duplicateImports.count} />
            <Metric icon={<ExternalLink className="h-3.5 w-3.5" />} label="Links not found" value={checkup.linkHealth.brokenCount} />
            <Metric icon={<Clock3 className="h-3.5 w-3.5" />} label="Needs a look" value={checkup.summary.needsAttention} />
            <Metric icon={<CalendarClock className="h-3.5 w-3.5" />} label="Reminders due" value={checkup.dueReminders.length} />
          </div>
          <button type="button" onClick={onCheckLinks} disabled={checkingLinks || loading || checkup.summary.savedItems === 0} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none">
            {checkingLinks ? <LoadingSpinner /> : <ShieldCheck className="h-4 w-4" />}
            {checkingLinks ? 'Checking up to 10 links…' : 'Check up to 10 links'}
          </button>
          {checkingLinks && <p className="mt-3 text-center text-xs text-muted-foreground" role="status">Keeping your current results visible while the check runs.</p>}
        </div>
      </div>
    </header>

    {!loading && !error && <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Checkup results are ready to review.</p>}
    {loading && <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-muted-foreground" role="status"><LoadingSpinner className="h-4 w-4 motion-reduce:animate-none" /> Updating checkup. Current results remain visible.</div>}
    {error && <ErrorState error={`${error}${checkup ? ' Previously loaded checkup results are still shown.' : ''}`} onRetry={onRetry} />}
    {!hasLibrary ? <EmptyState title="Your library is ready to grow." copy="Save a page or write a note first. Checkup will show link checks and rediscovery suggestions as your library fills in." /> : !hasAnyFindings && !loading ? <EmptyState title="Your library looks clear for now." copy="There are no current link checks, import matches, reminders, or older saves to review. Run a link check whenever you want." /> : null}

    {hasLibrary && <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
      <section className="space-y-5" aria-labelledby="checkup-cleanup-heading">
        <SectionHeader icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Clean up your saved links" copy="Review import matches and public links that may not open." />

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="checkup-link-health-heading">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><SectionHeader icon={<Link2 className="h-3.5 w-3.5" />} title="Saved link health" copy="Recent checks are kept for seven days to avoid repeat visits." /><h3 id="checkup-link-health-heading" className="sr-only">Saved link health results</h3></div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground">{plural(checkup.linkHealth.checkedItems, 'checked link')}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Checked" value={checkup.linkHealth.checkedItems} compact />
            <Metric icon={<AlertCircle className="h-3.5 w-3.5" />} label="Not found" value={checkup.linkHealth.brokenCount} compact />
            <Metric icon={<CircleQuestionIcon />} label="Could not confirm" value={checkup.linkHealth.unknownCount} compact />
          </div>
          {checkup.linkHealth.lastCheckedAt && <p className="mt-4 text-xs text-muted-foreground">Last checked {formatDate(checkup.linkHealth.lastCheckedAt)}. “Could not confirm” can mean a site blocked or timed out during the check.</p>}
          {checkup.linkHealth.unknownCount > 0 && <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs leading-relaxed text-amber-100" role="status"><CircleQuestionIcon /><span>Partial link results: {plural(checkup.linkHealth.unknownCount, 'link')} could not be confirmed. No conclusion was recorded for those pages.</span></div>}
          {checkup.linkHealth.brokenLinks.length > 0 ? <ul className="mt-4 space-y-3" aria-label="Links that may not open">{checkup.linkHealth.brokenLinks.map((entry) => <li key={entry.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/35 p-4 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => onOpenItem(entry.itemId)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-foreground">{entry.title || 'Untitled save'}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{entry.httpStatus ? `HTTP ${entry.httpStatus}` : entry.errorCode.replaceAll('_', ' ') || 'The original page may be unavailable'} · checked {formatDate(entry.checkedAt)}</span>
            </button>
            <button type="button" onClick={() => onOpenItem(entry.itemId)} className="inline-flex min-h-10 items-center gap-2 self-start rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 motion-reduce:transition-none"><ExternalLink className="h-3.5 w-3.5" /> Review save</button>
          </li>)}</ul> : <EmptyState compact icon={<CheckCircle2 className="mx-auto h-5 w-5 text-primary" />} title="No confirmed broken links." copy={checkup.linkHealth.checkedItems > 0 ? 'The latest link checks did not find a broken page.' : 'Run a link check when you want to review saved pages.'} />}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="checkup-imports-heading">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <SectionHeader icon={<Copy className="h-3.5 w-3.5" />} title="Already-saved import entries" copy="These import rows matched saves already in your library; they are not duplicate saved items." />
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground">{plural(checkup.duplicateImports.count, 'entry')}</span>
          </div>
          <h3 id="checkup-imports-heading" className="sr-only">Already-saved import entries</h3>
          {checkup.duplicateImports.recent.length > 0 ? <>
            <ul className="space-y-3">{checkup.duplicateImports.recent.map((entry) => <li key={entry.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/35 p-4 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => onOpenItem(entry.itemId)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-foreground">{entry.matchedItemTitle || 'Saved item'}</span>
                <span className="mt-1 block text-xs text-muted-foreground">Imported again as “{entry.importedTitle || 'Untitled entry'}” from {entry.sourcePlatform} · {formatDate(entry.importedAt)}</span>
              </button>
              <span className="self-start rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground">Already saved</span>
            </li>)}</ul>
            {checkup.duplicateImports.count > checkup.duplicateImports.recent.length && <p className="mt-3 text-xs text-muted-foreground">Showing the {checkup.duplicateImports.recent.length} most recent entries.</p>}
          </> : <EmptyState compact title="No import entries were skipped as already saved." copy="If an import contains a save already in your library, Rembr will list that match here." />}
        </section>
      </section>

      <section className="space-y-5" aria-labelledby="checkup-rediscover-heading">
        <SectionHeader icon={<Clock3 className="h-3.5 w-3.5" />} title="Rediscover old saves" copy="Bring back useful things you saved but have not opened lately." />
        {(checkup.dueReminders.length > 0 || checkup.upcomingReminders.length > 0) && <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="checkup-reminders-heading">
          <div className="mb-4 flex items-center gap-2 font-semibold text-foreground"><CalendarClock className="h-4 w-4 text-primary" /><h3 id="checkup-reminders-heading">Reminders</h3></div>
          {checkup.dueReminders.length > 0 && <ReminderList heading="Due now" reminders={checkup.dueReminders} busyId={reminderBusyId} onOpenItem={onOpenItem} onUpdate={onUpdateReminder} />}
          {checkup.upcomingReminders.length > 0 && <ReminderList heading="Coming up" reminders={checkup.upcomingReminders} busyId={reminderBusyId} onOpenItem={onOpenItem} onUpdate={onUpdateReminder} />}
        </section>}

        {checkup.dailyPick && <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5" aria-labelledby="checkup-daily-heading">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Zap className="h-4 w-4" /><h3 id="checkup-daily-heading">Picked for today</h3></div>
          <p className="mb-3 text-xs text-muted-foreground">A consistent daily pick from your recent library.</p>
          <CheckupItemCard item={checkup.dailyPick} reason="Picked for today" busyId={reminderBusyId} onOpenItem={onOpenItem} onScheduleReminder={onScheduleReminder} />
        </section>}

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="checkup-needs-attention-heading">
          <SectionHeader icon={<AlertCircle className="h-3.5 w-3.5" />} title="Needs a look" copy="Paused, failed, partial, or retrying saves." />
          <h3 id="checkup-needs-attention-heading" className="sr-only">Saves that need attention</h3>
          {checkup.needsAttention.length ? <ul className="space-y-3">{checkup.needsAttention.map((item) => <li key={item.id}><CheckupItemCard item={item} reason={itemStatus(item.status)} busyId={reminderBusyId} onOpenItem={onOpenItem} onScheduleReminder={onScheduleReminder} /></li>)}</ul> : <EmptyState compact title="Nothing needs attention right now." copy="Paused, failed, partial, or retrying saves will show up here." />}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="checkup-old-heading">
          <SectionHeader icon={<Clock3 className="h-3.5 w-3.5" />} title="Saved 3+ months ago" copy="Older items you may want to revisit." />
          <h3 id="checkup-old-heading" className="sr-only">Older saves</h3>
          {checkup.olderSaves.length ? <ul className="space-y-3">{checkup.olderSaves.map((item) => <li key={item.id}><CheckupItemCard item={item} reason="Saved 3+ months ago" busyId={reminderBusyId} onOpenItem={onOpenItem} onScheduleReminder={onScheduleReminder} /></li>)}</ul> : <EmptyState compact icon={<Clock3 className="mx-auto h-5 w-5 text-primary" />} title="No older saves yet." copy="This section fills in as your library grows." />}
        </section>

        {checkup.weeklyRediscovery.length > 0 && <details className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground"><Sparkles className="h-4 w-4 text-primary" /> A few from your library</summary>
          <p className="mt-2 text-xs text-muted-foreground">A stable weekly selection to make rediscovery easier.</p>
          <ul className="mt-4 space-y-3">{checkup.weeklyRediscovery.map((item) => <li key={item.id}><CheckupItemCard item={item} reason="This week's rediscovery" busyId={reminderBusyId} onOpenItem={onOpenItem} onScheduleReminder={onScheduleReminder} /></li>)}</ul>
        </details>}
      </section>
    </div>}

    {checkup && <footer className="border-t border-white/10 pt-4 text-xs leading-relaxed text-muted-foreground">Checkup is read-only unless you choose an action. Link checks run only when requested; Rembr does not delete or change saves automatically.</footer>}
  </div>;
}

function CheckupSkeleton() {
  return <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 md:px-10 md:py-12" aria-label="Loading library checkup" role="status">
    <div className="grid gap-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4 p-6 md:p-8"><CheckupSkeletonBlock className="h-6 w-36 rounded-full" /><CheckupSkeletonBlock className="h-12 w-3/4 rounded-lg" /><CheckupSkeletonBlock className="h-4 w-full max-w-xl rounded-full" /><CheckupSkeletonBlock className="h-4 w-2/3 rounded-full" /></div>
      <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-black/30 p-6 md:p-8 lg:border-l lg:border-t-0"><CheckupSkeletonBlock className="h-20 rounded-xl" /><CheckupSkeletonBlock className="h-20 rounded-xl" /><CheckupSkeletonBlock className="h-20 rounded-xl" /><CheckupSkeletonBlock className="h-20 rounded-xl" /><CheckupSkeletonBlock className="col-span-2 h-11 rounded-full" /></div>
    </div>
    <div className="grid gap-6 xl:grid-cols-2"><div className="space-y-5"><CheckupSkeletonBlock className="h-12 rounded-xl" /><SkeletonRows count={3} /><SkeletonRows count={2} /></div><div className="space-y-5"><CheckupSkeletonBlock className="h-12 rounded-xl" /><SkeletonRows count={3} /><SkeletonRows count={2} /></div></div>
    <span className="sr-only">Reviewing your library…</span>
  </div>;
}

function CheckupSkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`is-loading-surface ${className}`} />;
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
    <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>
    <button type="button" onClick={onRetry} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-destructive/30 px-4 py-2 text-xs font-semibold transition hover:bg-destructive/10 motion-reduce:transition-none"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
  </div>;
}

function Metric({ icon, label, value, compact = false }: { icon: ReactNode; label: string; value: number; compact?: boolean }) {
  return <div className={`rounded-xl border border-white/10 bg-black/35 ${compact ? 'p-3' : 'p-4'}`}>
    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
    <div className={`font-display font-bold text-foreground ${compact ? 'text-xl' : 'text-2xl'}`}>{value.toLocaleString()}</div>
  </div>;
}

function SectionHeader({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return <div className="mb-4">
    <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">{icon}<span>{title}</span></div>
    <p className="text-sm leading-6 text-muted-foreground">{copy}</p>
  </div>;
}

function EmptyState({ icon = <CheckCircle2 className="mx-auto h-5 w-5 text-primary" />, title, copy, compact = false }: { icon?: ReactNode; title: string; copy: string; compact?: boolean }) {
  return <div className={`rounded-2xl border border-dashed border-white/10 text-center ${compact ? 'p-5' : 'p-7'}`}>
    {icon}<div className="mt-3 text-sm font-semibold text-foreground">{title}</div><p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{copy}</p>
  </div>;
}

function CheckupItemCard({ item, reason, busyId, onOpenItem, onScheduleReminder }: { item: RembrCheckupItem; reason: string; busyId: string; onOpenItem: (itemId: string) => void; onScheduleReminder: (itemId: string, preset: RembrReminderPreset, note: string) => void }) {
  const formId = useId();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const preset = form.get('preset');
    const note = form.get('note');
    if ((preset === 'tomorrow' || preset === 'week' || preset === 'month') && typeof note === 'string') onScheduleReminder(item.id, preset, note);
  }
  return <article className="rounded-xl border border-white/10 bg-black/35 p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <button type="button" onClick={() => onOpenItem(item.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-foreground">{item.title || 'Untitled save'}</span>
        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"><span>{reason}</span><span>·</span><span>Saved {formatDate(item.created_at)}</span><span className={`status status-${item.status}`}>{itemStatus(item.status)}</span></span>
      </button>
      <button type="button" onClick={() => onOpenItem(item.id)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 motion-reduce:transition-none"><ExternalLink className="h-3.5 w-3.5" /> Open</button>
    </div>
    <form className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row" onSubmit={submit}>
      <label className="sr-only" htmlFor={`${formId}-preset`}>Reminder time for {item.title}</label>
      <select id={`${formId}-preset`} name="preset" defaultValue="week" disabled={busyId === item.id} className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 text-xs text-foreground">
        <option value="tomorrow">Remind me tomorrow</option><option value="week">Remind me in a week</option><option value="month">Remind me in a month</option>
      </select>
      <label className="sr-only" htmlFor={`${formId}-note`}>Optional reminder note for {item.title}</label>
      <input id={`${formId}-note`} name="note" type="text" maxLength={300} placeholder="Optional note" disabled={busyId === item.id} className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 text-xs text-foreground placeholder:text-muted-foreground" />
      <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none" type="submit" disabled={busyId === item.id}>
        {busyId === item.id ? <LoadingSpinner className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}{busyId === item.id ? 'Setting…' : 'Set reminder'}
      </button>
    </form>
  </article>;
}

function ReminderList({ heading, reminders, busyId, onOpenItem, onUpdate }: { heading: string; reminders: RembrCheckupReminder[]; busyId: string; onOpenItem: (itemId: string) => void; onUpdate: (reminderId: string, status: RembrReminderUpdate) => void }) {
  return <div className="mt-4 first:mt-0">
    <h4 className="mb-3 text-sm font-semibold text-foreground">{heading}</h4>
    <ul className="space-y-3">{reminders.map((reminder) => <li key={reminder.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/35 p-3 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={() => onOpenItem(reminder.item.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-foreground">{reminder.item.title || 'Untitled save'}</span>
        <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span>{reminder.reason || `Reminder for ${formatDate(reminder.remindAt)}`}</span><span>·</span><span>{formatDate(reminder.remindAt)}</span></span>
        {reminder.note && <span className="mt-1 block break-words text-xs text-muted-foreground">{reminder.note}</span>}
      </button>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" disabled={busyId === reminder.id} onClick={() => onUpdate(reminder.id, 'done')} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary disabled:opacity-60 motion-reduce:transition-none">{busyId === reminder.id ? <LoadingSpinner className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />} Done</button>
        <button type="button" disabled={busyId === reminder.id} onClick={() => onUpdate(reminder.id, 'dismissed')} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-white/30 disabled:opacity-60 motion-reduce:transition-none"><X className="h-3 w-3" /> Dismiss</button>
      </div>
    </li>)}</ul>
  </div>;
}

function CircleQuestionIcon() {
  return <span className="mt-0.5 inline-grid h-4 w-4 shrink-0 place-items-center rounded-full border border-current text-[10px] font-bold" aria-hidden="true">?</span>;
}

export default RembrCheckupPanel;
