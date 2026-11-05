import type { AiPreference, SavedItem } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { date, messageOf } from '../../app/helpers.js';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Progress } from '../../components/ui/progress.js';
import { SavedItemLink } from '../../components/SavedItemLink.js';
import { RembrAddFlow } from './RembrAddFlow.js';
import { PageHeader, ErrorState } from '../../app/RouteStates.js';

export function AddPage() {
  const [url, setUrl] = useState(''); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState(''); const [activeImportId, setActiveImportId] = useState(''); const navigate = useNavigate();
  const uploadController = useRef<AbortController | null>(null); const idempotencyKey = useRef<string | null>(null);
  async function submitUrl(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { const body = await api<{ item: SavedItem; duplicate: boolean }>('/api/items', { method: 'POST', body: JSON.stringify({ url }) }); navigate(`/app/items/${encodeURIComponent(body.item.id)}`, { state: { returnTo: '/app' } }); } catch (cause) { setError(messageOf(cause, 'Could not save that page.')); } finally { setBusy(false); } }
  async function submitFiles(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); setError('');
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (!files.length || files.length > 20) { setError('Select between 1 and 20 export files.'); return; }
    if (files.some((file) => file.size < 1 || file.size > 25 * 1024 * 1024)) { setError('Each export file must be 25 MiB or smaller.'); return; }
    if (total > 100 * 1024 * 1024) { setError('The selected files exceed the 100 MiB total limit.'); return; }
    const chunkSize = 5 * 1024 * 1024; const metadata = files.map((file) => ({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size, chunks: Math.ceil(file.size / chunkSize) }));
    setBusy(true); setProgress(0); const controller = new AbortController(); uploadController.current = controller; let manifestId = '';
    try {
      const key = idempotencyKey.current ?? crypto.randomUUID(); idempotencyKey.current = key;
      const manifest = await api<{ importId: string; status: string; files: Array<{ fileId: string }> }>('/api/imports', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ files: metadata }) });
      manifestId = manifest.importId; setActiveImportId(manifestId);
      if (!['uploading', 'staged'].includes(manifest.status)) { idempotencyKey.current = null; navigate(`/app/imports/${encodeURIComponent(manifestId)}`); return; }
      let uploaded = 0;
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex]!; const fileId = manifest.files[fileIndex]!.fileId;
        for (let index = 0; index < metadata[fileIndex]!.chunks; index += 1) {
          const start = index * chunkSize; const chunk = file.slice(start, Math.min(file.size, start + chunkSize));
          await api(`/api/imports/${manifest.importId}/files/${fileId}/chunks/${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk, signal: controller.signal });
          uploaded += chunk.size; setProgress(Math.round(uploaded / total * 100));
        }
      }
      idempotencyKey.current = null;
      navigate(`/app/imports/${encodeURIComponent(manifest.importId)}`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        if (manifestId) {
          try { const result = await api<{ cleanupStatus: string }>(`/api/imports/${encodeURIComponent(manifestId)}/cancel`, { method: 'POST' }); idempotencyKey.current = null; setError(result.cleanupStatus === 'complete' ? 'Upload canceled. Temporary files were removed. You can start a fresh import.' : 'Upload canceled. Temporary file cleanup will be retried.'); }
          catch { navigate(`/app/imports/${encodeURIComponent(manifestId)}`); }
        } else setError('Upload canceled. You can retry from this page.');
      } else setError(messageOf(cause, 'The export could not be uploaded. Retry to resume this import.'));
    }
    finally { uploadController.current = null; setActiveImportId(''); setBusy(false); }
  }
  return <RembrAddFlow
    url={url}
    onUrlChange={setUrl}
    onSaveLink={(event) => { event.preventDefault(); void submitUrl(event); }}
    onWriteNote={() => navigate('/app/notes/new', { state: { returnTo: '/app' } })}
    files={files}
    onFilesChange={(nextFiles) => { setFiles(nextFiles); idempotencyKey.current = null; setError(''); }}
    onImport={() => void submitFiles()}
    busy={busy}
    progress={progress}
    error={error}
    activeImportId={activeImportId}
    onCancelImport={() => uploadController.current?.abort()}
    onHowTo={() => navigate('/how-to-use')}
    onViewImports={() => navigate('/app/imports')}
  />;
}

interface ImportSummary { id: string; status: string; source: string; file_count: number; parsed_count: number; new_count: number; duplicate_count: number; skipped_count: number; failed_count: number; cleanup_status: string; error_code: string | null; created_at: string }

interface ImportEntry { id: string; item_id: string | null; source_platform: string; source_url: string | null; source_id: string | null; title: string; status: string; error_code: string | null; source_order: number | null }

const activeImportStatuses = new Set(['uploading', 'staged', 'parsing', 'queued', 'processing']);

interface ImportProgress { importId: string; status: string; total: number; settled: number; saved: number; paused: number; queued: number; processing: number; retryWaiting: number; failed: number; cancelled: number; parseFailed: number }

export function ImportStatusLabel({ status }: { status: string }) { return <span className={`status status-${status}`}>{status.replaceAll('_', ' ')}</span>; }

export function ImportsPage() {
  const [imports, setImports] = useState<ImportSummary[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); try { setImports((await api<{ imports: ImportSummary[] }>('/api/imports')).imports); setError(''); } catch (cause) { setError(messageOf(cause, 'Could not load imports.')); } finally { if (!quiet) setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!imports.some((entry) => activeImportStatuses.has(entry.status))) return undefined; const timer = window.setInterval(() => { void load(true); }, 2500); return () => window.clearInterval(timer); }, [imports, load]);
  return <><PageHeader title="Import history" description="See what was added, skipped, or needs attention." actions={<Link className="primary-button" to="/app/add">Import files</Link>} />
    {error && <p className="notice error" role="alert">{error}</p>}{loading ? <div className="phase2-state" role="status">Loading imports…</div> : imports.length ? <ul className="item-list">{imports.map((entry) => <li className="item-card" key={entry.id}><div className="item-main"><div className="item-info"><p className="item-domain">{entry.source} · {date(entry.created_at)}</p><Link className="item-title" to={`/app/imports/${encodeURIComponent(entry.id)}`}>{entry.file_count} file{entry.file_count === 1 ? '' : 's'} · {entry.new_count} new · {entry.duplicate_count} duplicate</Link><p className="item-description">{entry.parsed_count} parsed · {entry.failed_count} failed · raw cleanup {entry.cleanup_status}</p></div><div className="item-actions"><ImportStatusLabel status={entry.status} /></div></div></li>)}</ul> : <div className="empty-state"><span>✳</span><h2>No imports yet.</h2><p>Import a platform archive to bring saved links into your library.</p><Link className="primary-button" to="/app/add">Import files</Link></div>}
  </>;
}

export function ImportDetailPage() {
  const { importId = '' } = useParams();
  const [result, setResult] = useState<{ import: ImportSummary & { total_bytes: number; request_id: string }; entries: ImportEntry[] } | null>(null);
  const [aiPreference, setAiPreference] = useState<AiPreference | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [progressStale, setProgressStale] = useState(false);
  const [progressAnnouncement, setProgressAnnouncement] = useState('');
  const [busyImportAction, setBusyImportAction] = useState(false);
  const [busyAnalysis, setBusyAnalysis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setResult(await api<{ import: ImportSummary & { total_bytes: number; request_id: string }; entries: ImportEntry[] }>(`/api/imports/${encodeURIComponent(importId)}`));
      setError('');
    } catch (cause) {
      setError(messageOf(cause, 'Could not load this import.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [importId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { let alive = true; void api<{ preference: AiPreference }>('/api/ai/preferences').then((response) => { if (alive) setAiPreference(response.preference); }).catch(() => { if (alive) setAiPreference(null); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (!result) return undefined;
    let alive = true;
    let inFlight = false;
    let pollWhenAvailable = false;
    let timer: number | undefined;
    let failures = 0;
    let observedStatus = result.import.status;
    const pageIsVisible = () => document.visibilityState !== 'hidden';
    const poll = async () => {
      if (!alive || !pageIsVisible()) return;
      if (inFlight) {
        pollWhenAvailable = true;
        return;
      }
      inFlight = true;
      pollWhenAvailable = false;
      let nextDelay = 1000;
      try {
        const latest = (await api<{ progress: ImportProgress }>(`/api/imports/${encodeURIComponent(importId)}/progress`)).progress;
        setProgress(latest);
        setProgressStale(false);
        failures = 0;
        setResult((current) => current && (current.import.status !== latest.status || current.import.failed_count !== latest.parseFailed)
          ? { ...current, import: { ...current.import, status: latest.status, failed_count: latest.parseFailed } }
          : current);
        const parsingFinished = ['uploading', 'staged', 'parsing'].includes(observedStatus)
          && ['queued', 'processing', 'completed', 'partial', 'failed'].includes(latest.status);
        const becameTerminal = activeImportStatuses.has(observedStatus) && !activeImportStatuses.has(latest.status);
        if (becameTerminal) {
          setProgressAnnouncement(`Import finished: ${latest.saved.toLocaleString()} saved, ${latest.failed.toLocaleString()} failed, ${latest.cancelled.toLocaleString()} canceled.`);
        }
        observedStatus = latest.status;
        if (parsingFinished && result.entries.length === 0) await load(true);
        if (!activeImportStatuses.has(latest.status)) return;
      } catch {
        setProgressStale(true);
        failures += 1;
        nextDelay = Math.min(10_000, 1000 * (2 ** Math.min(failures, 3)));
      } finally {
        inFlight = false;
        if (alive && pageIsVisible() && activeImportStatuses.has(observedStatus)) {
          timer = window.setTimeout(() => void poll(), pollWhenAvailable ? 0 : nextDelay);
          pollWhenAvailable = false;
        }
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
      } else {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
        void poll();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (pageIsVisible()) void poll();
    return () => {
      alive = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [importId, result?.import.status, load]);
  if (loading) return <div className="phase2-state" role="status">Loading import…</div>;
  if (error || !result) return <ErrorState message={error || 'This import was not found.'} />;
  const needsProgress = activeImportStatuses.has(result.import.status);
  const totalFailures = progress ? progress.failed + progress.parseFailed : result.import.failed_count;
  const hasActiveImportWork = Boolean(progress && (progress.queued + progress.processing + progress.retryWaiting) > 0);
  async function importAction(action: 'cancel' | 'discard') {
    setBusyImportAction(true); setError('');
    try {
      if (action === 'discard' && !window.confirm('Remove only the new saved items created by this import? Duplicate references to existing items will be preserved. This cannot be undone.')) return;
      const endpoint = action === 'cancel' ? 'jobs/cancel' : 'discard-created-items';
      const response = await api<{ active?: number; deleted?: number }>(`/api/imports/${encodeURIComponent(importId)}/${endpoint}`, { method: 'POST' });
      if (action === 'cancel' && response.active) setProgressAnnouncement(`Cancellation requested. ${response.active.toLocaleString()} active saves are stopping.`);
      if (action === 'discard') setProgressAnnouncement(`${(response.deleted ?? 0).toLocaleString()} import-created items removed. Duplicate references were preserved.`);
      await load(true);
      const latest = await api<{ progress: ImportProgress }>(`/api/imports/${encodeURIComponent(importId)}/progress`);
      setProgress(latest.progress);
    } catch (cause) { setError(messageOf(cause, `Could not ${action} this import.`)); }
    finally { setBusyImportAction(false); }
  }
  async function queueAnalysis() {
    setBusyAnalysis(true); setError('');
    try {
      const queued = await api<{ queued: number; skipped: number; limit: number }>(`/api/imports/${encodeURIComponent(importId)}/ai-analysis`, { method: 'POST' });
      setProgressAnnouncement(`${queued.queued.toLocaleString()} Instagram posts queued for analysis. ${queued.skipped.toLocaleString()} were already analyzed or outside the 300-post limit.`);
    } catch (cause) { setError(messageOf(cause, 'Could not queue Instagram analysis.')); }
    finally { setBusyAnalysis(false); }
  }
  return <><div className="phase2-back"><Link to="/app/imports">← Back to imports</Link></div><PageHeader title={`${result.import.source} import`} description={`${result.import.file_count} files · ${(result.import.total_bytes / (1024 * 1024)).toFixed(1)} MiB`} actions={<ImportStatusLabel status={result.import.status} />} />
    <section className="phase2-panel"><h2>Results</h2>
      {progress && progress.total > 0 && !['uploading', 'staged', 'parsing'].includes(progress.status) ? <div className="import-progress">
        <Progress value={progress.settled} max={progress.total} label={`${progress.settled.toLocaleString()} of ${progress.total.toLocaleString()} saves processed`} showValue />
        <div className="import-progress-counts" aria-label="Import status counts">
          <span><strong>{progress.saved.toLocaleString()}</strong> saved</span>
          {progress.queued > 0 && <span><strong>{progress.queued.toLocaleString()}</strong> queued</span>}
          {progress.processing > 0 && <span><strong>{progress.processing.toLocaleString()}</strong> processing</span>}
          {progress.retryWaiting > 0 && <span><strong>{progress.retryWaiting.toLocaleString()}</strong> waiting to retry</span>}
          {progress.paused > 0 && <span><strong>{progress.paused.toLocaleString()}</strong> paused</span>}
          {progress.failed > 0 && <span><strong>{progress.failed.toLocaleString()}</strong> failed</span>}
          {progress.cancelled > 0 && <span><strong>{progress.cancelled.toLocaleString()}</strong> canceled</span>}
        </div>
      </div> : <p className="phase2-helper" role="status">{needsProgress ? 'Preparing your import…' : 'No new saves to process.'}</p>}
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{progressAnnouncement}</span>
      <div className="phase2-filter-summary import-progress-summary">
        <p>{result.import.parsed_count.toLocaleString()} parsed · {result.import.duplicate_count.toLocaleString()} duplicates{result.import.skipped_count > 0 ? ` · ${result.import.skipped_count.toLocaleString()} older Instagram saves skipped (300-item cap)` : ''} · {totalFailures.toLocaleString()} failed</p>
        <p>Raw file cleanup: {result.import.cleanup_status}</p>
        {progressStale && <p className="import-progress-stale" role="status">Live status is temporarily unavailable. Showing the last update.</p>}
        {result.import.error_code && <p className="notice error">{result.import.error_code.replaceAll('_', ' ')}</p>}
      </div>
      <div className="phase2-heading-actions" aria-label="Import recovery actions">
        {activeImportStatuses.has(result.import.status) && <button className="quiet-button" type="button" disabled={busyImportAction || !hasActiveImportWork} onClick={() => void importAction('cancel')}>Cancel remaining saves</button>}
        {!activeImportStatuses.has(result.import.status) && result.import.new_count > 0 && <button className="quiet-button" type="button" disabled={busyImportAction || hasActiveImportWork} onClick={() => void importAction('discard')}>Remove items created by this import</button>}
      </div>
    </section>
    {result.entries.some((entry) => entry.source_platform === 'instagram' && entry.status === 'saved') && <section className="phase2-panel ai-preference-panel" aria-labelledby="import-ai-analysis-title">
      <h2 id="import-ai-analysis-title">Analyze saved Instagram posts</h2>
      <p className="phase2-helper">Queue up to 300 saved posts or reels from this import for Meta analysis. Publicly accessible media and post text may be sent to Meta. Rembr applies a $30 per-import limit; the shared monthly AI limit also applies.</p>
      {aiPreference && !aiPreference.providerAvailable && <p className="field-note">Meta analysis is not currently available.</p>}
      <button className="quiet-button" type="button" disabled={busyAnalysis || !aiPreference?.providerAvailable} onClick={() => void queueAnalysis()}>{busyAnalysis ? 'Queueing analysis…' : 'Queue analysis for imported posts'}</button>
    </section>}
    <section className="phase2-panel"><h2>Imported links</h2>{result.entries.length ? <ul className="item-list">{result.entries.map((entry) => <li className="item-card" key={entry.id}><div className="item-main"><div className="item-info"><p className="item-domain">{entry.source_platform}{entry.source_id ? ` · ${entry.source_id}` : ''}</p>{entry.item_id ? <SavedItemLink className="item-title" itemId={entry.item_id}>{entry.title || entry.source_url}</SavedItemLink> : <span className="item-title">{entry.title || entry.source_url || 'Unrecognized export row'}</span>}{entry.source_url && <p className="item-description">{entry.source_url}</p>}{entry.error_code && <p className="item-description">{entry.error_code.replaceAll('_', ' ')}</p>}</div><div className="item-actions"><ImportStatusLabel status={entry.status} /></div></div></li>)}</ul> : <div className="phase2-state">{activeImportStatuses.has(result.import.status) ? 'Parsing is underway. Results will appear here automatically.' : 'No imported links were created for this file.'}</div>}</section>
  </>;
}
