import { useState, type FormEvent } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { ArrowRight, CheckCircle2, FileText, Link2, PackageOpen, Upload, X } from 'lucide-react';
import { LoadingSpinner, ProgressBar } from '../../components/ui/LoadingStates.jsx';
import { MagneticDropZone } from '../../components/MagneticDropZone.js';

type AddMode = 'link' | 'archive';

export interface RembrAddFlowProps {
  url: string;
  onUrlChange: (url: string) => void;
  onSaveLink: (event: FormEvent<HTMLFormElement>) => void;
  onWriteNote: () => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onImport: () => void;
  busy?: boolean;
  progress?: number | null;
  error?: string;
  activeImportId?: string | null;
  onCancelImport?: () => void;
  onHowTo?: () => void;
  onViewImports?: () => void;
  loading?: boolean;
}

const archiveAccept = '.html,.htm,.js,.json,.csv,.txt,.zip';

function prettyFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

/** Source-style Rembr add surface. All network and routing work stays in the caller. */
export function RembrAddFlow({
  url,
  onUrlChange,
  onSaveLink,
  onWriteNote,
  files,
  onFilesChange,
  onImport,
  busy = false,
  progress = null,
  error = '',
  activeImportId = null,
  onCancelImport,
  onHowTo,
  onViewImports,
  loading = false,
}: RembrAddFlowProps) {
  const [mode, setMode] = useState<AddMode>('link');
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  function receiveFiles(incoming: File[]) {
    onFilesChange([...files, ...incoming]);
  }

  return (
    <div className="rembr-task-page mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            Keep it for later
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Add to your library</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Save a public page, write a note, or bring in supported social bookmarks. Rembr keeps the original link with each save.
          </p>
        </div>
        {onHowTo && (
          <button type="button" onClick={onHowTo} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-white/5">
            <FileText className="h-4 w-4" /> How to use
          </button>
        )}
      </header>

      <Tabs.Root value={mode} onValueChange={(value) => setMode(value as AddMode)} className="space-y-5">
      <Tabs.List activateOnFocus aria-label="Add to Rembr" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">
        <Tabs.Tab value="link" disabled={busy || loading}
          className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${mode === 'link' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}>
          <Link2 className="h-4 w-4" /> Save a link
        </Tabs.Tab>
        <Tabs.Tab value="archive" disabled={busy || loading}
          className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${mode === 'archive' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}>
          <Upload className="h-4 w-4" /> Import an archive
        </Tabs.Tab>
      </Tabs.List>

      {mode === 'link' ? (
        <Tabs.Panel value="link" render={<section />} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
            <form onSubmit={onSaveLink} className="space-y-5 p-5 md:p-8">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Save a public page</div>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Paste a link you want to keep</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Rembr captures a readable copy and keeps the source URL in your private library.</p>
              </div>
              {error && <div className="flex items-start gap-2 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive" role="alert"><X className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
              <label className="grid gap-2 text-xs font-semibold text-foreground" htmlFor="rembr-add-url">
                Public page URL
                <input id="rembr-add-url" type="url" autoComplete="url" inputMode="url" placeholder="https://example.com/article" required maxLength={2048} value={url} onChange={(event) => onUrlChange(event.currentTarget.value)} disabled={busy || loading}
                  className="min-h-12 w-full rounded-xl border border-white/10 bg-black px-4 text-sm font-normal text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary disabled:opacity-60" />
              </label>
              <button type="submit" disabled={busy || loading || !url.trim()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:scale-[1.01] disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-48">
                {busy || loading ? <LoadingSpinner label="Saving page" /> : <Link2 className="h-4 w-4" />}
                {busy || loading ? 'Saving page…' : 'Save page'}
              </button>
              {(busy || loading) && <p className="text-xs text-muted-foreground" role="status">Adding the page to your library. You can keep this page open while it processes.</p>}
            </form>
            <aside className="border-t border-white/10 bg-black/30 p-5 lg:border-l lg:border-t-0 lg:p-6">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><CheckCircle2 className="h-5 w-5" /></div>
              <h3 className="mt-4 font-display text-lg font-semibold">A useful copy, plus its source</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Save public web pages. Rembr shows processing state and any recovery action in your library.</p>
              <button type="button" onClick={onWriteNote} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-foreground transition hover:bg-white/5">
                <FileText className="h-3.5 w-3.5 text-primary" /> Or write a note <ArrowRight className="h-3 w-3" />
              </button>
            </aside>
          </div>
        </Tabs.Panel>
      ) : (
        <Tabs.Panel value="archive" render={<section />} className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="space-y-4">
              <MagneticDropZone accept={archiveAccept} maxSize={25 * 1024 * 1024} maxFiles={20} maxTotalSize={100 * 1024 * 1024} multiple selectedFiles={files} onFilesChange={receiveFiles} disabled={busy || loading} label="Drop your export files here" hint="or browse · HTML, JSON, CSV, JS, TXT, or ZIP · up to 25 MiB each" />
              <p id="rembr-import-support" className="mx-auto mt-4 max-w-2xl text-xs leading-5 text-muted-foreground">Instagram saved posts and saved folders; Pinterest pins and boards; X bookmarks. Supported files include HTML, HTM, JSON, CSV, JS, TXT, and ZIP archives. The files accepted within an archive depend on the detected source.</p>

              {files.length > 0 ? (
                <div className="mt-7 text-left">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{files.length} file{files.length === 1 ? '' : 's'} selected</span><span>{prettyFileSize(totalBytes)} total</span></div>
                  <ul className="space-y-2" aria-label="Selected export files">
                    {files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-black px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-mono text-xs">{file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{prettyFileSize(file.size)}</span>
                      <button type="button" onClick={() => onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`} disabled={busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground disabled:opacity-50"><X className="h-4 w-4" /></button>
                    </li>)}
                  </ul>
                </div>
              ) : (
                <div className="mx-auto mt-7 flex max-w-lg items-center justify-center gap-2 rounded-xl border border-white/5 bg-black/30 px-4 py-3 text-left text-xs text-muted-foreground" role="status">
                  <Upload className="h-4 w-4 shrink-0 text-primary" /><span>No files selected yet. Your archive stays on this device until you start the import.</span>
                </div>
              )}
            </div>

            <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Before you import</p>
              <h3 className="mt-2 font-display text-lg font-bold">What Rembr will read</h3>
              <ul className="mt-4 space-y-3 text-xs leading-5 text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Only recognized Instagram, Pinterest, and X bookmark export files.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Up to 20 files, 25 MiB per file, and 100 MiB total.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Instagram imports keep up to 300 of the newest saved posts and reels.</span></li>
              </ul>
              {onHowTo && <button type="button" onClick={onHowTo} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-foreground transition hover:bg-white/5"><FileText className="h-3.5 w-3.5 text-primary" /> Open import guide</button>}
              {onViewImports && <button type="button" onClick={onViewImports} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-foreground transition hover:bg-white/5"><PackageOpen className="h-3.5 w-3.5 text-primary" /> View import history</button>}
            </aside>
          </div>

          {error && <div className="flex items-start gap-2 rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-sm text-destructive" role="alert"><X className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
          {loading && !busy && <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-muted-foreground" role="status"><LoadingSpinner label="Preparing import" /> Checking the selected files…</div>}

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="font-display text-base font-semibold">Ready when you are</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Rembr queues recognized saved links for processing after upload.</p></div>
              <div className="flex flex-col gap-2 sm:min-w-52 sm:flex-row">
                {busy && activeImportId && onCancelImport && <button type="button" onClick={onCancelImport} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold text-foreground transition hover:bg-white/5"><X className="h-4 w-4" /> Cancel upload</button>}
                <button type="button" onClick={onImport} disabled={busy || loading || files.length === 0} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? <LoadingSpinner label="Uploading files" /> : <Upload className="h-4 w-4" />}{busy ? 'Uploading export…' : 'Start import'}
                </button>
              </div>
            </div>
            {busy && <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4"><ProgressBar value={progress} label="Uploading export files" detail={typeof progress === 'number' ? `${Math.max(0, Math.min(100, progress))}%` : 'Preparing secure upload'} /></div>}
          </div>
        </Tabs.Panel>
      )}
      </Tabs.Root>
    </div>
  );
}

