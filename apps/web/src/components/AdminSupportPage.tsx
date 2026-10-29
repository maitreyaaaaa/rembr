import { useCallback, useEffect, useState } from 'react';
import './admin-support-page.css';

type OperatorRole = 'support' | 'admin';
type DeletionStatus = 'pending_approval' | 'approved' | 'processing' | 'partial_failed' | 'failed';
interface QueueEntry {
  id: string;
  ownerReference: string;
  status: DeletionStatus;
  requestedAt: string;
  exportConfirmed: boolean;
  canRetry: boolean;
}
interface AuditEvent {
  eventType: string;
  actorType: 'owner' | 'admin' | 'worker';
  createdAt: string;
  metadata?: { step?: string; code?: string; attempt?: number };
}
interface RequestError extends Error { status?: number }
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

function readableStatus(status: DeletionStatus): string {
  return ({ pending_approval: 'Pending approval', approved: 'Approved', processing: 'Processing', partial_failed: 'Partially failed', failed: 'Failed' })[status];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function AdminSupportPage({ request }: { request: Request }) {
  const [role, setRole] = useState<OperatorRole | null | undefined>(undefined);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<{ id: string; kind: 'approve' | 'retry' } | null>(null);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [audit, setAudit] = useState<Record<string, { loading: boolean; events: AuditEvent[]; error: string }>>({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await request<{ role: OperatorRole | null }>('/api/admin/role');
      setRole(result.role);
      if (result.role === null) {
        setQueue([]);
        return;
      }
      const body = await request<{ deletions: QueueEntry[] }>('/api/admin/account-deletions?limit=50');
      setQueue(body.deletions);
    } catch (cause) {
      const failure = cause as RequestError;
      setError(failure.message || 'Could not load the operator queue. Try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  async function confirmAction() {
    if (!action) return;
    setBusyId(action.id);
    setError('');
    setNotice('');
    try {
      await request(`/api/admin/account-deletions/${encodeURIComponent(action.id)}/${action.kind}`, {
        method: 'POST', body: JSON.stringify({ confirm: true }),
      });
      setAction(null);
      setNotice(action.kind === 'approve' ? 'Deletion approved. The worker will continue processing it.' : 'Deletion retry scheduled. Completed steps will be skipped.');
      await load(true);
    } catch (cause) {
      const failure = cause as RequestError;
      setError(failure.message || 'The action could not be completed. Refresh the queue and try again.');
    } finally { setBusyId(''); }
  }

  async function loadAudit(requestId: string) {
    setAudit((current) => ({ ...current, [requestId]: { loading: true, events: current[requestId]?.events ?? [], error: '' } }));
    try {
      const result = await request<{ events: AuditEvent[] }>(`/api/admin/account-deletions/${encodeURIComponent(requestId)}/audit`);
      setAudit((current) => ({ ...current, [requestId]: { loading: false, events: result.events, error: '' } }));
    } catch (cause) {
      const failure = cause as RequestError;
      setAudit((current) => ({ ...current, [requestId]: { loading: false, events: current[requestId]?.events ?? [], error: failure.message || 'Could not load audit history.' } }));
    }
  }

  return <main className="admin-support-page">
    <header className="admin-support-heading">
      <div><p className="eyebrow">Operator workspace</p><h1>Admin support</h1><p className="admin-support-intro">Review account deletion requests using the minimum information needed to act.</p></div>
      {role && <span className="admin-role-badge">{role === 'admin' ? 'Admin' : 'Support'}</span>}
    </header>

    {loading ? <section className="phase2-panel admin-state" role="status">Checking operator access and loading the queue…</section>
      : error && !role ? <section className="phase2-panel admin-state"><p className="notice error" role="alert">{error}</p><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></section>
      : role === null ? <section className="phase2-panel admin-state" role="status"><h2>Operator access required</h2><p>Your account does not have a support or admin role. If you believe this is a mistake, contact a Rembr administrator.</p></section>
      : <section className="phase2-panel admin-queue-panel" aria-labelledby="admin-queue-title">
        <div className="admin-queue-heading"><div><h2 id="admin-queue-title">Account deletion queue</h2><p className="phase2-helper">The queue hides email addresses and account IDs. Support can review requests; only admins can approve or retry them.</p></div><button className="quiet-button" type="button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice success" role="status">{notice}</p>}
        <p className="admin-audit-note">Account IDs, emails, and private content are excluded from the queue and audit history.</p>
        {queue.length === 0 ? <p className="admin-empty" role="status">No deletion requests need operator attention.</p> : <ul className="admin-queue-list">
          {queue.map((entry) => {
            const selectedAction = action?.id === entry.id ? action.kind : null;
            const canApprove = role === 'admin' && entry.status === 'pending_approval';
            const canRetry = role === 'admin' && entry.canRetry;
            const auditState = audit[entry.id];
            return <li className="admin-queue-item" key={entry.id}>
              <div className="admin-queue-item-main"><div><span className={`admin-status admin-status-${entry.status}`}>{readableStatus(entry.status)}</span><p className="admin-queue-meta">Request <code>{entry.id}</code> · Owner ref <code>{entry.ownerReference}</code></p><p className="admin-queue-meta">Requested {formatDate(entry.requestedAt)} · Export confirmation recorded</p></div>
                {(canApprove || canRetry) && <div className="admin-queue-actions">
                  {canApprove && <button className="primary-button" type="button" disabled={Boolean(busyId)} onClick={() => { setAction({ id: entry.id, kind: 'approve' }); setError(''); }}>Approve deletion</button>}
                  {canRetry && <button className="quiet-button" type="button" disabled={Boolean(busyId)} onClick={() => { setAction({ id: entry.id, kind: 'retry' }); setError(''); }}>Retry cleanup</button>}
                </div>}
              </div>
              {selectedAction && <div className="admin-confirmation" role="group" aria-label={`${selectedAction === 'approve' ? 'Approve' : 'Retry'} deletion confirmation`}>
                <p>{selectedAction === 'approve' ? 'Approving allows the worker to permanently remove this account and its stored data. This cannot be undone.' : 'Retrying resumes deletion from the remaining steps. Previously completed cleanup steps will be skipped.'}</p>
                <div><button className="primary-button" type="button" disabled={busyId === entry.id} onClick={() => void confirmAction()}>{busyId === entry.id ? 'Saving…' : selectedAction === 'approve' ? 'Confirm approval' : 'Confirm retry'}</button><button className="quiet-button" type="button" disabled={busyId === entry.id} onClick={() => setAction(null)}>Cancel</button></div>
              </div>}
              <details className="admin-audit-disclosure" onToggle={(event) => { if (event.currentTarget.open && !audit[entry.id]) void loadAudit(entry.id); }}>
                <summary>View audit history</summary>
                {auditState?.loading ? <p className="phase2-state" role="status">Loading audit history…</p>
                  : auditState?.error ? <div><p className="notice error" role="alert">{auditState.error}</p><button className="quiet-button" type="button" onClick={() => void loadAudit(entry.id)}>Try again</button></div>
                    : auditState?.events.length ? <ol className="admin-audit-list">{auditState.events.map((event, index) => <li key={`${event.createdAt}-${event.eventType}-${index}`}>
                      <span><strong>{event.eventType.replaceAll('_', ' ')}</strong> by {event.actorType}</span>
                      <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                      {event.metadata && <span className="admin-audit-meta">{[event.metadata.step && `Step: ${event.metadata.step.replaceAll('_', ' ')}`, event.metadata.code && `Code: ${event.metadata.code.replaceAll('_', ' ')}`, event.metadata.attempt !== undefined && `Attempt ${event.metadata.attempt}`].filter(Boolean).join(' · ')}</span>}
                    </li>)}</ol> : auditState ? <p className="admin-empty">No audit events are recorded for this request.</p> : null}
              </details>
            </li>;
          })}
        </ul>}
      </section>}
  </main>;
}
