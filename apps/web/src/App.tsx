import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext,
  useParams, useSearchParams,
} from 'react-router-dom';
import { MarketingSite } from './MarketingSite.js';
import { AvatarUpload } from './components/AvatarUpload.js';
import { PasswordStrengthField } from './components/PasswordStrengthField.js';
import { Progress } from './components/ui/progress.js';
import { SavedItemLink } from './components/SavedItemLink.js';
import { SmartCollectionsPage } from './components/SmartCollectionsPage.js';

type Status = 'queued' | 'processing' | 'retry_wait' | 'cancel_requested' | 'cancelled' | 'paused' | 'partial' | 'ready' | 'failed';
interface User { id: string; email: string }
interface Profile { userId: string; username: string; avatarUrl: string | null; avatarAssetId?: string | null; avatarAssetUrl?: string | null }
interface Tag { id: string; name: string }
interface Collection { id: string; name: string; description?: string }
interface Asset { id: string; url: string; mime: string; byteSize: number }
interface MediaAsset { id: string; url: string | null; mime: string | null; byteSize: number; status: 'ready' | 'failed'; errorCode: string | null }
interface Note { body: string; links: string[]; assets: Asset[] }
interface SavedItem {
  id: string; url: string; title: string; description: string; titleOverride?: string | null;
  descriptionOverride?: string | null; kind: 'page' | 'note'; status: Status; errorCode: string | null;
  createdAt: string; updatedAt: string; textPreview: string; text?: string; fetchedAt?: string;
  tags: Tag[]; collections: Collection[]; note?: Note; media?: MediaAsset[];
}
interface Onboarding { contentTypes: string[]; referralSource: string; completedAt: string | null; skippedAt: string | null }
interface AiPreference { enabled: boolean; consentVersion: string | null; consentedAt: string | null; disabledAt: string | null; updatedAt: string | null; providerAvailable: boolean }
type AiSearchPreference = AiPreference;
interface AiAnalysisView { status: string; pauseReason: string | null; errorCode: string | null; updatedAt: string | null; result: null | { status: string; model: string; summary: string; visualDescription: string; ocrText: string; transcript: string; keywords: string[]; tags: string[]; imageCount: number; imageBytes: number; videoCount: number; videoBytes: number; createdAt: string } }
interface KnowledgeGraphItem { id: string; title: string; status: string; createdAt: string }
interface KnowledgeGraphGroup { id: string; type: string; label: string; itemCount: number; items: KnowledgeGraphItem[] }
interface KnowledgeGraphNode { id: string; type: string; label: string; itemId?: string; itemCount?: number }
interface KnowledgeGraphLink { id: string; source: string; target: string; type: string }
interface KnowledgeGraph { nodes: KnowledgeGraphNode[]; links: KnowledgeGraphLink[]; groups: KnowledgeGraphGroup[]; stats: { indexedItems: number; conceptNodes: number; links: number }; truncated: boolean }
interface CheckupItem { id: string; title: string; status: string; created_at: string }
interface CheckupReminder { id: string; itemId: string; remindAt: string; status: 'pending'; reason: string; note: string; item: CheckupItem }
interface LinkHealthCheck { id: string; itemId: string; title: string; status: 'ok' | 'broken' | 'unknown'; sourceUrl: string; finalUrl: string | null; httpStatus: number | null; errorCode: string; errorMessage: string; checkedAt: string }
interface LibraryCheckup { generatedAt: string; summary: { savedItems: number; unorganizedItems: number; needsAttention: number; olderSaves: number }; linkHealth: { checkedItems: number; brokenCount: number; unknownCount: number; lastCheckedAt: string | null; brokenLinks: LinkHealthCheck[] }; needsAttention: CheckupItem[]; olderSaves: CheckupItem[]; dueReminders: CheckupReminder[]; upcomingReminders: CheckupReminder[]; weeklyRediscovery: CheckupItem[]; dailyPick: CheckupItem | null; readOnly: true }
interface LibraryAnswer { question: string; answer: string; claims?: Array<{ text: string; citationIds: string[] }>; citations: Array<{ id: string; title: string; snippet: string }>; resultIds: string[]; searchEventId: string | null; mode: 'lexical-excerpts' | 'grounded-ai' }
interface LibraryChatTurn { role: 'user' | 'assistant'; content: string; response?: LibraryAnswer }
interface SavedItemSummary { id: string; itemId: string; generation: number; model: string; promptVersion: string; sourceCharacters: number; summary: string; createdAt: string; stale?: boolean }
const AI_DISCLOSURE_VERSION = '2026-10-29-v1';
const AI_SEARCH_DISCLOSURE_VERSION = '2026-10-29-v4';
interface Session { user: User; profile: Profile | null; profileComplete: boolean; accountStatus: 'active' | 'disabled' }
interface ApiError extends Error { status: number; code: string }

const contentOptions = [
  ['instagram', 'Instagram'], ['pinterest', 'Pinterest'], ['web_pages_links', 'Web pages and links'],
  ['screenshots', 'Screenshots'], ['documents_pdfs', 'Documents and PDFs'], ['voice_notes', 'Voice notes'],
  ['notes', 'Notes'], ['inspiration_ideas', 'Ideas'], ['videos_social_posts', 'Videos and social posts'],
] as const;
const referralOptions = [
  ['whatsapp_friend', 'WhatsApp or a friend'], ['instagram', 'Instagram'], ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'], ['x_twitter', 'X'], ['reddit', 'Reddit'], ['linkedin', 'LinkedIn'],
  ['google_search', 'Google search'], ['product_hunt', 'Product Hunt'], ['school_college', 'School or college'], ['other', 'Other'],
] as const;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers = new Headers(init.headers);
  if (!isForm && init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
    const error = new Error(payload.error?.message ?? 'Rembr could not complete that request. Try again.') as ApiError;
    error.status = response.status;
    error.code = payload.error?.code ?? 'request_failed';
    if (error.status === 401 || error.status === 403) window.dispatchEvent(new CustomEvent('rembr:auth-error', { detail: { status: error.status, code: error.code } }));
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function apiWithProgress<T>(path: string, body: FormData, signal: AbortSignal, onProgress: (progress: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => request.abort();
    if (signal.aborted) { reject(new DOMException('Upload canceled.', 'AbortError')); return; }
    request.open('PATCH', path);
    request.withCredentials = true;
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100));
    });
    request.addEventListener('load', () => {
      cleanup();
      let payload: { error?: { code?: string; message?: string } } = {};
      try { payload = JSON.parse(request.responseText) as typeof payload; } catch { /* A successful empty response is handled below. */ }
      if (request.status < 200 || request.status >= 300) {
        const error = new Error(payload.error?.message ?? 'Rembr could not complete that request. Try again.') as ApiError;
        error.status = request.status;
        error.code = payload.error?.code ?? 'request_failed';
        if (error.status === 401 || error.status === 403) window.dispatchEvent(new CustomEvent('rembr:auth-error', { detail: { status: error.status, code: error.code } }));
        reject(error);
        return;
      }
      onProgress(100);
      if (request.status === 204) resolve(undefined as T);
      else {
        try { resolve(JSON.parse(request.responseText) as T); }
        catch { reject(new Error('Rembr returned an invalid response. Try again.')); }
      }
    });
    request.addEventListener('error', () => { cleanup(); reject(new Error('The upload could not reach Rembr. Check your connection and try again.')); });
    request.addEventListener('abort', () => { cleanup(); reject(new DOMException('Upload canceled.', 'AbortError')); });
    signal.addEventListener('abort', abort, { once: true });
    request.send(body);
  });
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') return error.message;
  return fallback;
}
function readableStatus(status: Status): string {
  return ({ queued: 'Waiting to process', processing: 'Saving page content', retry_wait: 'Retry scheduled', cancel_requested: 'Canceling', cancelled: 'Canceled', paused: 'Paused', partial: 'Partially ready', ready: 'Ready to read', failed: 'Could not process' })[status];
}
function date(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
}
function sameAppPath(value: string | null | undefined): string {
  return value === '/app' || value?.startsWith('/app/') ? value : '/app';
}

function AppRoutes() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<MarketingSite />} />
    <Route path="/features" element={<MarketingSite />} />
    <Route path="/contact" element={<MarketingSite />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/app/setup/profile" element={<SetupRoute />} />
    <Route path="/app/setup/onboarding" element={<Navigate to="/app" replace />} />
    <Route path="/app" element={<ProtectedShell />}>
      <Route index element={<LibraryPage />} />
      <Route path="items/:itemId" element={<ItemDetailPage />} />
      <Route path="items/:itemId/edit" element={<ItemEditPage />} />
      <Route path="add" element={<AddPage />} />
      <Route path="imports" element={<ImportsPage />} />
      <Route path="imports/:importId" element={<ImportDetailPage />} />
      <Route path="notes/new" element={<NoteEditorPage />} />
      <Route path="notes/:itemId/edit" element={<NoteEditorPage />} />
      <Route path="collections" element={<CollectionsPage />} />
      <Route path="collections/:collectionId" element={<CollectionDetailPage />} />
      <Route path="smart-collections" element={<SmartCollectionsPage request={api} />} />
      <Route path="smart-collections/:collectionId" element={<SmartCollectionsPage request={api} />} />
      <Route path="tags" element={<TagsPage />} />
      <Route path="graph" element={<KnowledgeGraphPage />} />
      <Route path="checkup" element={<LibraryCheckupPage />} />
      <Route path="settings/profile" element={<SettingsPage />} />
      <Route path="settings/preferences" element={<SettingsPage />} />
    </Route>
    <Route path="*" element={<MarketingSite />} />
  </Routes></BrowserRouter>;
}

function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const returnTo = sameAppPath(new URLSearchParams(location.search).get('returnTo'));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify({ email, password }) });
      const session = await api<Session>('/api/auth/session');
      navigate(session.profileComplete ? returnTo : '/app/setup/profile', { replace: true, state: { returnTo } });
    } catch (cause) { setError(messageOf(cause, 'Sign in failed. Try again.')); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-story">
      <Link className="wordmark" to="/" aria-label="Rembr home">rembr<span>.</span></Link>
      <div className="story-copy"><h1 id="auth-title">Keep what you find.<br /><span>Find it again.</span></h1><p className="auth-copy">Save a public page with its source and a readable copy.</p></div>
      <div className="paper-scene" aria-hidden="true"><div className="paper-orbit paper-orbit-one" /><div className="paper-orbit paper-orbit-two" /><div className="paper-sheet paper-sheet-back"><span /><span /><span /></div><article className="paper-sheet paper-sheet-front"><div className="paper-meta"><span>FIELD NOTES</span><span>04 MIN READ</span></div><div className="paper-rule" /><strong>A little more room<br />to think.</strong><p>Good ideas are worth finding again.</p><div className="paper-lines"><i /><i /><i /></div><span className="paper-bookmark">↗</span></article><span className="paper-sticker">SAVED<br />FOR LATER</span></div>
      <div className="story-footer"><span className="story-check">✓</span> Private by design <span className="story-footer-dot">·</span> Made for the long read</div>
    </section>
    <section className="auth-card" aria-labelledby="auth-form-title"><div className="auth-card-heading"><h2 id="auth-form-title">{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2></div>
      <div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setPassword(''); setPasswordRevealed(false); setError(''); }}>Sign in</button><button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setPassword(''); setPasswordRevealed(false); setError(''); }}>Create account</button></div>
      <form className="stack-form" onSubmit={(event) => void submit(event)}><label htmlFor="email">Email address</label><input id="email" autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />{mode === 'register' ? <PasswordStrengthField id="password" value={password} onValueChange={setPassword} disabled={busy} /> : <><label htmlFor="password">Password</label><div className="password-input-wrap"><input id="password" name="password" autoComplete="current-password" type={passwordRevealed ? 'text' : 'password'} required minLength={1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="password-reveal" aria-label={passwordRevealed ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={passwordRevealed} onClick={() => setPasswordRevealed((current) => !current)}>{passwordRevealed ? 'Hide' : 'Show'}</button></div></>}{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? (mode === 'register' ? 'Creating account…' : 'Signing in…') : mode === 'register' ? 'Create your library' : 'Sign in to Rembr'}</button></form>
      <p className="privacy-note"><span>✳</span>Your library is private to your account. Rembr can save public pages.</p>
    </section>
  </main>;
}

function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setSession(await api<Session>('/api/auth/session')); }
    catch (cause) { setSession(null); if ((cause as ApiError).status !== 401) setError(messageOf(cause, 'Could not verify your session.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { session, setSession, loading, error, refresh };
}

function ProtectedShell() {
  const { session, setSession, loading } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [accountDenied, setAccountDenied] = useState(false);

  useEffect(() => {
    const handle = (event: Event) => {
      const custom = event as CustomEvent<{ status: number; code: string }>;
      if (custom.detail.status === 401) {
        setSession(null);
        navigate(`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`, { replace: true });
      } else if (custom.detail.status === 403 && custom.detail.code === 'account_disabled') {
        setSession(null); setAccountDenied(true);
      }
    };
    window.addEventListener('rembr:auth-error', handle);
    return () => window.removeEventListener('rembr:auth-error', handle);
  }, [location.pathname, location.search, navigate, setSession]);

  if (loading) return <main className="center-state" role="status">Checking your session…</main>;
  if (accountDenied) return <main className="phase2-centered"><section className="phase2-card"><h1>Account unavailable</h1><p>This account is disabled, so its library is unavailable.</p><Link className="quiet-button" to="/login">Back to sign in</Link></section></main>;
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (!session.profileComplete && !location.pathname.startsWith('/app/setup/')) return <Navigate to="/app/setup/profile" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  return <div className="workspace phase2-workspace"><AppNav session={session} onLogout={async () => { await api('/api/auth/logout', { method: 'POST' }); setSession(null); navigate('/login', { replace: true }); }} /><div className="phase2-main"><Outlet context={{ session, setSession }} /></div></div>;
}

function AppNav({ session, onLogout }: { session: Session; onLogout: () => Promise<void> }) {
  const [logoutBusy, setLogoutBusy] = useState(false);
  const location = useLocation();
  const activeMoreLink = [{ path: '/app/imports', label: 'Imports' }, { path: '/app/tags', label: 'Tags' }, { path: '/app/graph', label: 'Connections' }, { path: '/app/checkup', label: 'Review' }, { path: '/app/settings', label: 'Settings' }].find(({ path }) => location.pathname.startsWith(path));
  return <header className="phase2-topbar"><Link className="wordmark" to="/app">rembr<span>.</span></Link><nav aria-label="Workspace navigation" className="phase2-nav"><NavLink to="/app" label="Library" /><NavLink to="/app/collections" label="Collections" /><NavLink to="/app/smart-collections" label="Smart collections" /><details className={`phase2-nav-more${activeMoreLink ? ' active' : ''}`}><summary>{activeMoreLink ? `More · ${activeMoreLink.label}` : 'More'} <span aria-hidden="true">⌄</span></summary><div className="phase2-nav-menu"><NavLink to="/app/imports" label="Imports" /><NavLink to="/app/tags" label="Tags" /><NavLink to="/app/graph" label="Connections" /><NavLink to="/app/checkup" label="Review" /><NavLink to="/app/settings/profile" label="Settings" /></div></details></nav><div className="phase2-account"><span>{session.profile?.username ? `@${session.profile.username}` : session.user.email}</span><button type="button" className="quiet-button" disabled={logoutBusy} onClick={() => { setLogoutBusy(true); void onLogout().finally(() => setLogoutBusy(false)); }}>Sign out</button></div></header>;
}
function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation(); const active = to === '/app' ? location.pathname === '/app' : location.pathname.startsWith(to);
  return <Link to={to} className={active ? 'phase2-nav-link active' : 'phase2-nav-link'} aria-current={active ? 'page' : undefined}>{label}</Link>;
}

function SetupRoute() {
  const { session, loading, refresh } = useSession(); const location = useLocation(); const navigate = useNavigate();
  const returnTo = sameAppPath((location.state as { returnTo?: string } | null)?.returnTo);
  if (loading) return <main className="center-state" role="status">Checking your session…</main>;
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (session.profileComplete) return <Navigate to={returnTo} replace />;
  return <main className="phase2-centered phase2-setup-shell"><section className="phase2-card phase2-setup-card"><Link className="wordmark" to="/">rembr<span>.</span></Link><ProfileForm session={session} onComplete={async () => { await refresh(); navigate(returnTo, { replace: true }); }} /></section></main>;
}

function ProfileForm({ session, onComplete }: { session: Session; onComplete: () => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [profile, setProfile] = useState<Profile | null>(session.profile);
  const [username, setUsername] = useState(session.profile?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(session.profile?.avatarUrl ?? '');
  const [avatarUrlChanged, setAvatarUrlChanged] = useState(false);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarCleared, setAvatarCleared] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      let body: { profile: Profile };
      if (avatar) {
        const form = new FormData(); form.set('username', username); form.set('avatar', avatar);
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        const uploadStartedAt = performance.now();
        setAvatarProgress(1);
        setAvatarUploadError('');
        body = await apiWithProgress('/api/profile', form, controller.signal, setAvatarProgress);
        const visibleFor = 420 - (performance.now() - uploadStartedAt);
        if (visibleFor > 0) await new Promise((resolve) => window.setTimeout(resolve, visibleFor));
      }
      else body = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ username, ...(avatarCleared ? { avatarUrl: '' } : avatarUrlChanged ? { avatarUrl } : {}) }) });
      setProfile(body.profile); await onComplete();
    } catch (cause) {
      const message = messageOf(cause, 'Could not save your profile.');
      if (avatar) setAvatarUploadError(`${message.replace(/[.!?]+$/, '')}. Your previous photo is unchanged.`);
      else setError(message);
    }
    finally { uploadAbortRef.current = null; setAvatarProgress(null); setBusy(false); }
  }
  return <><h1>Choose a username</h1><p className="phase2-lead">This name appears on your profile. Your account email stays private.</p><form ref={formRef} className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="profile-username">Username</label><div className="phase2-prefix"><span>@</span><input id="profile-username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" autoComplete="username" value={username} disabled={busy} onChange={(event) => setUsername(event.target.value)} /></div><p className="field-note">3–24 letters, numbers, or underscores.</p><AvatarUpload name={username || 'Your profile'} src={avatarUrlChanged ? avatarUrl : profile?.avatarAssetUrl ?? profile?.avatarUrl} file={avatar} busy={busy && Boolean(avatar)} progress={avatarProgress} uploadError={avatarUploadError} onCancelUpload={() => uploadAbortRef.current?.abort()} onRetryUpload={() => formRef.current?.requestSubmit()} onDiscardUpload={() => { setAvatar(null); setAvatarCleared(false); setAvatarUploadError(''); }} onChange={(file, removed) => { setAvatar(file); setAvatarCleared(Boolean(removed)); setAvatarUploadError(''); if (file || removed) { setAvatarUrl(''); setAvatarUrlChanged(false); } setError(''); }} /><details className="avatar-url-option"><summary>Or use a public photo URL</summary><label htmlFor="profile-avatar-url">HTTPS photo URL <span>(optional)</span></label><input id="profile-avatar-url" type="url" inputMode="url" pattern="https://.*" placeholder="https://example.com/photo.jpg" value={avatarUrl} disabled={busy} onChange={(event) => { setAvatarUrl(event.target.value); setAvatarUrlChanged(true); setAvatar(null); setAvatarCleared(false); }} /><p className="field-note">Only use a photo URL you trust. It must start with https://.</p></details>{profile && <p className="phase2-helper">Current profile: @{profile.username}</p>}{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving profile…' : 'Save and continue'}</button></form></>;
}

interface ShellContext { session: Session; setSession: (session: Session | null) => void }
function useShell() { return useOutletContext<ShellContext>(); }

function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const askInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<SavedItem[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false); const [searchEventId, setSearchEventId] = useState<string | null>(null); const [searchFeedback, setSearchFeedback] = useState<Record<string, 'helpful' | 'not_helpful'>>({});
  const [askQuestion, setAskQuestion] = useState(''); const [libraryConversation, setLibraryConversation] = useState<LibraryChatTurn[]>([]); const [askBusy, setAskBusy] = useState(false); const [askError, setAskError] = useState('');
  const [tags, setTags] = useState<Tag[]>([]); const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const search = searchParams.get('search') ?? ''; const type = searchParams.get('type') ?? ''; const status = searchParams.get('status') ?? ''; const tagId = searchParams.get('tagId') ?? ''; const collectionId = searchParams.get('collectionId') ?? ''; const sort = searchParams.get('sort') ?? (search ? 'relevance' : 'created_desc'); const cursor = searchParams.get('cursor') ?? '';
  const hasActiveFilters = Boolean(search || type || status || tagId || collectionId);
  const selectedTag = tags.find((tag) => tag.id === tagId);
  const selectedCollection = collections.find((collection) => collection.id === collectionId);
  const query = useMemo(() => { const params = new URLSearchParams({ search, sort, limit: '25' }); if (type) params.set('type', type); if (status) params.set('status', status); if (tagId) params.set('tagId', tagId); if (collectionId) params.set('collectionId', collectionId); if (cursor) params.set('cursor', cursor); return params.toString(); }, [search, sort, type, status, tagId, collectionId, cursor]);
  const load = useCallback(async () => { setLoading(true); setError(''); setSearchEventId(null); setSearchFeedback({}); try { const body = await api<{ items: SavedItem[]; nextCursor: string | null; hasMore: boolean; searchEventId: string | null }>(`/api/items?${query}`); setItems(body.items); setNextCursor(body.nextCursor); setHasMore(body.hasMore); setSearchEventId(body.searchEventId); } catch (cause) { setError(messageOf(cause, 'Could not load your library.')); } finally { setLoading(false); } }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), search.trim() ? 300 : 0); return () => window.clearTimeout(timer); }, [load, search]);
  useEffect(() => { let alive = true; void Promise.all([api<{ tags: Tag[] }>('/api/tags'), api<{ collections: Collection[] }>('/api/collections')]).then(([tagResult, collectionResult]) => { if (alive) { setTags(tagResult.tags); setCollections(collectionResult.collections); } }).catch(() => undefined); return () => { alive = false; }; }, []);
  function updateFilter(key: string, value: string) { const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); next.delete('cursor'); setSearchParams(next); }
  function setSearch(value: string) { const next = new URLSearchParams(searchParams); if (value) { next.set('search', value); if (!searchParams.has('sort')) next.set('sort', 'relevance'); } else { next.delete('search'); if (next.get('sort') === 'relevance') next.delete('sort'); } next.delete('cursor'); setSearchParams(next, { replace: true }); }
  function clearFilters() { const next = new URLSearchParams(searchParams); ['search', 'type', 'status', 'tagId', 'collectionId', 'cursor'].forEach((key) => next.delete(key)); if (next.get('sort') === 'relevance') next.delete('sort'); setSearchParams(next); }
  async function remove(item: SavedItem) { if (!window.confirm(`Remove “${item.title}” and its child data from your library?`)) return; try { await api(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not remove item.')); } }
  async function rateSearchResult(item: SavedItem, rating: 'helpful' | 'not_helpful') { if (!searchEventId) return; setError(''); try { await api('/api/search/feedback', { method: 'POST', body: JSON.stringify({ searchEventId, itemId: item.id, rating }) }); setSearchFeedback((current) => ({ ...current, [item.id]: rating })); } catch (cause) { setError(messageOf(cause, 'Could not save search feedback.')); } }
  async function askLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = askQuestion.trim();
    if (!question) return;
    setAskBusy(true); setAskError('');
    try {
      const response = await api<LibraryAnswer>('/api/knowledge/answer', { method: 'POST', body: JSON.stringify({
        question, messages: libraryConversation.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 1_200) })),
      }) });
      const nextTurns: LibraryChatTurn[] = [
        { role: 'user', content: question },
        { role: 'assistant', content: response.answer, response },
      ];
      setLibraryConversation((current) => [...current, ...nextTurns].slice(-12));
      setAskQuestion('');
    } catch (cause) { setAskError(messageOf(cause, 'Could not search your library.')); }
    finally { setAskBusy(false); }
  }
  function startNewLibraryChat() { setLibraryConversation([]); setAskQuestion(''); setAskError(''); askInputRef.current?.focus(); }
  return <><div className="phase2-page-heading"><div><h1>Your library</h1><p>Search saved pages and notes.</p></div><div className="phase2-heading-actions"><Link className="quiet-button" to="/app/notes/new" state={{ returnTo: `${location.pathname}${location.search}` }}>New note</Link><Link className="primary-button" to="/app/add">Save a page</Link></div></div>
    <section className="phase2-panel" aria-label="Library controls"><div className="phase2-filter-grid"><label>Search<input type="search" maxLength={120} placeholder="Titles, notes, page text, and analysis" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Type<select value={type} onChange={(event) => updateFilter('type', event.target.value)}><option value="">All types</option><option value="page">Pages</option><option value="note">Notes</option></select></label><label>Status<select value={status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option><option value="queued">Queued</option><option value="processing">Processing</option><option value="retry_wait">Retry scheduled</option><option value="paused">Paused</option><option value="partial">Partially ready</option><option value="ready">Ready</option><option value="failed">Failed</option><option value="cancelled">Canceled</option></select></label><label>Tag<select value={tagId} onChange={(event) => updateFilter('tagId', event.target.value)}><option value="">Any tag</option>{tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}</select></label><label>Collection<select value={collectionId} onChange={(event) => updateFilter('collectionId', event.target.value)}><option value="">Any collection</option>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="relevance">Most relevant</option><option value="created_desc">Newest first</option><option value="created_asc">Oldest first</option><option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option></select></label></div>{hasActiveFilters && <div className="phase2-filter-summary"><p>Filtered by{search && <> <strong>“{search}”</strong></>}{type && <> <strong>{type === 'page' ? 'Pages' : 'Notes'}</strong></>}{status && <> <strong>{readableStatus(status as Status)}</strong></>}{selectedTag && <> <strong>Tag: {selectedTag.name}</strong></>}{selectedCollection && <> <strong>Collection: {selectedCollection.name}</strong></>}</p><button className="phase2-text-button" type="button" onClick={clearFilters}>Clear filters</button></div>}</section>
    <section className="phase2-panel library-answer-panel" aria-labelledby="library-answer-title"><div className="phase2-heading-actions"><div><h2 id="library-answer-title">Ask your library</h2><p className="phase2-helper">Ask follow-up questions about matching saved items. With grounded answers enabled, Rembr may send matching saved text or stored media-analysis excerpts, plus recent conversation context, to Meta AI; claims are shown only with citations to retrieved items.</p></div>{libraryConversation.length > 0 && <button className="quiet-button" type="button" onClick={startNewLibraryChat}>New conversation</button>}</div>{libraryConversation.length > 0 && <ol className="library-answer-result" role="log" aria-label="Library conversation" aria-live="polite" aria-relevant="additions">{libraryConversation.map((turn, index) => <li key={`${index}-${turn.role}`}><p><strong>{turn.role === 'user' ? 'You' : turn.response?.mode === 'grounded-ai' ? 'Grounded answer' : 'Saved evidence preview'}:</strong> {turn.content}</p>{turn.response?.claims?.map((claim, claimIndex) => <p className="field-note" key={claimIndex}>Sources: {claim.citationIds.map((id) => turn.response!.citations.find((citation) => citation.id === id)?.title).filter(Boolean).join(', ')}</p>)}{turn.response?.citations.map((citation) => <p className="field-note" key={citation.id}><SavedItemLink itemId={citation.id}>{citation.title}</SavedItemLink>: {citation.snippet}</p>)}</li>)}</ol>}<form className="phase2-inline-form" onSubmit={(event) => void askLibrary(event)}><label className="visually-hidden" htmlFor="library-question">{libraryConversation.length ? 'Ask a follow-up question about your saved library' : 'Question about your saved library'}</label><input ref={askInputRef} id="library-question" type="search" maxLength={120} required value={askQuestion} onChange={(event) => setAskQuestion(event.target.value)} placeholder={libraryConversation.length ? 'Ask a follow-up question' : 'Ask about your saved items, e.g. design systems'} /><button className="primary-button" type="submit" disabled={askBusy || !askQuestion.trim()}>{askBusy ? 'Searching…' : libraryConversation.length ? 'Send follow-up' : 'Ask / find evidence'}</button></form>{askError && <p className="notice error" role="alert">{askError}</p>}{askBusy && <p className="phase2-state" role="status">Searching your private library…</p>}</section>
    {error && <div className="notice error phase2-retry-notice" role="alert"><span>{error}</span><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></div>}
    {loading ? <div className="phase2-state" role="status">Loading your library…</div> : items.length === 0 ? <div className="empty-state"><span>✳</span><h2>{hasActiveFilters ? 'No saved items match these filters.' : 'Your library is ready for its first save.'}</h2><p>{hasActiveFilters ? 'Change your filters or clear them to see your full library.' : 'Save a page or write a note to start building your library.'}</p><div className="phase2-heading-actions">{hasActiveFilters && <button className="quiet-button" type="button" onClick={clearFilters}>Clear filters</button>}<Link className="quiet-button" to="/app/notes/new" state={{ returnTo: `${location.pathname}${location.search}` }}>Write a note</Link><Link className="primary-button" to="/app/add">Save a page</Link></div></div> : <ul className="item-list">{items.map((item) => <li className="item-card" key={item.id}><div className="item-main"><div className="item-info"><p className="item-domain">{item.kind === 'note' ? 'PERSONAL NOTE' : safeHost(item.url)}</p><SavedItemLink className="item-title" itemId={item.id}>{item.title}</SavedItemLink><p className="item-description">{item.description || item.note?.body || item.textPreview || 'No description yet.'}</p><div className="phase2-pills">{item.tags?.map((tag) => <span className="phase2-pill" key={tag.id}>{tag.name}</span>)}{item.collections?.map((collection) => <span className="phase2-pill soft" key={collection.id}>{collection.name}</span>)}</div>{search && searchEventId && <div className="search-result-feedback"><span>Was this result useful?</span><button className="quiet-button" type="button" aria-pressed={searchFeedback[item.id] === 'helpful'} onClick={() => void rateSearchResult(item, 'helpful')}>Helpful</button><button className="quiet-button" type="button" aria-pressed={searchFeedback[item.id] === 'not_helpful'} onClick={() => void rateSearchResult(item, 'not_helpful')}>Not helpful</button>{searchFeedback[item.id] && <span role="status">Thanks for the feedback.</span>}</div>}</div><div className="item-actions"><span className={`status status-${item.status}`}><span>●</span>{readableStatus(item.status)}</span><time dateTime={item.createdAt}>{date(item.createdAt)}</time><Link className="quiet-button" to={`/app/items/${encodeURIComponent(item.id)}/edit`} state={{ returnTo: `${location.pathname}${location.search}` }}>Edit</Link><button className="quiet-button danger-button" onClick={() => void remove(item)} type="button">Remove</button></div></div></li>)}</ul>}
    {!loading && items.length > 0 && <nav className="phase2-pagination" aria-label="Library pages"><span>{hasMore ? 'More items are available.' : 'You are at the end of your library.'}</span><button type="button" className="quiet-button" disabled={!searchParams.get('cursor')} onClick={() => { const next = new URLSearchParams(searchParams); next.delete('cursor'); setSearchParams(next); }}>First page</button><button type="button" className="primary-button" disabled={!hasMore || !nextCursor} onClick={() => { if (nextCursor) { const next = new URLSearchParams(searchParams); next.set('cursor', nextCursor); setSearchParams(next); } }}>Next page</button></nav>}
    <span className="visually-hidden" aria-live="polite">{items.length} saved items shown</span>
  </>;
}
function safeHost(value: string) { try { return new URL(value).hostname; } catch { return 'SAVED PAGE'; } }

function KnowledgeGraphPage() {
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
  const groups = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return graph?.groups ?? [];
    return (graph?.groups ?? []).filter((group) => group.label.toLowerCase().includes(query) || group.items.some((item) => item.title.toLowerCase().includes(query)));
  }, [filter, graph]);
  const visualGraph = useMemo(() => {
    const concepts = groups.slice(0, 8);
    const relatedItems = new Map<string, KnowledgeGraphItem>();
    for (const concept of concepts) for (const item of concept.items.slice(0, 2)) relatedItems.set(item.id, item);
    const items = [...relatedItems.values()].slice(0, 16);
    const height = Math.max(250, items.length * 52 + 56, concepts.length * 68 + 56);
    const conceptPositions = new Map(concepts.map((concept, index) => [concept.id, { x: 170, y: 28 + (index + 0.5) * (height - 56) / Math.max(concepts.length, 1) }]));
    const itemPositions = new Map(items.map((item, index) => [item.id, { x: 625, y: 28 + (index + 0.5) * (height - 56) / Math.max(items.length, 1) }]));
    const edges = concepts.flatMap((concept) => concept.items.slice(0, 2).filter((item) => itemPositions.has(item.id)).map((item) => ({ conceptId: concept.id, itemId: item.id })));
    return { concepts, items, height, conceptPositions, itemPositions, edges };
  }, [groups]);
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

  return <><PageHeader title="Connections" description="See how saved pages and notes link through topics, tags, and domains." actions={<div className="phase2-card-actions"><button className="quiet-button" type="button" disabled={exportingObsidian} onClick={() => void exportObsidianGraph()}>{exportingObsidian ? 'Preparing export…' : obsidianExported ? 'Obsidian export downloaded' : 'Export Obsidian graph'}</button><button className="quiet-button" type="button" disabled={loading || !graph} onClick={exportGraph}>{exported ? 'Graph downloaded' : 'Download graph JSON'}</button></div>} />
    {error && <div className="notice error phase2-retry-notice" role="alert"><span>{error}</span><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></div>}
    {loading ? <div className="phase2-state" role="status">Building your knowledge graph…</div> : graph && <>
      <section className="phase2-panel" aria-label="Knowledge graph summary"><div className="phase2-filter-grid"><div><p className="eyebrow">Saved items</p><strong>{graph.stats.indexedItems}</strong></div><div><p className="eyebrow">Connected concepts</p><strong>{graph.stats.conceptNodes}</strong></div><div><p className="eyebrow">Relationships</p><strong>{graph.stats.links}</strong></div></div><p className="phase2-helper">The graph uses your saved-item domains, tags, and collections. Opt-in media-analysis topics are included when available; the graph works without AI. Downloaded JSON includes the counts and whether this bounded graph is truncated.</p>{graph.truncated && <p className="phase2-helper" role="status">Showing the most-connected concepts across the latest saved items. Narrow this view to explore a specific topic.</p>}</section>
      {visualGraph.concepts.length > 0 && <section className="phase2-panel" aria-label="Knowledge graph map"><h2>Graph map</h2><p className="phase2-helper">A sample of the strongest links in your library. Use the connected-concepts list for the complete accessible view.</p><div style={{ overflowX: 'auto' }}><svg aria-hidden="true" viewBox={`0 0 800 ${visualGraph.height}`} style={{ display: 'block', width: '100%', minWidth: 640, maxHeight: 560 }}>{visualGraph.edges.map((edge) => { const source = visualGraph.conceptPositions.get(edge.conceptId); const target = visualGraph.itemPositions.get(edge.itemId); return source && target ? <line key={`${edge.conceptId}:${edge.itemId}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#c7d1e8" strokeWidth="1.5" /> : null; })}{visualGraph.concepts.map((concept) => { const position = visualGraph.conceptPositions.get(concept.id)!; return <g key={concept.id}><circle cx={position.x} cy={position.y} r="8" fill="#16a08d" /><text x={position.x + 16} y={position.y + 4} fill="#253046" fontSize="12">{concept.label.slice(0, 28)}</text></g>; })}{visualGraph.items.map((item) => { const position = visualGraph.itemPositions.get(item.id)!; return <g key={item.id}><circle cx={position.x} cy={position.y} r="6" fill="#315cff" /><text x={position.x + 14} y={position.y + 4} fill="#253046" fontSize="12">{item.title.slice(0, 24)}</text></g>; })}</svg></div></section>}
      <section className="phase2-panel" aria-labelledby="graph-concepts-title"><div className="phase2-page-heading"><div><h2 id="graph-concepts-title">Connected concepts</h2><p>Each concept links to the saved items that share it.</p></div><label>Filter concepts<input type="search" maxLength={80} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Topic, tag, collection, or page" /></label></div>
        {groups.length ? <ul className="phase2-manage-list">{groups.map((group) => <li key={group.id}><div><strong>{group.label}</strong><span className="phase2-pill soft">{group.type}</span><p className="phase2-helper">{group.itemCount} linked {group.itemCount === 1 ? 'item' : 'items'}</p><ul className="phase2-manage-list">{group.items.map((item) => <li key={item.id}><SavedItemLink itemId={item.id}>{item.title}</SavedItemLink><span className={`status status-${item.status}`}>{readableStatus(item.status as Status)}</span></li>)}</ul>{group.itemCount > group.items.length && <p className="phase2-helper">Showing {group.items.length} of {group.itemCount} linked items.</p>}</div></li>)}</ul> : <div className="empty-state"><h2>{filter ? 'No concepts match that filter.' : 'Your graph is ready to grow.'}</h2><p>{filter ? 'Try a broader topic or clear the filter.' : 'Save pages, add tags or collections, or enable optional media analysis to connect your library.'}</p>{filter && <button className="quiet-button" type="button" onClick={() => setFilter('')}>Clear filter</button>}</div>}
      </section>
    </>}
  </>;
}

function LibraryCheckupPage() {
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
  const sections: Array<{ title: string; description: string; items: CheckupItem[] }> = checkup ? [
    { title: 'Needs a look', description: 'Paused, failed, partial, or retrying saves.', items: checkup.needsAttention },
    { title: 'Saved 3+ months ago', description: 'Older items you may want to revisit.', items: checkup.olderSaves },
    { title: 'A few from your library', description: 'A stable weekly selection to make rediscovery easier.', items: checkup.weeklyRediscovery },
  ] : [];
  return <><PageHeader title="Review your library" description="Find broken links and pages you may want to revisit." actions={<button className="quiet-button" type="button" disabled={loading} onClick={() => void load()}>{loading ? 'Refreshing…' : 'Refresh checkup'}</button>} />
    {error && <div className="notice error phase2-retry-notice" role="alert"><span>{error}</span><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></div>}
    {loading && !checkup ? <div className="phase2-state" role="status">Reviewing your library…</div> : checkup && <>
      <section className="phase2-panel" aria-label="Library checkup summary"><div className="phase2-filter-grid"><div><p className="eyebrow">Saved items</p><strong>{checkup.summary.savedItems}</strong></div><div><p className="eyebrow">Needs a look</p><strong>{checkup.summary.needsAttention}</strong></div><div><p className="eyebrow">Not organized</p><strong>{checkup.summary.unorganizedItems}</strong></div><div><p className="eyebrow">Older than 90 days</p><strong>{checkup.summary.olderSaves}</strong></div></div><p className="phase2-helper">Checkup never changes or deletes saved items automatically. Link probes run only when you request them; reminders are also your choice. These features work with AI providers disabled.</p></section>
      <section className="phase2-panel" aria-labelledby="link-health-title"><div className="phase2-page-heading"><div><h2 id="link-health-title">Saved link health</h2><p>Check public links when you ask. Recent checks are kept for seven days to avoid repeat visits.</p></div><button className="quiet-button" type="button" disabled={checkingLinks} onClick={() => void checkLinks()}>{checkingLinks ? 'Checking up to 10…' : 'Check up to 10 links'}</button></div><div className="phase2-filter-grid"><div><p className="eyebrow">Checked</p><strong>{checkup.linkHealth.checkedItems}</strong></div><div><p className="eyebrow">Not found</p><strong>{checkup.linkHealth.brokenCount}</strong></div><div><p className="eyebrow">Could not confirm</p><strong>{checkup.linkHealth.unknownCount}</strong></div></div>{checkup.linkHealth.lastCheckedAt && <p className="phase2-helper">Last checked {date(checkup.linkHealth.lastCheckedAt)}. “Could not confirm” may mean the site blocked or timed out during the check.</p>}{checkup.linkHealth.brokenLinks.length > 0 ? <ul className="phase2-manage-list">{checkup.linkHealth.brokenLinks.map((item) => <li key={item.id}><div><SavedItemLink itemId={item.itemId}>{item.title}</SavedItemLink><p className="phase2-helper">HTTP {item.httpStatus ?? 'unknown'} · checked {date(item.checkedAt)}</p></div><span className="phase2-pill soft">Not found</span></li>)}</ul> : <p className="phase2-state">No confirmed broken links. Run a check to review saved pages.</p>}</section>
      {(checkup.dueReminders.length > 0 || checkup.upcomingReminders.length > 0) && <section className="phase2-panel"><h2>Reminders</h2>{checkup.dueReminders.length > 0 && <><h3>Due now</h3><ReminderItems items={checkup.dueReminders} busyId={reminderBusyId} onUpdate={updateReminder} /></>}{checkup.upcomingReminders.length > 0 && <><h3>Coming up</h3><ReminderItems items={checkup.upcomingReminders} busyId={reminderBusyId} onUpdate={updateReminder} /></>}</section>}
      {checkup.dailyPick && <section className="phase2-panel"><h2>Picked for today</h2><p className="phase2-helper">A consistent daily pick from your recent library.</p><CheckupItems items={[checkup.dailyPick]} busyId={reminderBusyId} onRemind={scheduleReminder} /></section>}
      {sections.map((section) => <section className="phase2-panel" key={section.title}><h2>{section.title}</h2><p className="phase2-helper">{section.description}</p>{section.items.length ? <CheckupItems items={section.items} busyId={reminderBusyId} onRemind={scheduleReminder} /> : <p className="phase2-state">Nothing to show here right now.</p>}</section>)}
    </>}
  </>;
}

function CheckupItems({ items, busyId, onRemind }: { items: CheckupItem[]; busyId: string; onRemind: (itemId: string, preset: 'tomorrow' | 'week' | 'month', note: string) => void }) {
  return <ul className="phase2-manage-list">{items.map((item) => <li key={item.id}><div className="checkup-item-main"><SavedItemLink itemId={item.id}>{item.title}</SavedItemLink><span className={`status status-${item.status}`}>{readableStatus(item.status as Status)}</span><time dateTime={item.created_at}>{date(item.created_at)}</time></div><form className="checkup-reminder-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const value = data.get('preset'); const note = data.get('note'); if ((value === 'tomorrow' || value === 'week' || value === 'month') && typeof note === 'string') onRemind(item.id, value, note); }}><label className="sr-only" htmlFor={`reminder-preset-${item.id}`}>Reminder time for {item.title}</label><select id={`reminder-preset-${item.id}`} name="preset" defaultValue="week"><option value="tomorrow">Tomorrow</option><option value="week">In a week</option><option value="month">In a month</option></select><label className="sr-only" htmlFor={`reminder-note-${item.id}`}>Optional reminder note for {item.title}</label><input id={`reminder-note-${item.id}`} name="note" type="text" maxLength={300} placeholder="Optional note" /><button className="quiet-button" type="submit" disabled={busyId === item.id}>{busyId === item.id ? 'Setting…' : 'Set reminder'}</button></form></li>)}</ul>;
}

function ReminderItems({ items, busyId, onUpdate }: { items: CheckupReminder[]; busyId: string; onUpdate: (reminderId: string, status: 'done' | 'dismissed') => void }) {
  return <ul className="phase2-manage-list">{items.map((reminder) => <li key={reminder.id}><div className="checkup-item-main"><SavedItemLink itemId={reminder.item.id}>{reminder.item.title}</SavedItemLink><time dateTime={reminder.remindAt}>{date(reminder.remindAt)}</time>{reminder.note && <span>{reminder.note}</span>}</div><div className="phase2-card-actions"><button className="quiet-button" type="button" disabled={busyId === reminder.id} onClick={() => onUpdate(reminder.id, 'done')}>Done</button><button className="quiet-button" type="button" disabled={busyId === reminder.id} onClick={() => onUpdate(reminder.id, 'dismissed')}>Dismiss</button></div></li>)}</ul>;
}

function AddPage() {
  const [url, setUrl] = useState(''); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState(''); const [activeImportId, setActiveImportId] = useState(''); const navigate = useNavigate();
  const uploadController = useRef<AbortController | null>(null); const idempotencyKey = useRef<string | null>(null);
  async function submitUrl(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { const body = await api<{ item: SavedItem; duplicate: boolean }>('/api/items', { method: 'POST', body: JSON.stringify({ url }) }); navigate(`/app/items/${encodeURIComponent(body.item.id)}`); } catch (cause) { setError(messageOf(cause, 'Could not save that page.')); } finally { setBusy(false); } }
  async function submitFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
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
  return <><PageHeader title="Save or import" description="Save a public page or import bookmarks from a supported service." />
    <section className="phase2-panel phase2-narrow"><h2>Save one public page</h2><form className="phase2-form" onSubmit={(event) => void submitUrl(event)}><label htmlFor="save-url">Public page URL</label><input id="save-url" type="url" autoComplete="url" placeholder="https://example.com/article" required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} /><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save page'}</button></form></section>
    <section className="phase2-panel phase2-narrow"><h2>Import a platform export</h2><p className="phase2-helper">Choose HTML, HTM, JS, JSON, CSV, TXT, or ZIP exports. New recognized links are queued automatically after parsing. Up to 20 files, 25 MiB per file, and 100 MiB total. Instagram imports include at most the 300 newest saved posts and reels; other platforms keep their existing limits.</p><form className="phase2-form" onSubmit={(event) => void submitFiles(event)}><label htmlFor="export-files">Export files</label><input id="export-files" type="file" accept=".html,.htm,.js,.json,.csv,.txt,.zip" multiple disabled={busy} onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); idempotencyKey.current = null; setError(''); }} /><p className="phase2-helper">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected · ${(files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)} MiB` : 'Raw files are deleted after parsing and durable queueing.'}</p>{error && <p className="notice error" role="alert">{error}</p>}{busy && <p className="phase2-state" role="status">Uploading export files… {progress}%</p>}{busy && activeImportId && <button className="quiet-button" type="button" onClick={() => uploadController.current?.abort()}>Cancel upload</button>}<button className="primary-button" disabled={busy || files.length === 0}>{busy ? 'Uploading…' : 'Upload and import'}</button><Link className="phase2-text-button" to="/app/imports">View import history</Link></form></section>
    <div className="phase2-back"><Link to="/app">Back to library</Link></div></>;
}

interface ImportSummary { id: string; status: string; source: string; file_count: number; parsed_count: number; new_count: number; duplicate_count: number; skipped_count: number; failed_count: number; cleanup_status: string; error_code: string | null; created_at: string }
interface ImportEntry { id: string; item_id: string | null; source_platform: string; source_url: string | null; source_id: string | null; title: string; status: string; error_code: string | null; source_order: number | null }
const activeImportStatuses = new Set(['uploading', 'staged', 'parsing', 'queued', 'processing']);
interface ImportProgress { importId: string; status: string; total: number; settled: number; saved: number; paused: number; queued: number; processing: number; retryWaiting: number; failed: number; cancelled: number; parseFailed: number }
function ImportStatusLabel({ status }: { status: string }) { return <span className={`status status-${status}`}>{status.replaceAll('_', ' ')}</span>; }

function ImportsPage() {
  const [imports, setImports] = useState<ImportSummary[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); try { setImports((await api<{ imports: ImportSummary[] }>('/api/imports')).imports); setError(''); } catch (cause) { setError(messageOf(cause, 'Could not load imports.')); } finally { if (!quiet) setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!imports.some((entry) => activeImportStatuses.has(entry.status))) return undefined; const timer = window.setInterval(() => { void load(true); }, 2500); return () => window.clearInterval(timer); }, [imports, load]);
  return <><PageHeader title="Import history" description="See what was added, skipped, or needs attention." actions={<Link className="primary-button" to="/app/add">Import files</Link>} />
    {error && <p className="notice error" role="alert">{error}</p>}{loading ? <div className="phase2-state" role="status">Loading imports…</div> : imports.length ? <ul className="item-list">{imports.map((entry) => <li className="item-card" key={entry.id}><div className="item-main"><div className="item-info"><p className="item-domain">{entry.source} · {date(entry.created_at)}</p><Link className="item-title" to={`/app/imports/${encodeURIComponent(entry.id)}`}>{entry.file_count} file{entry.file_count === 1 ? '' : 's'} · {entry.new_count} new · {entry.duplicate_count} duplicate</Link><p className="item-description">{entry.parsed_count} parsed · {entry.failed_count} failed · raw cleanup {entry.cleanup_status}</p></div><div className="item-actions"><ImportStatusLabel status={entry.status} /></div></div></li>)}</ul> : <div className="empty-state"><span>✳</span><h2>No imports yet.</h2><p>Import a platform archive to bring saved links into your library.</p><Link className="primary-button" to="/app/add">Import files</Link></div>}
  </>;
}

function ImportDetailPage() {
  const { importId = '' } = useParams();
  const [result, setResult] = useState<{ import: ImportSummary & { total_bytes: number; request_id: string }; entries: ImportEntry[] } | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [progressStale, setProgressStale] = useState(false);
  const [progressAnnouncement, setProgressAnnouncement] = useState('');
  const [busyImportAction, setBusyImportAction] = useState(false);
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
    <section className="phase2-panel"><h2>Imported links</h2>{result.entries.length ? <ul className="item-list">{result.entries.map((entry) => <li className="item-card" key={entry.id}><div className="item-main"><div className="item-info"><p className="item-domain">{entry.source_platform}{entry.source_id ? ` · ${entry.source_id}` : ''}</p>{entry.item_id ? <SavedItemLink className="item-title" itemId={entry.item_id}>{entry.title || entry.source_url}</SavedItemLink> : <span className="item-title">{entry.title || entry.source_url || 'Unrecognized export row'}</span>}{entry.source_url && <p className="item-description">{entry.source_url}</p>}{entry.error_code && <p className="item-description">{entry.error_code.replaceAll('_', ' ')}</p>}</div><div className="item-actions"><ImportStatusLabel status={entry.status} /></div></div></li>)}</ul> : <div className="phase2-state">{activeImportStatuses.has(result.import.status) ? 'Parsing is underway. Results will appear here automatically.' : 'No imported links were created for this file.'}</div>}</section>
  </>;
}

function ItemDetailPage() {
  const location = useLocation();
  const { itemId = '' } = useParams(); const [item, setItem] = useState<SavedItem | null>(null); const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisView | null>(null); const [summary, setSummary] = useState<SavedItemSummary | null>(null); const [allTags, setAllTags] = useState<Tag[]>([]); const [loading, setLoading] = useState(true); const [busyJobAction, setBusyJobAction] = useState(false); const [summaryBusy, setSummaryBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); setError(''); try { const [itemResult, aiResult, summaryResult] = await Promise.all([api<{ item: SavedItem }>(`/api/items/${encodeURIComponent(itemId)}`), api<AiAnalysisView>(`/api/ai/items/${encodeURIComponent(itemId)}`).catch(() => null), api<{ summary: SavedItemSummary | null; stale: boolean }>(`/api/knowledge/items/${encodeURIComponent(itemId)}/summary`).catch(() => ({ summary: null, stale: false }))]); setItem(itemResult.item); setAiAnalysis(aiResult); setSummary(summaryResult.summary ? { ...summaryResult.summary, stale: summaryResult.stale } : null); } catch (cause) { setError(messageOf(cause, 'Could not load this item.')); } finally { if (!quiet) setLoading(false); } }, [itemId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!item || !['queued', 'processing', 'retry_wait', 'cancel_requested', 'paused'].includes(item.status)) return undefined; const timer = window.setInterval(() => { void load(true); }, 2500); return () => window.clearInterval(timer); }, [item, load]);
  useEffect(() => { if (!aiAnalysis || !['queued', 'processing'].includes(aiAnalysis.status)) return undefined; const timer = window.setInterval(() => { void load(true); }, 4000); return () => window.clearInterval(timer); }, [aiAnalysis, load]);
  useEffect(() => { let alive = true; void api<{ tags: Tag[] }>('/api/tags').then((result) => { if (alive) setAllTags(result.tags); }).catch(() => undefined); return () => { alive = false; }; }, []);
  async function updateTag(tag: Tag, add: boolean) { if (!item) return; setError(''); try { await api(`/api/items/${encodeURIComponent(item.id)}/tags/${encodeURIComponent(tag.id)}`, { method: add ? 'PUT' : 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not update item tags.')); } }
  async function jobAction(action: 'cancel' | 'retry' | 'reprocess') { if (!item) return; setBusyJobAction(true); setError(''); try { await api(`/api/items/${encodeURIComponent(item.id)}/job/${action}`, { method: 'POST' }); await load(); } catch (cause) { setError(messageOf(cause, `Could not ${action} this job.`)); } finally { setBusyJobAction(false); } }
  async function generateSummary() { if (!item) return; setSummaryBusy(true); setError(''); try { const result = await api<{ summary: SavedItemSummary }>(`/api/knowledge/items/${encodeURIComponent(item.id)}/summary`, { method: 'POST', body: JSON.stringify({}) }); setSummary({ ...result.summary, stale: false }); } catch (cause) { setError(messageOf(cause, 'Could not generate a summary.')); } finally { setSummaryBusy(false); } }
  if (loading) return <div className="phase2-state" role="status">Loading saved item…</div>;
  if (error || !item) return <ErrorState message={error || 'This item was not found.'} />;
  const isNote = item.kind === 'note';
  const canCancel = ['queued', 'processing', 'retry_wait', 'cancel_requested'].includes(item.status);
  const canRetry = item.status === 'failed';
  const canReprocess = item.status === 'ready' || item.status === 'partial';
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const libraryHref = sameAppPath(returnTo);
  return <><div className="phase2-back"><Link to={libraryHref}>← {libraryHref === '/app' ? 'Back to library' : 'Back to previous view'}</Link></div><PageHeader title={item.title} description={item.description || (isNote ? 'A note in your private library.' : 'Saved page and processing status.')} actions={<><Link className="quiet-button" to={`/app/items/${encodeURIComponent(item.id)}/edit`} state={{ returnTo: libraryHref }}>Edit details</Link>{isNote && <Link className="primary-button" to={`/app/notes/${encodeURIComponent(item.id)}/edit`} state={{ returnTo: libraryHref }}>Edit note</Link>}</>} />
    {error && <p className="notice error" role="alert">{error}</p>}<section className="phase2-panel" aria-labelledby="library-summary-title"><div className="phase2-card-actions"><div><h2 id="library-summary-title">Library summary</h2><p className="phase2-helper">Generate a concise summary from this saved page or note. The source is sent to Meta only when you request it and have enabled library AI in Settings.</p></div><button className="quiet-button" type="button" disabled={summaryBusy} onClick={() => void generateSummary()}>{summaryBusy ? 'Generating…' : summary ? 'Regenerate summary' : 'Generate summary'}</button></div>{summary && <>{summary.stale && <p className="notice" role="status">The saved page or note changed after this summary was created. Regenerate it to use the current source.</p>}<p>{summary.summary}</p><p className="phase2-helper">Source: <Link to={`/app/items/${encodeURIComponent(item.id)}`}>{item.title}</Link> · {summary.sourceCharacters.toLocaleString()} characters · Generated by {summary.model} on {date(summary.createdAt)}.</p></>}</section><div className="phase2-detail-grid"><article className="phase2-panel"><h2>{isNote ? 'Note' : 'Saved copy'}</h2>{isNote ? <><p className="phase2-preserve-text">{item.note?.body || 'This note is empty.'}</p>{item.note?.links?.length ? <section><h3>Links</h3><ul className="phase2-link-list">{item.note.links.map((link) => <li key={link}><a href={link} target="_blank" rel="noreferrer">{link}</a></li>)}</ul></section> : null}{item.note?.assets?.length ? <section className="phase2-assets"><h3>Images</h3>{item.note.assets.map((asset) => <img key={asset.id} src={asset.url} alt="Note attachment" loading="lazy" />)}</section> : null}</> : <><p className="phase2-status-line"><span className={`status status-${item.status}`}>● {readableStatus(item.status)}</span></p>{(canCancel || canRetry || canReprocess) && <div className="phase2-heading-actions" aria-label="Processing recovery actions">{canCancel && <button className="quiet-button" type="button" disabled={busyJobAction || item.status === 'cancel_requested'} onClick={() => void jobAction('cancel')}>{item.status === 'cancel_requested' ? 'Canceling…' : 'Cancel processing'}</button>}{canRetry && <button className="quiet-button" type="button" disabled={busyJobAction} onClick={() => void jobAction('retry')}>Retry</button>}{canReprocess && <button className="quiet-button" type="button" disabled={busyJobAction} onClick={() => void jobAction('reprocess')}>Reprocess</button>}</div>}<p className="phase2-preserve-text">{item.text || item.textPreview || (item.status === 'failed' ? 'Rembr could not make a readable copy. The source link is still available.' : 'The readable copy will appear when processing finishes.')}</p>{aiAnalysis && aiAnalysis.status !== 'not_requested' && <section className="phase2-ai-result" aria-labelledby="ai-result-title"><h2 id="ai-result-title">AI media notes</h2><p className="phase2-helper" role="status">{aiAnalysis.status === 'processing' || aiAnalysis.status === 'queued' ? 'Analysis is running…' : aiAnalysis.status === 'paused' ? `Analysis paused: ${(aiAnalysis.pauseReason ?? 'budget').replaceAll('_', ' ')}.` : aiAnalysis.status === 'failed' ? 'Analysis could not be completed. Your saved page is available.' : aiAnalysis.result?.status === 'partial' ? 'Partial analysis. Some public media was unavailable or skipped.' : aiAnalysis.status === 'completed' ? 'Analysis complete.' : ''}</p>{aiAnalysis.result && <><h3>{aiAnalysis.result.summary || 'Visual notes'}</h3>{aiAnalysis.result.visualDescription && <p>{aiAnalysis.result.visualDescription}</p>}{aiAnalysis.result.ocrText && <div><h4>Text in media</h4><p className="phase2-preserve-text">{aiAnalysis.result.ocrText}</p></div>}{aiAnalysis.result.transcript && <div><h4>Speech transcript</h4><p className="phase2-preserve-text">{aiAnalysis.result.transcript}</p></div>}{aiAnalysis.result.keywords.length > 0 && <p><strong>Keywords</strong>: {aiAnalysis.result.keywords.join(', ')}</p>}{aiAnalysis.result.tags.length > 0 && <p><strong>AI topics</strong>: {aiAnalysis.result.tags.join(', ')}</p>}<p className="phase2-helper">Generated by {aiAnalysis.result.model}. {aiAnalysis.result.imageCount} images · {aiAnalysis.result.videoCount} videos analyzed.</p></>}</section>}{item.media?.some((media) => media.status === 'ready' && media.url) && <section className="phase2-assets"><h3>Saved media</h3>{item.media.filter((media) => media.status === 'ready' && media.url).map((media) => media.mime?.startsWith("video/") ? <video key={media.id} src={media.url!} controls preload="metadata" aria-label="Video saved from this page" /> : media.mime?.startsWith("audio/") ? <audio key={media.id} src={media.url!} controls preload="metadata" aria-label="Audio saved from this page" /> : <img key={media.id} src={media.url!} alt="Image saved from this page" loading="lazy" />)}</section>}{item.media?.some((media) => media.status === 'failed') && <p className="phase2-helper" role="status">Some page media could not be saved. The readable page is still available.</p>}<a className="source-link" href={item.url} target="_blank" rel="noreferrer">Open original page ↗</a></>}</article><aside className="phase2-panel"><h2>Organize</h2><h3>Tags</h3><div className="phase2-tag-choices">{allTags.length ? allTags.map((tag) => { const attached = item.tags?.some((current) => current.id === tag.id); return <label className="phase2-check" key={tag.id}><input type="checkbox" checked={Boolean(attached)} onChange={(event) => void updateTag(tag, event.target.checked)} /><span>{tag.name}</span></label>; }) : <p className="phase2-helper">No tags yet. <Link to="/app/tags">Create one</Link></p>}</div><p><Link to="/app/tags">Manage tags</Link></p><h3>Collections</h3><ul className="phase2-link-list">{item.collections?.map((collection) => <li key={collection.id}><Link to={`/app/collections/${encodeURIComponent(collection.id)}`}>{collection.name}</Link></li>)}</ul><Link to="/app/collections">Manage collections</Link><hr /><p className="phase2-helper">Saved {date(item.createdAt)}{item.fetchedAt ? ` · Processed ${date(item.fetchedAt)}` : ''}</p></aside></div>
  </>;
}

function ItemEditPage() {
  const { itemId = '' } = useParams(); const navigate = useNavigate(); const location = useLocation(); const returnTo = sameAppPath((location.state as { returnTo?: string } | null)?.returnTo); const [item, setItem] = useState<SavedItem | null>(null); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let alive = true; void api<{ item: SavedItem }>(`/api/items/${encodeURIComponent(itemId)}`).then(({ item: result }) => { if (alive) { setItem(result); setTitle(result.titleOverride ?? result.title); setDescription(result.descriptionOverride ?? result.description); } }).catch((cause) => { if (alive) setError(messageOf(cause, 'Could not load this item.')); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [itemId]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { await api(`/api/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify({ titleOverride: title, descriptionOverride: description }) }); navigate(`/app/items/${encodeURIComponent(itemId)}`, { replace: true, state: { returnTo } }); } catch (cause) { setError(messageOf(cause, 'Could not update item details.')); } finally { setBusy(false); } }
  if (loading) return <div className="phase2-state" role="status">Loading item…</div>;
  if (!item) return <ErrorState message={error || 'This item was not found.'} />;
  return <><div className="phase2-back"><Link to={`/app/items/${encodeURIComponent(itemId)}`} state={{ returnTo }}>← Cancel and return</Link></div><PageHeader title="Edit page details" description="These changes affect the title and description in your library, not the saved page." /><section className="phase2-panel phase2-narrow"><form className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="item-title">Title</label><input id="item-title" maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} /><label htmlFor="item-description">Description</label><textarea id="item-description" rows={5} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form></section></>;
}

function NoteEditorPage() {
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

function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]); const [name, setName] = useState(''); const [editingId, setEditingId] = useState<string | null>(null); const [editName, setEditName] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setTags((await api<{ tags: Tag[] }>('/api/tags')).tags); setError(''); } catch (cause) { setError(messageOf(cause, 'Could not load tags.')); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { await api('/api/tags', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); await load(); } catch (cause) { setError(messageOf(cause, 'Could not create tag.')); } finally { setBusy(false); } }
  async function update(tag: Tag) { setBusy(true); setError(''); try { await api(`/api/tags/${encodeURIComponent(tag.id)}`, { method: 'PATCH', body: JSON.stringify({ name: editName }) }); setEditingId(null); await load(); } catch (cause) { setError(messageOf(cause, 'Could not update tag.')); } finally { setBusy(false); } }
  async function remove(tag: Tag) { if (!window.confirm(`Delete the tag “${tag.name}”? Saved items will remain.`)) return; try { await api(`/api/tags/${encodeURIComponent(tag.id)}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not delete tag.')); } }
  return <><PageHeader title="Tags" description="Group saved pages across collections." /><section className="phase2-panel phase2-narrow"><form className="phase2-inline-form" onSubmit={(event) => void add(event)}><label className="visually-hidden" htmlFor="new-tag">New tag name</label><input id="new-tag" maxLength={40} required placeholder="Name a tag" value={name} onChange={(event) => setName(event.target.value)} /><button className="primary-button" disabled={busy}>{busy ? 'Adding…' : 'Add tag'}</button></form>{error && <p className="notice error" role="alert">{error}</p>}{loading ? <div className="phase2-state" role="status">Loading tags…</div> : tags.length ? <ul className="phase2-manage-list">{tags.map((tag) => <li key={tag.id}>{editingId === tag.id ? <form className="phase2-inline-edit" onSubmit={(event) => { event.preventDefault(); void update(tag); }}><label className="visually-hidden" htmlFor={`edit-tag-${tag.id}`}>Edit tag name</label><input id={`edit-tag-${tag.id}`} maxLength={40} required value={editName} onChange={(event) => setEditName(event.target.value)} /><button className="quiet-button" disabled={busy}>Save</button><button className="phase2-text-button" type="button" onClick={() => setEditingId(null)}>Cancel</button></form> : <span className="phase2-pill">{tag.name}</span>}<div className="phase2-card-actions"><button className="quiet-button" type="button" onClick={() => { setEditingId(tag.id); setEditName(tag.name); }}>Edit</button><button className="quiet-button danger-button" onClick={() => void remove(tag)} type="button">Delete</button></div></li>)}</ul> : <div className="empty-state"><h2>No tags yet</h2><p>Create a tag, then add it to saved items from their detail page.</p></div>}</section></>;
}

function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [editingId, setEditingId] = useState<string | null>(null); const [editName, setEditName] = useState(''); const [editDescription, setEditDescription] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); try { setCollections((await api<{ collections: Collection[] }>('/api/collections')).collections); setError(''); } catch (cause) { setError(messageOf(cause, 'Could not load collections.')); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { await api('/api/collections', { method: 'POST', body: JSON.stringify({ name, description }) }); setName(''); setDescription(''); await load(); } catch (cause) { setError(messageOf(cause, 'Could not create collection.')); } finally { setBusy(false); } }
  async function update(collection: Collection) { setBusy(true); setError(''); try { await api(`/api/collections/${encodeURIComponent(collection.id)}`, { method: 'PATCH', body: JSON.stringify({ name: editName, description: editDescription }) }); setEditingId(null); await load(); } catch (cause) { setError(messageOf(cause, 'Could not update collection.')); } finally { setBusy(false); } }
  async function remove(collection: Collection) { if (!window.confirm(`Delete “${collection.name}”? Saved items will remain in your library.`)) return; try { await api(`/api/collections/${encodeURIComponent(collection.id)}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not delete collection.')); } }
  return <><PageHeader title="Collections" description="Make groups for projects, topics, and reading lists." /><section className="phase2-panel phase2-panel-with-grid"><form className="phase2-form phase2-create-collection" onSubmit={(event) => void create(event)}><label htmlFor="collection-name">Collection name</label><input id="collection-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Research for later" /><label htmlFor="collection-description">Description <span>(optional)</span></label><input id="collection-description" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What belongs here?" /><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create collection'}</button></form>{error && <p className="notice error" role="alert">{error}</p>}{loading ? <div className="phase2-state" role="status">Loading collections…</div> : collections.length ? <ul className="phase2-collection-grid">{collections.map((collection) => <li className="phase2-panel" key={collection.id}>{editingId === collection.id ? <form className="phase2-form" onSubmit={(event) => { event.preventDefault(); void update(collection); }}><label htmlFor={`collection-edit-name-${collection.id}`}>Name</label><input id={`collection-edit-name-${collection.id}`} required maxLength={80} value={editName} onChange={(event) => setEditName(event.target.value)} /><label htmlFor={`collection-edit-description-${collection.id}`}>Description</label><input id={`collection-edit-description-${collection.id}`} maxLength={500} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /><div className="phase2-card-actions"><button className="quiet-button" disabled={busy}>Save</button><button className="phase2-text-button" type="button" onClick={() => setEditingId(null)}>Cancel</button></div></form> : <><p className="eyebrow">Manual collection</p><h2><Link to={`/app/collections/${encodeURIComponent(collection.id)}`}>{collection.name}</Link></h2><p>{collection.description || 'No description yet.'}</p><div className="phase2-card-actions"><Link className="quiet-button" to={`/app/collections/${encodeURIComponent(collection.id)}`}>Open</Link><button className="quiet-button" type="button" onClick={() => { setEditingId(collection.id); setEditName(collection.name); setEditDescription(collection.description ?? ''); }}>Edit</button><button className="quiet-button danger-button" type="button" onClick={() => void remove(collection)}>Delete</button></div></>}</li>)}</ul> : <div className="empty-state"><h2>No collections yet</h2><p>Make a collection, then add saved pages and notes from its page.</p></div>}</section></>;
}

function CollectionDetailPage() {
  const { collectionId = '' } = useParams(); const [searchParams, setSearchParams] = useSearchParams(); const [collection, setCollection] = useState<Collection | null>(null); const [items, setItems] = useState<SavedItem[]>([]); const [library, setLibrary] = useState<SavedItem[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  const cursor = searchParams.get('cursor') ?? '';
  const load = useCallback(async () => { setLoading(true); try { const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''; const result = await api<{ collection: Collection; items: SavedItem[]; nextCursor: string | null; hasMore: boolean }>(`/api/collections/${encodeURIComponent(collectionId)}${query}`); setCollection(result.collection); setItems(result.items); setNextCursor(result.nextCursor); setHasMore(result.hasMore); const all = await api<{ items: SavedItem[] }>('/api/items?limit=100'); setLibrary(all.items); setError(''); } catch (cause) { setError(messageOf(cause, 'Could not load this collection.')); } finally { setLoading(false); } }, [collectionId, cursor]);
  useEffect(() => { void load(); }, [load]);
  const inCollection = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const available = useMemo(() => library.filter((item) => !inCollection.has(item.id) && `${item.title} ${item.url}`.toLowerCase().includes(search.toLowerCase())), [inCollection, library, search]);
  async function membership(item: SavedItem, add: boolean) { try { await api(`/api/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(item.id)}`, { method: add ? 'PUT' : 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not update collection.')); } }
  return <><div className="phase2-back"><Link to="/app/collections">← All collections</Link></div>{loading ? <div className="phase2-state" role="status">Loading collection…</div> : !collection ? <ErrorState message={error || 'Collection not found.'} /> : <><PageHeader title={collection.name} description={collection.description || 'A manually managed group of library items.'} /><div className="phase2-detail-grid"><section className="phase2-panel"><h2>Items in this collection</h2>{error && <p className="notice error" role="alert">{error}</p>}{items.length ? <ul className="phase2-manage-list">{items.map((item) => <li key={item.id}><SavedItemLink itemId={item.id}>{item.title}</SavedItemLink><button className="quiet-button danger-button" onClick={() => void membership(item, false)} type="button">Remove</button></li>)}</ul> : <div className="phase2-state">This collection is empty. Add a saved item from the list on the right.</div>}<div className="phase2-pagination"><button className="quiet-button" disabled={!cursor} onClick={() => { const next = new URLSearchParams(searchParams); next.delete('cursor'); setSearchParams(next); }} type="button">First page</button><button className="primary-button" disabled={!hasMore || !nextCursor} onClick={() => { if (nextCursor) { const next = new URLSearchParams(searchParams); next.set('cursor', nextCursor); setSearchParams(next); } }} type="button">Next page</button></div></section><section className="phase2-panel"><h2>Add from your library</h2><label className="visually-hidden" htmlFor="collection-search">Find saved items</label><input id="collection-search" type="search" placeholder="Find a page or note" value={search} onChange={(event) => setSearch(event.target.value)} /><ul className="phase2-manage-list">{available.slice(0, 30).map((item) => <li key={item.id}><span>{item.title}</span><button className="quiet-button" onClick={() => void membership(item, true)} type="button">Add</button></li>)}</ul></section></div></>}</>;
}

function SettingsPage() {
  const { session, setSession } = useShell(); const location = useLocation(); const [profile, setProfile] = useState<Profile | null>(session.profile); const [onboarding, setOnboarding] = useState<Onboarding | null>(null); const [aiPreference, setAiPreference] = useState<AiPreference | null>(null); const [aiSearchPreference, setAiSearchPreference] = useState<AiSearchPreference | null>(null); const [settingsLoaded, setSettingsLoaded] = useState(false); const [avatar, setAvatar] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [aiBusy, setAiBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const isPrefs = location.pathname.endsWith('/preferences');
  useEffect(() => { let alive = true; void Promise.all([api<{ profile: Profile | null }>('/api/profile'), api<{ onboarding: Onboarding | null }>('/api/onboarding'), api<{ preference: AiPreference }>('/api/ai/preferences'), api<{ preference: AiSearchPreference }>('/api/knowledge/ai-preferences')]).then(([p, o, a, s]) => { if (alive) { setProfile(p.profile); setOnboarding(o.onboarding); setAiPreference(a.preference); setAiSearchPreference(s.preference); } }).catch((cause) => { if (alive) setError(messageOf(cause, 'Could not load settings.')); }).finally(() => { if (alive) setSettingsLoaded(true); }); return () => { alive = false; }; }, []);
  async function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); const form = new FormData(event.currentTarget); const username = String(form.get('username') ?? ''); const avatarUrl = String(form.get('avatarUrl') ?? ''); try { const body = avatar ? new FormData() : JSON.stringify({ username, avatarUrl }); if (avatar && body instanceof FormData) { body.set('username', username); body.set('avatar', avatar); } const result = await api<{ profile: Profile }>('/api/profile', { method: 'PATCH', body }); setAvatar(null); setProfile(result.profile); setSession({ ...session, profile: result.profile, profileComplete: true }); setMessage('Profile saved.'); } catch (cause) { setError(messageOf(cause, 'Could not save profile.')); } finally { setBusy(false); } }
  async function savePrefs(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); const form = new FormData(event.currentTarget); const contentTypes = form.getAll('contentTypes').map(String); const referralSource = String(form.get('referralSource') ?? ''); try { const result = await api<{ onboarding: Onboarding }>('/api/onboarding', { method: 'PUT', body: JSON.stringify({ contentTypes, referralSource, skipped: false }) }); setOnboarding(result.onboarding); setMessage('Preferences saved.'); } catch (cause) { setError(messageOf(cause, 'Could not save preferences.')); } finally { setBusy(false); } }
  async function saveAiPreference(enabled: boolean) { setAiBusy(true); setError(''); setMessage(''); try { const result = await api<{ preference: AiPreference }>('/api/ai/preferences', { method: 'PUT', body: JSON.stringify({ enabled, disclosureVersion: enabled ? AI_DISCLOSURE_VERSION : undefined }) }); setAiPreference(result.preference); setMessage(enabled ? 'AI media analysis enabled for future Instagram imports.' : 'AI media analysis turned off.'); } catch (cause) { setError(messageOf(cause, 'Could not update AI analysis preference.')); } finally { setAiBusy(false); } }
  async function saveAiSearchPreference(enabled: boolean) { setAiBusy(true); setError(''); setMessage(''); try { const result = await api<{ preference: AiSearchPreference }>('/api/knowledge/ai-preferences', { method: 'PUT', body: JSON.stringify({ enabled, disclosureVersion: enabled ? AI_SEARCH_DISCLOSURE_VERSION : undefined }) }); setAiSearchPreference(result.preference); setMessage(enabled ? 'Grounded library answers enabled.' : 'Grounded library answers turned off.'); } catch (cause) { setError(messageOf(cause, 'Could not update grounded-answer preference.')); } finally { setAiBusy(false); } }
  return <><PageHeader title="Settings" description="Update your profile and saving preferences." actions={<div className="phase2-tab-links"><Link className={!isPrefs ? 'active' : ''} to="/app/settings/profile">Profile</Link><Link className={isPrefs ? 'active' : ''} to="/app/settings/preferences">Preferences</Link></div>} />{error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}{!settingsLoaded ? <div className="phase2-state" role="status">Loading settings…</div> : isPrefs ? <><section className="phase2-panel phase2-narrow"><h2>Onboarding preferences</h2><p className="phase2-helper">These are the content types you said you want to save and how you found Rembr.</p><form className="phase2-form" onSubmit={(event) => void savePrefs(event)}><fieldset className="phase2-options"><legend>Content you want to keep</legend><div className="phase2-option-grid">{contentOptions.map(([value, label]) => <label className="phase2-check" key={value}><input name="contentTypes" type="checkbox" value={value} defaultChecked={onboarding?.contentTypes.includes(value)} /><span>{label}</span></label>)}</div></fieldset><label htmlFor="settings-referral">How did you hear about Rembr?</label><select id="settings-referral" name="referralSource" defaultValue={onboarding?.referralSource ?? ''}><option value="">Choose one</option>{referralOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save preferences'}</button></form></section><section className="phase2-panel phase2-narrow ai-preference-panel" aria-labelledby="ai-media-title"><h2 id="ai-media-title">Instagram media analysis</h2><p className="phase2-helper">When enabled, Rembr sends publicly accessible Instagram post and reel media plus associated post text (caption, title, and readable page text) from new imports to Meta AI to create summaries, image and video descriptions, text recognition, speech transcripts when audio extraction is available, and search keywords. Private or unavailable media is skipped. Rembr keeps the generated notes; it does not store new raw Instagram media files.</p><div className="ai-provider-status" role="status">{aiPreference?.providerAvailable ? 'Meta analysis is available.' : 'Meta analysis is not configured yet. Your preference can be saved now; analysis will start only after the service is configured.'}</div><label className="phase2-check ai-preference-toggle"><input type="checkbox" role="switch" aria-label="Allow Meta AI to analyze public Instagram media and post text in future imports" checked={Boolean(aiPreference?.enabled)} disabled={aiBusy || !aiPreference} onChange={(event) => void saveAiPreference(event.currentTarget.checked)} /><span>Allow Meta to analyze public media and post text in future Instagram imports</span></label><p className="field-note">Off by default. Turning this off stops new analysis jobs. Media and associated text sent for analysis may be processed under Meta’s terms. No analysis runs until you turn this on.</p>{aiPreference?.enabled && <p className="field-note" role="status">Enabled{aiPreference.consentedAt ? ` since ${new Date(aiPreference.consentedAt).toLocaleDateString()}` : ''}. You can turn it off at any time.</p>}</section><section className="phase2-panel phase2-narrow ai-preference-panel" aria-labelledby="ai-search-title"><h2 id="ai-search-title">Grounded library AI</h2><p className="phase2-helper">When enabled, questions send up to eight matching saved titles and excerpts from saved text or existing media analysis (summaries, visual descriptions, OCR text, transcripts, and topics), plus up to six recent conversation messages to Meta AI. When you request a saved-item summary, Rembr sends up to 6,000 characters of that page's extracted text or note body, with its title and description. The selected text and conversation may be processed under Meta's terms.</p><div className="ai-provider-status" role="status">{aiSearchPreference?.providerAvailable ? "Meta library AI is available." : "Meta library AI is not available yet. You can save this preference now; requests will remain unavailable until the service is configured."}</div><label className="phase2-check ai-preference-toggle"><input type="checkbox" role="switch" aria-label="Allow Meta AI to use saved library text and existing media analysis for answers and summaries" checked={Boolean(aiSearchPreference?.enabled)} disabled={aiBusy || !aiSearchPreference} onChange={(event) => void saveAiSearchPreference(event.currentTarget.checked)} /><span>Allow Meta AI to use saved library text and media analysis for answers and summaries</span></label><p className="field-note">Off by default and separate from Instagram media analysis. Rembr sends no library text or stored media-analysis notes until this setting is enabled and you ask a question or request a summary. Turn it off at any time.</p></section></> : <section className="phase2-panel phase2-narrow"><h2>Profile</h2><p className="phase2-helper">Signed in as {session.user.email}</p><form className="phase2-form" onSubmit={(event) => void saveProfile(event)}><label htmlFor="settings-username">Username</label><input id="settings-username" name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" defaultValue={profile?.username ?? ''} /><label htmlFor="settings-avatar">Avatar URL</label><input id="settings-avatar" name="avatarUrl" type="url" placeholder="https://…" defaultValue={profile?.avatarUrl ?? ''} onChange={() => setAvatar(null)} /><label htmlFor="settings-avatar-file">Or upload an avatar</label><input id="settings-avatar-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 250 * 1024) { setError('Profile images must be 250 KB or smaller.'); setAvatar(null); } else { setError(''); setAvatar(file); } }} /><p className="field-note">PNG, JPEG, or WebP up to 250 KB.</p><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></form><p className="phase2-helper">Account security, data export, deletion, and billing controls are planned for Phase 6.</p></section>}</>;
}

function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="phase2-page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="phase2-heading-actions">{actions}</div>}</div>;
}
function ErrorState({ message }: { message: string }) { return <div className="phase2-state phase2-error-state" role="alert"><h2>We could not open this view.</h2><p>{message}</p><Link className="quiet-button" to="/app">Back to library</Link></div>; }

export function App() { return <AppRoutes />; }
