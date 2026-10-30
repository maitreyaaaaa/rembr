import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
interface AdminUserSummary { userId: string; email: string; accountStatus: string; createdAt: string }
interface AdminUserDetail {
  userId: string;
  email: string;
  accountStatus: string;
  createdAt: string;
  username: string | null;
  operatorRole: string | null;
  dataCategories: Array<{ id: string; label: string; rowCount: number }>;
  recentSecurityActivity: Array<{ eventType: string; createdAt: string }>;
  latestDeletion: { status: string; requestedAt: string; completedAt: string | null } | null;
}
interface AdminOverviewGroup { total: number; byStatus: Record<string, number> }
interface AdminOverview {
  accounts: { total: number; active: number; disabled: number; new_last_24_hours: number; new_last_7_days: number };
  savedItems: AdminOverviewGroup;
  processingJobs: AdminOverviewGroup;
  imports: AdminOverviewGroup;
  deletionRequests: AdminOverviewGroup;
}
interface AdminQueueStatus { waiting: number; processing: number; oldestQueuedAt: string | null }
interface AdminWorkerStatus {
  sampledAt: string;
  processingJobs: AdminQueueStatus;
  imports: AdminQueueStatus;
  aiAnalysisJobs: AdminQueueStatus;
  exports: AdminQueueStatus;
}
interface AdminImportRow {
  reference: string;
  source: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  fileCount: number;
  totalBytes: number;
  parsedCount: number;
  newCount: number;
  duplicateCount: number;
  skippedCount: number;
  failedCount: number;
  entries: { accepted: number; duplicate: number; skipped: number; failed: number };
  jobs: { waiting: number; processing: number; completed: number; failed: number };
}
type AdminAuditSource = 'security' | 'deletion' | 'admin_access';
interface AdminAuditEvent {
  reference: string;
  source: AdminAuditSource;
  eventType: string;
  actorType: string;
  targetReference: string | null;
  createdAt: string;
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
  const [userQuery, setUserQuery] = useState('');
  const [userRows, setUserRows] = useState<AdminUserSummary[]>([]);
  const [userOffset, setUserOffset] = useState(0);
  const [userNextOffset, setUserNextOffset] = useState<number | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [selectedUserLoading, setSelectedUserLoading] = useState(false);
  const [selectedUserError, setSelectedUserError] = useState('');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [workerStatus, setWorkerStatus] = useState<AdminWorkerStatus | null>(null);
  const [workerStatusLoading, setWorkerStatusLoading] = useState(false);
  const [workerStatusError, setWorkerStatusError] = useState('');
  const [imports, setImports] = useState<AdminImportRow[]>([]);
  const [importsLoading, setImportsLoading] = useState(false);
  const [importsError, setImportsError] = useState('');
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [auditEventsLoaded, setAuditEventsLoaded] = useState(false);
  const [auditEventsLoading, setAuditEventsLoading] = useState(false);
  const [auditEventsError, setAuditEventsError] = useState('');
  const [auditSourceFilter, setAuditSourceFilter] = useState('');
  const [auditEventTypeFilter, setAuditEventTypeFilter] = useState('');
  const [auditTargetUserFilter, setAuditTargetUserFilter] = useState('');
  const [auditNextCursor, setAuditNextCursor] = useState<string | null>(null);
  const [auditCurrentCursor, setAuditCurrentCursor] = useState<string | undefined>();
  const [auditPreviousCursors, setAuditPreviousCursors] = useState<Array<string | undefined>>([]);
  const userSearchSequence = useRef(0);
  const userDetailSequence = useRef(0);
  const auditEventsSequence = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await request<{ role: OperatorRole | null }>('/api/admin/role');
      setRole(result.role);
      if (result.role === null) {
        setQueue([]);
        setOverview(null);
        setWorkerStatus(null);
        setImports([]);
        setAuditEvents([]);
        setAuditEventsLoaded(false);
        return;
      }
      const body = await request<{ deletions: QueueEntry[] }>('/api/admin/account-deletions?limit=50');
      setQueue(body.deletions);
      if (result.role === 'admin') {
        setOverviewLoading(true);
        setOverviewError('');
        setWorkerStatusLoading(true);
        setWorkerStatusError('');
        setImportsLoading(true);
        setImportsError('');
        const [summaryResult, statusResult, importsResult] = await Promise.allSettled([
          request<{ summary: AdminOverview }>('/api/admin/summary'),
          request<{ workerStatus: AdminWorkerStatus }>('/api/admin/worker/status'),
          request<{ imports: AdminImportRow[] }>('/api/admin/imports'),
        ]);
        if (summaryResult.status === 'fulfilled') setOverview(summaryResult.value.summary);
        else {
          const failure = summaryResult.reason as RequestError;
          setOverviewError(failure.message || 'Could not load the operations overview.');
          setOverview(null);
        }
        if (statusResult.status === 'fulfilled') setWorkerStatus(statusResult.value.workerStatus);
        else {
          const failure = statusResult.reason as RequestError;
          setWorkerStatusError(failure.message || 'Could not load worker status.');
          setWorkerStatus(null);
        }
        if (importsResult.status === 'fulfilled') setImports(importsResult.value.imports);
        else {
          const failure = importsResult.reason as RequestError;
          setImportsError(failure.message || 'Could not load recent imports.');
          setImports([]);
        }
        setOverviewLoading(false);
        setWorkerStatusLoading(false);
        setImportsLoading(false);
      } else { setOverview(null); setWorkerStatus(null); setImports([]); setAuditEvents([]); setAuditEventsLoaded(false); }
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

  async function searchUsers(offset = 0) {
    const query = userQuery.trim();
    if (query.length < 3) { setUserError('Enter at least three characters of the account email.'); return; }
    const sequence = ++userSearchSequence.current;
    userDetailSequence.current += 1;
    setUserLoading(true); setUserError(''); setSelectedUser(null); setSelectedUserLoading(false); setSelectedUserError('');
    try {
      const params = new URLSearchParams({ query, limit: '25', offset: String(offset) });
      const result = await request<{ users: AdminUserSummary[]; nextOffset: number | null }>(`/api/admin/users?${params}`);
      if (sequence !== userSearchSequence.current) return;
      setUserRows(result.users); setUserOffset(offset); setUserNextOffset(result.nextOffset);
    } catch (cause) {
      if (sequence !== userSearchSequence.current) return;
      const failure = cause as RequestError;
      setUserError(failure.message || 'Could not search accounts. Try again.');
      setUserRows([]); setUserNextOffset(null);
    } finally { if (sequence === userSearchSequence.current) setUserLoading(false); }
  }

  async function loadUser(userId: string) {
    const sequence = ++userDetailSequence.current;
    setSelectedUserLoading(true); setSelectedUserError(''); setSelectedUser(null);
    try {
      const result = await request<{ user: AdminUserDetail }>(`/api/admin/users/${encodeURIComponent(userId)}`);
      if (sequence !== userDetailSequence.current) return;
      setSelectedUser(result.user);
    } catch (cause) {
      if (sequence !== userDetailSequence.current) return;
      const failure = cause as RequestError;
      setSelectedUserError(failure.message || 'Could not load account details.');
    } finally { if (sequence === userDetailSequence.current) setSelectedUserLoading(false); }
  }

  async function loadAuditEvents(cursor?: string) {
    const sequence = ++auditEventsSequence.current;
    setAuditEventsLoading(true); setAuditEventsError(''); setAuditCurrentCursor(cursor);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (auditSourceFilter) params.set('source', auditSourceFilter);
      if (auditEventTypeFilter) params.set('eventType', auditEventTypeFilter);
      if (auditTargetUserFilter.trim()) params.set('targetUserId', auditTargetUserFilter.trim());
      if (cursor) params.set('cursor', cursor);
      const result = await request<{ auditEvents: AdminAuditEvent[]; nextCursor: string | null }>(`/api/admin/audit-events?${params}`);
      if (sequence !== auditEventsSequence.current) return;
      setAuditEvents(result.auditEvents); setAuditNextCursor(result.nextCursor); setAuditEventsLoaded(true);
    } catch (cause) {
      if (sequence !== auditEventsSequence.current) return;
      const failure = cause as RequestError;
      setAuditEventsError(failure.message || 'Could not load audit events.');
      setAuditEvents([]); setAuditNextCursor(null); setAuditEventsLoaded(true);
    } finally { if (sequence === auditEventsSequence.current) setAuditEventsLoading(false); }
  }

  function filterAuditEvents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuditPreviousCursors([]);
    void loadAuditEvents();
  }

  function nextAuditEventsPage() {
    if (!auditNextCursor) return;
    setAuditPreviousCursors((previous) => [...previous, auditCurrentCursor]);
    void loadAuditEvents(auditNextCursor);
  }

  function previousAuditEventsPage() {
    if (!auditPreviousCursors.length) return;
    const previous = auditPreviousCursors.at(-1);
    setAuditPreviousCursors((current) => current.slice(0, -1));
    void loadAuditEvents(previous);
  }

  return <main className="admin-support-page">
    <header className="admin-support-heading">
      <div><p className="eyebrow">Operator workspace</p><h1>Admin support</h1><p className="admin-support-intro">Review account deletion requests using the minimum information needed to act.</p></div>
      {role && <span className="admin-role-badge">{role === 'admin' ? 'Admin' : 'Support'}</span>}
    </header>

    {loading ? <section className="phase2-panel admin-state" role="status">Checking operator access and loading the queue…</section>
      : error && !role ? <section className="phase2-panel admin-state"><p className="notice error" role="alert">{error}</p><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></section>
      : role === null ? <section className="phase2-panel admin-state" role="status"><h2>Operator access required</h2><p>Your account does not have a support or admin role. If you believe this is a mistake, contact a Rembr administrator.</p></section>
      : <>
      {role === 'admin' && <section className="phase2-panel admin-users-panel" aria-labelledby="admin-users-title">
        <div className="admin-queue-heading"><div><h2 id="admin-users-title">Account lookup</h2><p className="phase2-helper">Admin-only directory with basic account details and record counts. Search terms are not retained in the audit log.</p></div></div>
        <form className="admin-user-search" onSubmit={(event) => { event.preventDefault(); void searchUsers(); }}>
          <label htmlFor="admin-user-query">Account email starts with</label>
          <input id="admin-user-query" type="search" autoComplete="off" maxLength={254} minLength={3} value={userQuery} onChange={(event) => { userSearchSequence.current += 1; userDetailSequence.current += 1; setUserQuery(event.target.value); setUserRows([]); setUserOffset(0); setUserNextOffset(null); setUserLoading(false); setSelectedUser(null); setSelectedUserLoading(false); }} placeholder="name@example.com" />
          <button className="primary-button" type="submit" disabled={userLoading}>{userLoading ? 'Searching…' : 'Search accounts'}</button>
        </form>
        {userError && <p className="notice error" role="alert">{userError}</p>}
        {userLoading ? <p className="phase2-state" role="status">Searching accounts…</p> : userRows.length > 0 ? <>
          <ul className="admin-user-results">{userRows.map((user) => <li key={user.userId}>
            <div><strong>{user.email}</strong><span>{user.accountStatus} · Created {formatDate(user.createdAt)}</span></div>
            <button className="quiet-button" type="button" onClick={() => void loadUser(user.userId)}>View account details</button>
          </li>)}</ul>
          <div className="admin-user-pagination"><button className="quiet-button" type="button" disabled={userLoading || userOffset === 0} onClick={() => void searchUsers(Math.max(0, userOffset - 25))}>Previous</button><button className="quiet-button" type="button" disabled={userLoading || userNextOffset === null} onClick={() => { if (userNextOffset !== null) void searchUsers(userNextOffset); }}>Next</button></div>
        </> : userOffset > 0 || userQuery.trim().length >= 3 ? <p className="admin-empty" role="status">No accounts match this search.</p> : <p className="admin-empty">Search by at least three email characters.</p>}
        {selectedUserLoading && <p className="phase2-state" role="status">Loading account details…</p>}
        {selectedUserError && <p className="notice error" role="alert">{selectedUserError}</p>}
        {selectedUser && <section className="admin-user-detail" aria-labelledby="admin-user-detail-title">
          <div className="admin-user-detail-heading"><div><h3 id="admin-user-detail-title">{selectedUser.email}</h3><p>{selectedUser.username ? `@${selectedUser.username} · ` : ''}{selectedUser.accountStatus} · Joined {formatDate(selectedUser.createdAt)}</p></div><button className="quiet-button" type="button" onClick={() => { userDetailSequence.current += 1; setSelectedUser(null); setSelectedUserLoading(false); }}>Close details</button></div>
          {selectedUser.operatorRole && <p className="admin-audit-note">Operator role: {selectedUser.operatorRole}</p>}
          <h4>Account data categories</h4><dl className="admin-user-counts">{selectedUser.dataCategories.map(({ id, label, rowCount }) => <div key={id}><dt>{label}</dt><dd>{rowCount.toLocaleString()}</dd></div>)}</dl>
          {selectedUser.latestDeletion && <p className="admin-audit-note">Latest deletion request: {selectedUser.latestDeletion.status.replaceAll('_', ' ')} · Requested {formatDate(selectedUser.latestDeletion.requestedAt)}{selectedUser.latestDeletion.completedAt ? ` · Completed ${formatDate(selectedUser.latestDeletion.completedAt)}` : ''}</p>}
          <h4>Recent security activity</h4>{selectedUser.recentSecurityActivity.length ? <ol className="admin-audit-list">{selectedUser.recentSecurityActivity.map((event, index) => <li key={`${event.createdAt}-${index}`}><strong>{event.eventType.replaceAll('_', ' ')}</strong><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></li>)}</ol> : <p className="admin-empty">No recent security events.</p>}
        </section>}
      </section>}
      {role === 'admin' && <section className="phase2-panel admin-overview-panel" aria-labelledby="admin-overview-title">
        <div className="admin-queue-heading"><div><h2 id="admin-overview-title">Operations overview</h2><p className="phase2-helper">Aggregate counts only. This view excludes account content, URLs, and credentials.</p></div></div>
        {overviewLoading ? <p className="phase2-state" role="status">Loading operational counts…</p>
          : overviewError ? <p className="notice error" role="alert">{overviewError}</p>
            : overview ? <dl className="admin-overview-grid">
              <div><dt>Accounts</dt><dd>{overview.accounts.total.toLocaleString()}</dd><span>{overview.accounts.active.toLocaleString()} active · {overview.accounts.disabled.toLocaleString()} disabled</span><span>{overview.accounts.new_last_24_hours.toLocaleString()} in 24h · {overview.accounts.new_last_7_days.toLocaleString()} in 7d</span></div>
              <div><dt>Saved items</dt><dd>{overview.savedItems.total.toLocaleString()}</dd><span>{overview.savedItems.byStatus.ready ?? 0} ready · {overview.savedItems.byStatus.failed ?? 0} failed</span></div>
              <div><dt>Processing jobs</dt><dd>{overview.processingJobs.total.toLocaleString()}</dd><span>{overview.processingJobs.byStatus.queued ?? 0} queued · {overview.processingJobs.byStatus.processing ?? 0} active</span></div>
              <div><dt>Imports</dt><dd>{overview.imports.total.toLocaleString()}</dd><span>{overview.imports.byStatus.failed ?? 0} failed · {overview.imports.byStatus.partial ?? 0} partial</span></div>
              <div><dt>Deletion requests</dt><dd>{overview.deletionRequests.total.toLocaleString()}</dd><span>{overview.deletionRequests.byStatus.pending_approval ?? 0} pending approval</span></div>
            </dl> : <p className="admin-empty">Operational counts are unavailable.</p>}
      </section>}
      {role === 'admin' && <section className="phase2-panel admin-overview-panel" aria-labelledby="admin-worker-status-title">
        <div className="admin-queue-heading"><div><h2 id="admin-worker-status-title">Worker queues</h2><p className="phase2-helper">Aggregate counts and oldest waiting times only. Individual jobs, account details, and error content are excluded.</p></div></div>
        {workerStatusLoading ? <p className="phase2-state" role="status">Loading worker status…</p>
          : workerStatusError ? <p className="notice error" role="alert">{workerStatusError}</p>
            : workerStatus ? <>
              <dl className="admin-overview-grid">
                {([
                  ['Saved-item jobs', workerStatus.processingJobs],
                  ['Imports', workerStatus.imports],
                  ['AI analysis', workerStatus.aiAnalysisJobs],
                  ['Data exports', workerStatus.exports],
                ] as Array<[string, AdminQueueStatus]>).map(([label, queue]) => <div key={label}>
                  <dt>{label}</dt><dd>{queue.waiting.toLocaleString()} waiting</dd>
                  <span>{queue.processing.toLocaleString()} processing · oldest {queue.oldestQueuedAt ? formatDate(queue.oldestQueuedAt) : 'none'}</span>
                </div>)}
              </dl>
              <p className="admin-audit-note">Snapshot updated {formatDate(workerStatus.sampledAt)}.</p>
            </> : <p className="admin-empty">Worker queue counts are unavailable.</p>}
      </section>}
      {role === 'admin' && <section className="phase2-panel admin-overview-panel" aria-labelledby="admin-imports-title">
        <div className="admin-queue-heading"><div><h2 id="admin-imports-title">Recent imports</h2><p className="phase2-helper">Operational import outcomes only. Account identifiers, filenames, saved URLs, item titles, and error content are excluded.</p></div></div>
        {importsLoading ? <p className="phase2-state" role="status">Loading recent imports…</p>
          : importsError ? <p className="notice error" role="alert">{importsError}</p>
            : imports.length ? <ul className="admin-user-results">{imports.map((entry) => <li key={entry.reference}>
              <div><strong>{entry.source} · {entry.status.replaceAll('_', ' ')}</strong>
                <span>Import ref {entry.reference} · Created {formatDate(entry.createdAt)}{entry.completedAt ? ` · Completed ${formatDate(entry.completedAt)}` : ''}</span>
                <span>{entry.fileCount} files · {Math.round(entry.totalBytes / (1024 * 1024))} MiB · {entry.parsedCount} parsed · {entry.newCount} new · {entry.duplicateCount} duplicates · {entry.skippedCount} skipped · {entry.failedCount} failed</span>
                <span>Jobs: {entry.jobs.waiting} waiting · {entry.jobs.processing} processing · {entry.jobs.completed} completed · {entry.jobs.failed} failed</span>
              </div>
            </li>)}</ul> : <p className="admin-empty" role="status">No imports have been recorded.</p>}
      </section>}
      {role === 'admin' && <section className="phase2-panel admin-overview-panel" aria-labelledby="admin-events-title">
        <div className="admin-queue-heading"><div><h2 id="admin-events-title">Audit events</h2><p className="phase2-helper">Browse security, deletion, and administrator-access events. Results contain fixed event labels, actor type, short hashed references, and timestamps only.</p></div></div>
        <form className="admin-user-search" onSubmit={filterAuditEvents}>
          <label htmlFor="admin-audit-source">Event source</label>
          <select id="admin-audit-source" value={auditSourceFilter} onChange={(event) => setAuditSourceFilter(event.target.value)}>
            <option value="">All sources</option><option value="security">Account security</option><option value="deletion">Account deletion</option><option value="admin_access">Admin access</option>
          </select>
          <label htmlFor="admin-audit-event-type">Event type</label>
          <select id="admin-audit-event-type" value={auditEventTypeFilter} onChange={(event) => setAuditEventTypeFilter(event.target.value)}>
            <option value="">All event types</option>
            {['sign_in', 'sign_out', 'deletion_requested', 'deletion_cancelled', 'requested', 'cancelled', 'approved', 'retry_requested', 'claim_acquired', 'step_started', 'step_completed', 'step_failed', 'completed', 'admin_summary_viewed', 'admin_worker_status_viewed', 'admin_import_list_viewed', 'admin_audit_events_viewed', 'admin_user_list_viewed', 'admin_user_detail_viewed'].map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
          </select>
          <label htmlFor="admin-audit-target">Target account ID (optional)</label>
          <input id="admin-audit-target" type="text" autoComplete="off" maxLength={36} value={auditTargetUserFilter} onChange={(event) => setAuditTargetUserFilter(event.target.value)} placeholder="Account UUID" />
          <p className="admin-audit-note">The account ID is used only to filter. The response and audit record retain only a short hash reference.</p>
          <button className="primary-button" type="submit" disabled={auditEventsLoading}>{auditEventsLoading ? 'Loading audit events…' : 'Load audit events'}</button>
        </form>
        {auditEventsError && <p className="notice error" role="alert">{auditEventsError}</p>}
        {auditEventsLoading ? <p className="phase2-state" role="status">Loading audit events…</p>
          : auditEventsLoaded ? auditEvents.length ? <ol className="admin-audit-list">{auditEvents.map((event) => <li key={event.reference}>
            <strong>{event.source.replaceAll('_', ' ')} · {event.eventType.replaceAll('_', ' ')}</strong>
            <span>Actor: {event.actorType} · Target ref: {event.targetReference ?? 'not applicable'} · Event ref: {event.reference}</span>
            <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
          </li>)}</ol> : <p className="admin-empty" role="status">No audit events match these filters.</p>
          : <p className="admin-empty">Choose filters and load the latest audit events.</p>}
        {auditEventsLoaded && <div className="admin-user-pagination">
          <button className="quiet-button" type="button" disabled={auditEventsLoading || auditPreviousCursors.length === 0} onClick={previousAuditEventsPage}>Previous</button>
          <button className="quiet-button" type="button" disabled={auditEventsLoading || !auditNextCursor} onClick={nextAuditEventsPage}>Next</button>
        </div>}
      </section>}
      <section className="phase2-panel admin-queue-panel" aria-labelledby="admin-queue-title">
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
      </section>
      </>}
  </main>;
}
