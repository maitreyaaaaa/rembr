import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext,
  useParams, useSearchParams,
} from 'react-router-dom';
import { MarketingSite } from './MarketingSite.js';
import { AvatarUpload } from './components/AvatarUpload.js';
import { PasswordStrengthField } from './components/PasswordStrengthField.js';

type Status = 'queued' | 'processing' | 'ready' | 'failed';
interface User { id: string; email: string }
interface Profile { userId: string; username: string; avatarUrl: string | null; avatarAssetId?: string | null; avatarAssetUrl?: string | null }
interface Tag { id: string; name: string }
interface Collection { id: string; name: string; description?: string }
interface Asset { id: string; url: string; mime: string; byteSize: number }
interface Note { body: string; links: string[]; assets: Asset[] }
interface SavedItem {
  id: string; url: string; title: string; description: string; titleOverride?: string | null;
  descriptionOverride?: string | null; kind: 'page' | 'note'; status: Status; errorCode: string | null;
  createdAt: string; updatedAt: string; textPreview: string; text?: string; fetchedAt?: string;
  tags: Tag[]; collections: Collection[]; note?: Note;
}
interface Onboarding { contentTypes: string[]; referralSource: string; completedAt: string | null; skippedAt: string | null }
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
  return error instanceof Error ? error.message : fallback;
}
function readableStatus(status: Status): string {
  return ({ queued: 'Waiting to process', processing: 'Saving page content', ready: 'Ready to read', failed: 'Could not process' })[status];
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
      <Route path="notes/new" element={<NoteEditorPage />} />
      <Route path="notes/:itemId/edit" element={<NoteEditorPage />} />
      <Route path="collections" element={<CollectionsPage />} />
      <Route path="collections/:collectionId" element={<CollectionDetailPage />} />
      <Route path="tags" element={<TagsPage />} />
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
      <div className="story-copy"><p className="eyebrow"><span className="eyebrow-mark" />Your reading, kept</p><h1 id="auth-title">The web moves.<br /><span>Your good reads stay.</span></h1><p className="auth-copy">Save a public page once. Come back to a clean, readable copy whenever you need it.</p></div>
      <div className="paper-scene" aria-hidden="true"><div className="paper-orbit paper-orbit-one" /><div className="paper-orbit paper-orbit-two" /><div className="paper-sheet paper-sheet-back"><span /><span /><span /></div><article className="paper-sheet paper-sheet-front"><div className="paper-meta"><span>FIELD NOTES</span><span>04 MIN READ</span></div><div className="paper-rule" /><strong>A little more room<br />to think.</strong><p>Good ideas are worth finding again.</p><div className="paper-lines"><i /><i /><i /></div><span className="paper-bookmark">↗</span></article><span className="paper-sticker">SAVED<br />FOR LATER</span></div>
      <div className="story-footer"><span className="story-check">✓</span> Private by design <span className="story-footer-dot">·</span> Made for the long read</div>
    </section>
    <section className="auth-card" aria-labelledby="auth-form-title"><div className="auth-card-heading"><p className="eyebrow">Your space on the web</p><h2 id="auth-form-title">{mode === 'login' ? 'Welcome back.' : 'Make it yours.'}</h2><p>Sign in or create a library of your own.</p></div>
      <div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setPassword(''); setPasswordRevealed(false); setError(''); }}>Sign in</button><button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setPassword(''); setPasswordRevealed(false); setError(''); }}>Create account</button></div>
      <form className="stack-form" onSubmit={(event) => void submit(event)}><label htmlFor="email">Email address</label><input id="email" autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />{mode === 'register' ? <PasswordStrengthField id="password" value={password} onValueChange={setPassword} disabled={busy} /> : <><label htmlFor="password">Password</label><div className="password-input-wrap"><input id="password" name="password" autoComplete="current-password" type={passwordRevealed ? 'text' : 'password'} required minLength={1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="password-reveal" aria-label={passwordRevealed ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={passwordRevealed} onClick={() => setPasswordRevealed((current) => !current)}>{passwordRevealed ? 'Hide' : 'Show'}</button></div></>}{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create your library' : 'Sign in to Rembr'}</button></form>
      <p className="privacy-note"><span>✳</span>Your library is private to your account. Only public pages can be captured in this build.</p>
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
  if (accountDenied) return <main className="phase2-centered"><section className="phase2-card"><p className="eyebrow">Account access</p><h1>Account unavailable</h1><p>This account is disabled. Private library data has been cleared from this page.</p><Link className="quiet-button" to="/login">Return to sign in</Link></section></main>;
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (!session.profileComplete && !location.pathname.startsWith('/app/setup/')) return <Navigate to="/app/setup/profile" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  return <div className="workspace phase2-workspace"><AppNav session={session} onLogout={async () => { await api('/api/auth/logout', { method: 'POST' }); setSession(null); navigate('/login', { replace: true }); }} /><div className="phase2-main"><Outlet context={{ session, setSession }} /></div></div>;
}

function AppNav({ session, onLogout }: { session: Session; onLogout: () => Promise<void> }) {
  const [logoutBusy, setLogoutBusy] = useState(false);
  return <header className="phase2-topbar"><Link className="wordmark" to="/app">rembr<span>.</span></Link><nav aria-label="Workspace navigation" className="phase2-nav"><NavLink to="/app" label="Library" /><NavLink to="/app/collections" label="Collections" /><NavLink to="/app/tags" label="Tags" /><NavLink to="/app/settings/profile" label="Settings" /></nav><div className="phase2-account"><span>{session.profile?.username ? `@${session.profile.username}` : session.user.email}</span><button type="button" className="quiet-button" disabled={logoutBusy} onClick={() => { setLogoutBusy(true); void onLogout().finally(() => setLogoutBusy(false)); }}>Sign out</button></div></header>;
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
        setAvatarProgress(0);
        setAvatarUploadError('');
        body = await apiWithProgress('/api/profile', form, controller.signal, setAvatarProgress);
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
  return <><p className="eyebrow">Account setup · 1 of 1</p><h1>Make this space yours.</h1><p className="phase2-lead">Choose a username for your private library. Your account email stays private.</p><form ref={formRef} className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="profile-username">Username</label><div className="phase2-prefix"><span>@</span><input id="profile-username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" autoComplete="username" value={username} disabled={busy} onChange={(event) => setUsername(event.target.value)} /></div><p className="field-note">3–24 letters, numbers, or underscores.</p><AvatarUpload name={username || 'Your profile'} src={avatarUrlChanged ? avatarUrl : profile?.avatarAssetUrl ?? profile?.avatarUrl} file={avatar} busy={busy && Boolean(avatar)} progress={avatarProgress} uploadError={avatarUploadError} onCancelUpload={() => uploadAbortRef.current?.abort()} onRetryUpload={() => formRef.current?.requestSubmit()} onDiscardUpload={() => { setAvatar(null); setAvatarCleared(false); setAvatarUploadError(''); }} onChange={(file, removed) => { setAvatar(file); setAvatarCleared(Boolean(removed)); setAvatarUploadError(''); if (file || removed) { setAvatarUrl(''); setAvatarUrlChanged(false); } setError(''); }} /><details className="avatar-url-option"><summary>Or use a public photo URL</summary><label htmlFor="profile-avatar-url">HTTPS photo URL <span>(optional)</span></label><input id="profile-avatar-url" type="url" inputMode="url" pattern="https://.*" placeholder="https://example.com/photo.jpg" value={avatarUrl} disabled={busy} onChange={(event) => { setAvatarUrl(event.target.value); setAvatarUrlChanged(true); setAvatar(null); setAvatarCleared(false); }} /><p className="field-note">Only use a photo URL you trust. It must start with https://.</p></details>{profile && <p className="phase2-helper">Current profile: @{profile.username}</p>}{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving profile…' : 'Save and continue'}</button></form></>;
}

interface ShellContext { session: Session; setSession: (session: Session | null) => void }
function useShell() { return useOutletContext<ShellContext>(); }

function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<SavedItem[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]); const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const search = searchParams.get('search') ?? ''; const type = searchParams.get('type') ?? ''; const status = searchParams.get('status') ?? ''; const tagId = searchParams.get('tagId') ?? ''; const collectionId = searchParams.get('collectionId') ?? ''; const sort = searchParams.get('sort') ?? 'created_desc'; const cursor = searchParams.get('cursor') ?? '';
  const hasActiveFilters = Boolean(search || type || status || tagId || collectionId);
  const selectedTag = tags.find((tag) => tag.id === tagId);
  const selectedCollection = collections.find((collection) => collection.id === collectionId);
  const query = useMemo(() => { const params = new URLSearchParams({ search, sort, limit: '25' }); if (type) params.set('type', type); if (status) params.set('status', status); if (tagId) params.set('tagId', tagId); if (collectionId) params.set('collectionId', collectionId); if (cursor) params.set('cursor', cursor); return params.toString(); }, [search, sort, type, status, tagId, collectionId, cursor]);
  const load = useCallback(async () => { setLoading(true); setError(''); try { const body = await api<{ items: SavedItem[]; nextCursor: string | null; hasMore: boolean }>(`/api/items?${query}`); setItems(body.items); setNextCursor(body.nextCursor); setHasMore(body.hasMore); } catch (cause) { setError(messageOf(cause, 'Could not load your library.')); } finally { setLoading(false); } }, [query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { let alive = true; void Promise.all([api<{ tags: Tag[] }>('/api/tags'), api<{ collections: Collection[] }>('/api/collections')]).then(([tagResult, collectionResult]) => { if (alive) { setTags(tagResult.tags); setCollections(collectionResult.collections); } }).catch(() => undefined); return () => { alive = false; }; }, []);
  function updateFilter(key: string, value: string) { const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); next.delete('cursor'); setSearchParams(next); }
  function setSearch(value: string) { const next = new URLSearchParams(searchParams); if (value) next.set('search', value); else next.delete('search'); next.delete('cursor'); setSearchParams(next, { replace: true }); }
  function clearFilters() { const next = new URLSearchParams(searchParams); ['search', 'type', 'status', 'tagId', 'collectionId', 'cursor'].forEach((key) => next.delete(key)); setSearchParams(next); }
  async function remove(item: SavedItem) { if (!window.confirm(`Remove “${item.title}” and its child data from your library?`)) return; try { await api(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not remove item.')); } }
  return <><div className="phase2-page-heading"><div><p className="eyebrow">Your private library</p><h1>Everything you kept.</h1><p>Search, organize, and revisit your saved pages and notes.</p></div><div className="phase2-heading-actions"><Link className="quiet-button" to="/app/notes/new">New note</Link><Link className="primary-button" to="/app/add">Save a page</Link></div></div>
    <section className="phase2-panel" aria-label="Library controls"><div className="phase2-filter-grid"><label>Search<input type="search" maxLength={120} placeholder="Title or URL" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Type<select value={type} onChange={(event) => updateFilter('type', event.target.value)}><option value="">All types</option><option value="page">Pages</option><option value="note">Notes</option></select></label><label>Status<select value={status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option><option value="queued">Queued</option><option value="processing">Processing</option><option value="ready">Ready</option><option value="failed">Failed</option></select></label><label>Tag<select value={tagId} onChange={(event) => updateFilter('tagId', event.target.value)}><option value="">Any tag</option>{tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}</select></label><label>Collection<select value={collectionId} onChange={(event) => updateFilter('collectionId', event.target.value)}><option value="">Any collection</option>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="created_desc">Newest first</option><option value="created_asc">Oldest first</option><option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option></select></label></div>{hasActiveFilters && <div className="phase2-filter-summary"><p>Filtered by{search && <> <strong>“{search}”</strong></>}{type && <> <strong>{type === 'page' ? 'Pages' : 'Notes'}</strong></>}{status && <> <strong>{readableStatus(status as Status)}</strong></>}{selectedTag && <> <strong>Tag: {selectedTag.name}</strong></>}{selectedCollection && <> <strong>Collection: {selectedCollection.name}</strong></>}</p><button className="phase2-text-button" type="button" onClick={clearFilters}>Clear filters</button></div>}</section>
    {error && <div className="notice error phase2-retry-notice" role="alert"><span>{error}</span><button className="quiet-button" type="button" onClick={() => void load()}>Try again</button></div>}
    {loading ? <div className="phase2-state" role="status">Loading your library…</div> : items.length === 0 ? <div className="empty-state"><span>✳</span><h2>{hasActiveFilters ? 'No saved items match these filters.' : 'Your library is ready for its first save.'}</h2><p>{hasActiveFilters ? 'Change your filters or clear them to see your full library.' : 'Save a page or write a note to start building your library.'}</p><div className="phase2-heading-actions">{hasActiveFilters && <button className="quiet-button" type="button" onClick={clearFilters}>Clear filters</button>}<Link className="quiet-button" to="/app/notes/new">Write a note</Link><Link className="primary-button" to="/app/add">Save a page</Link></div></div> : <ul className="item-list">{items.map((item) => <li className="item-card" key={item.id}><div className="item-main"><div className="item-info"><p className="item-domain">{item.kind === 'note' ? 'PERSONAL NOTE' : safeHost(item.url)}</p><Link className="item-title" to={`/app/items/${encodeURIComponent(item.id)}`}>{item.title}</Link><p className="item-description">{item.description || item.note?.body || item.textPreview || 'No description yet.'}</p><div className="phase2-pills">{item.tags?.map((tag) => <span className="phase2-pill" key={tag.id}>{tag.name}</span>)}{item.collections?.map((collection) => <span className="phase2-pill soft" key={collection.id}>{collection.name}</span>)}</div></div><div className="item-actions"><span className={`status status-${item.status}`}><span>●</span>{readableStatus(item.status)}</span><time dateTime={item.createdAt}>{date(item.createdAt)}</time><Link className="quiet-button" to={`/app/items/${encodeURIComponent(item.id)}/edit`}>Edit</Link><button className="quiet-button danger-button" onClick={() => void remove(item)} type="button">Remove</button></div></div></li>)}</ul>}
    {!loading && items.length > 0 && <nav className="phase2-pagination" aria-label="Library pages"><span>{hasMore ? 'More items are available.' : 'You are at the end of your library.'}</span><button type="button" className="quiet-button" disabled={!searchParams.get('cursor')} onClick={() => { const next = new URLSearchParams(searchParams); next.delete('cursor'); setSearchParams(next); }}>First page</button><button type="button" className="primary-button" disabled={!hasMore || !nextCursor} onClick={() => { if (nextCursor) { const next = new URLSearchParams(searchParams); next.set('cursor', nextCursor); setSearchParams(next); } }}>Next page</button></nav>}
    <span className="visually-hidden" aria-live="polite">{items.length} saved items shown</span>
  </>;
}
function safeHost(value: string) { try { return new URL(value).hostname; } catch { return 'SAVED PAGE'; } }

function AddPage() {
  const [url, setUrl] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); try { const body = await api<{ item: SavedItem; duplicate: boolean }>('/api/items', { method: 'POST', body: JSON.stringify({ url }) }); setMessage(body.duplicate ? 'This URL is already in your library.' : 'Page accepted. Rembr is saving its content.'); navigate(`/app/items/${encodeURIComponent(body.item.id)}`); } catch (cause) { setError(messageOf(cause, 'Could not save that page.')); } finally { setBusy(false); } }
  return <><PageHeader eyebrow="Add to your library" title="Save a page" description="Rembr keeps the original link and creates a readable copy." /><section className="phase2-panel phase2-narrow"><form className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="save-url">Public page URL</label><input id="save-url" type="url" autoComplete="url" placeholder="https://example.com/article" required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} />{error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Saving page…' : 'Save page'}</button><Link className="phase2-text-button" to="/app">Back to library</Link></form></section></>;
}

function ItemDetailPage() {
  const { itemId = '' } = useParams(); const [item, setItem] = useState<SavedItem | null>(null); const [allTags, setAllTags] = useState<Tag[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); setError(''); try { setItem((await api<{ item: SavedItem }>(`/api/items/${encodeURIComponent(itemId)}`)).item); } catch (cause) { setError(messageOf(cause, 'Could not load this item.')); } finally { if (!quiet) setLoading(false); } }, [itemId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!item || !['queued', 'processing'].includes(item.status)) return undefined; const timer = window.setInterval(() => { void load(true); }, 2500); return () => window.clearInterval(timer); }, [item, load]);
  useEffect(() => { let alive = true; void api<{ tags: Tag[] }>('/api/tags').then((result) => { if (alive) setAllTags(result.tags); }).catch(() => undefined); return () => { alive = false; }; }, []);
  async function updateTag(tag: Tag, add: boolean) { if (!item) return; setError(''); try { await api(`/api/items/${encodeURIComponent(item.id)}/tags/${encodeURIComponent(tag.id)}`, { method: add ? 'PUT' : 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not update item tags.')); } }
  if (loading) return <div className="phase2-state" role="status">Loading saved item…</div>;
  if (error || !item) return <ErrorState message={error || 'This item was not found.'} />;
  const isNote = item.kind === 'note';
  return <><div className="phase2-back"><Link to="/app">← Back to library</Link></div><PageHeader eyebrow={isNote ? 'Personal note' : safeHost(item.url)} title={item.title} description={item.description || (isNote ? 'A note in your private library.' : 'Saved page and processing status.')} actions={<><Link className="quiet-button" to={`/app/items/${encodeURIComponent(item.id)}/edit`}>Edit details</Link>{isNote && <Link className="primary-button" to={`/app/notes/${encodeURIComponent(item.id)}/edit`}>Edit note</Link>}</>} />
    {error && <p className="notice error" role="alert">{error}</p>}<div className="phase2-detail-grid"><article className="phase2-panel"><h2>{isNote ? 'Note' : 'Saved copy'}</h2>{isNote ? <><p className="phase2-preserve-text">{item.note?.body || 'This note is empty.'}</p>{item.note?.links?.length ? <section><h3>Links</h3><ul className="phase2-link-list">{item.note.links.map((link) => <li key={link}><a href={link} target="_blank" rel="noreferrer">{link}</a></li>)}</ul></section> : null}{item.note?.assets?.length ? <section className="phase2-assets"><h3>Images</h3>{item.note.assets.map((asset) => <img key={asset.id} src={asset.url} alt="Note attachment" loading="lazy" />)}</section> : null}</> : <><p className="phase2-status-line"><span className={`status status-${item.status}`}>● {readableStatus(item.status)}</span></p><p className="phase2-preserve-text">{item.text || item.textPreview || (item.status === 'failed' ? 'Rembr could not make a readable copy. The source link is still available.' : 'The readable copy will appear when processing finishes.')}</p><a className="source-link" href={item.url} target="_blank" rel="noreferrer">Open original page ↗</a></>}</article><aside className="phase2-panel"><h2>Organize</h2><h3>Tags</h3><div className="phase2-tag-choices">{allTags.length ? allTags.map((tag) => { const attached = item.tags?.some((current) => current.id === tag.id); return <label className="phase2-check" key={tag.id}><input type="checkbox" checked={Boolean(attached)} onChange={(event) => void updateTag(tag, event.target.checked)} /><span>{tag.name}</span></label>; }) : <p className="phase2-helper">No tags yet. <Link to="/app/tags">Create one</Link></p>}</div><p><Link to="/app/tags">Manage tags</Link></p><h3>Collections</h3><ul className="phase2-link-list">{item.collections?.map((collection) => <li key={collection.id}><Link to={`/app/collections/${encodeURIComponent(collection.id)}`}>{collection.name}</Link></li>)}</ul><Link to="/app/collections">Manage collections</Link><hr /><p className="phase2-helper">Saved {date(item.createdAt)}{item.fetchedAt ? ` · Processed ${date(item.fetchedAt)}` : ''}</p></aside></div>
  </>;
}

function ItemEditPage() {
  const { itemId = '' } = useParams(); const navigate = useNavigate(); const [item, setItem] = useState<SavedItem | null>(null); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let alive = true; void api<{ item: SavedItem }>(`/api/items/${encodeURIComponent(itemId)}`).then(({ item: result }) => { if (alive) { setItem(result); setTitle(result.titleOverride ?? result.title); setDescription(result.descriptionOverride ?? result.description); } }).catch((cause) => { if (alive) setError(messageOf(cause, 'Could not load this item.')); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [itemId]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { await api(`/api/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify({ titleOverride: title, descriptionOverride: description }) }); navigate(`/app/items/${encodeURIComponent(itemId)}`, { replace: true }); } catch (cause) { setError(messageOf(cause, 'Could not update item details.')); } finally { setBusy(false); } }
  if (loading) return <div className="phase2-state" role="status">Loading item…</div>;
  if (!item) return <ErrorState message={error || 'This item was not found.'} />;
  return <><div className="phase2-back"><Link to={`/app/items/${encodeURIComponent(itemId)}`}>← Cancel and return</Link></div><PageHeader eyebrow="Edit details" title="Make it easier to find." description="Your edits do not change the extracted source title, text, or provenance." /><section className="phase2-panel phase2-narrow"><form className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="item-title">Title</label><input id="item-title" maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} /><label htmlFor="item-description">Description</label><textarea id="item-description" rows={5} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form></section></>;
}

function NoteEditorPage() {
  const { itemId } = useParams(); const editing = Boolean(itemId); const navigate = useNavigate();
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [linksText, setLinksText] = useState(''); const [images, setImages] = useState<File[]>([]); const [existingAssets, setExistingAssets] = useState<Asset[]>([]); const [loading, setLoading] = useState(editing); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const imagePreviews = useMemo(() => images.map((file) => ({ file, url: URL.createObjectURL(file) })), [images]);
  useEffect(() => () => imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url)), [imagePreviews]);
  useEffect(() => { if (!itemId) return; let alive = true; void api<{ item: SavedItem }>(`/api/items/${encodeURIComponent(itemId)}`).then(({ item }) => { if (!alive) return; setTitle(item.titleOverride ?? item.title); setBody(item.note?.body ?? ''); setLinksText(item.note?.links?.join('\n') ?? ''); setExistingAssets(item.note?.assets ?? []); }).catch((cause) => { if (alive) setError(messageOf(cause, 'Could not load this note.')); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [itemId]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); const links = linksText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); if (links.length > 20) { setError('Add up to 20 links.'); return; } try { for (const value of links) { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } } catch { setError('Each note link must be a complete HTTP or HTTPS URL.'); return; } if (images.some((image) => image.size > 5 * 1024 * 1024)) { setError('Each image must be 5 MiB or smaller.'); return; } setBusy(true); const form = new FormData(); form.set('title', title.trim() || 'Untitled note'); form.set('body', body); form.set('links', JSON.stringify(links)); images.forEach((image) => form.append('images', image)); try { const path = editing ? `/api/notes/${encodeURIComponent(itemId!)}` : '/api/notes'; const result = await api<{ item: SavedItem }>(path, { method: editing ? 'PATCH' : 'POST', body: form }); navigate(`/app/items/${encodeURIComponent(result.item.id)}`); } catch (cause) { setError(messageOf(cause, 'Could not save this note.')); } finally { setBusy(false); } }
  async function removeAsset(asset: Asset) { if (!itemId || !window.confirm('Remove this image from the note?')) return; setError(''); try { await api(`/api/notes/${encodeURIComponent(itemId)}/assets/${encodeURIComponent(asset.id)}`, { method: 'DELETE' }); setExistingAssets((current) => current.filter((entry) => entry.id !== asset.id)); } catch (cause) { setError(messageOf(cause, 'Could not remove image.')); } }
  if (loading) return <div className="phase2-state" role="status">Loading note…</div>;
  const linkCount = linksText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
  return <><div className="phase2-back"><Link to={editing ? `/app/items/${encodeURIComponent(itemId!)}` : '/app'}>← Cancel and return</Link></div><PageHeader eyebrow={editing ? 'Edit note' : 'New note'} title={editing ? 'Keep your thinking current.' : 'Capture a thought.'} description="Notes live in your library alongside saved pages." /><section className="phase2-panel phase2-narrow"><form className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="note-title">Title</label><input id="note-title" required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A title for this note" /><label htmlFor="note-body">Note</label><textarea id="note-body" rows={12} maxLength={20000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a note…" /><div className="phase2-char-count">{body.length.toLocaleString()} / 20,000</div><label htmlFor="note-links">Links <span>(one per line, up to 20)</span></label><textarea id="note-links" rows={4} value={linksText} onChange={(event) => setLinksText(event.target.value)} placeholder="https://example.com" /><div className="phase2-char-count">{linkCount} / 20 links</div><label htmlFor="note-images">Add images <span>(up to {Math.max(0, 5 - existingAssets.length)} more, max 5 MiB each)</span></label><input id="note-images" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={existingAssets.length >= 5} onChange={(event) => { const picked = Array.from(event.target.files ?? []); const max = Math.max(0, 5 - existingAssets.length); if (picked.length > max) setError(`This note can have at most five images. Select ${max} or fewer.`); else setError(''); setImages(picked.slice(0, max)); }} />{(existingAssets.length > 0 || images.length > 0) && <div className="phase2-asset-previews">{existingAssets.map((asset) => <figure key={asset.id}><img src={asset.url} alt="Existing note attachment" /><figcaption><span>Saved image</span><button className="quiet-button danger-button" type="button" onClick={() => void removeAsset(asset)}>Remove</button></figcaption></figure>)}{imagePreviews.map(({ file, url }, index) => <figure key={`${file.name}-${file.size}-${index}`}><img src={url} alt={`Preview of ${file.name}`} /><figcaption><span>{file.name}</span><button className="quiet-button danger-button" type="button" onClick={() => setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</button></figcaption></figure>)}</div>}{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Saving note…' : editing ? 'Save note' : 'Create note'}</button></form></section></>;
}

function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]); const [name, setName] = useState(''); const [editingId, setEditingId] = useState<string | null>(null); const [editName, setEditName] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setTags((await api<{ tags: Tag[] }>('/api/tags')).tags); setError(''); } catch (cause) { setError(messageOf(cause, 'Could not load tags.')); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { await api('/api/tags', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); await load(); } catch (cause) { setError(messageOf(cause, 'Could not create tag.')); } finally { setBusy(false); } }
  async function update(tag: Tag) { setBusy(true); setError(''); try { await api(`/api/tags/${encodeURIComponent(tag.id)}`, { method: 'PATCH', body: JSON.stringify({ name: editName }) }); setEditingId(null); await load(); } catch (cause) { setError(messageOf(cause, 'Could not update tag.')); } finally { setBusy(false); } }
  async function remove(tag: Tag) { if (!window.confirm(`Delete the tag “${tag.name}”? Saved items will remain.`)) return; try { await api(`/api/tags/${encodeURIComponent(tag.id)}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not delete tag.')); } }
  return <><PageHeader eyebrow="Organize your library" title="Tags" description="Use tags to group related saves across collections." /><section className="phase2-panel phase2-narrow"><form className="phase2-inline-form" onSubmit={(event) => void add(event)}><label className="visually-hidden" htmlFor="new-tag">New tag name</label><input id="new-tag" maxLength={40} required placeholder="Name a tag" value={name} onChange={(event) => setName(event.target.value)} /><button className="primary-button" disabled={busy}>{busy ? 'Adding…' : 'Add tag'}</button></form>{error && <p className="notice error" role="alert">{error}</p>}{loading ? <div className="phase2-state">Loading tags…</div> : tags.length ? <ul className="phase2-manage-list">{tags.map((tag) => <li key={tag.id}>{editingId === tag.id ? <form className="phase2-inline-edit" onSubmit={(event) => { event.preventDefault(); void update(tag); }}><label className="visually-hidden" htmlFor={`edit-tag-${tag.id}`}>Edit tag name</label><input id={`edit-tag-${tag.id}`} maxLength={40} required value={editName} onChange={(event) => setEditName(event.target.value)} /><button className="quiet-button" disabled={busy}>Save</button><button className="phase2-text-button" type="button" onClick={() => setEditingId(null)}>Cancel</button></form> : <span className="phase2-pill">{tag.name}</span>}<div className="phase2-card-actions"><button className="quiet-button" type="button" onClick={() => { setEditingId(tag.id); setEditName(tag.name); }}>Edit</button><button className="quiet-button danger-button" onClick={() => void remove(tag)} type="button">Delete</button></div></li>)}</ul> : <div className="empty-state"><h2>No tags yet</h2><p>Create a tag, then add it to saved items from their detail page.</p></div>}</section></>;
}

function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [editingId, setEditingId] = useState<string | null>(null); const [editName, setEditName] = useState(''); const [editDescription, setEditDescription] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); try { setCollections((await api<{ collections: Collection[] }>('/api/collections')).collections); setError(''); } catch (cause) { setError(messageOf(cause, 'Could not load collections.')); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { await api('/api/collections', { method: 'POST', body: JSON.stringify({ name, description }) }); setName(''); setDescription(''); await load(); } catch (cause) { setError(messageOf(cause, 'Could not create collection.')); } finally { setBusy(false); } }
  async function update(collection: Collection) { setBusy(true); setError(''); try { await api(`/api/collections/${encodeURIComponent(collection.id)}`, { method: 'PATCH', body: JSON.stringify({ name: editName, description: editDescription }) }); setEditingId(null); await load(); } catch (cause) { setError(messageOf(cause, 'Could not update collection.')); } finally { setBusy(false); } }
  async function remove(collection: Collection) { if (!window.confirm(`Delete “${collection.name}”? Saved items will remain in your library.`)) return; try { await api(`/api/collections/${encodeURIComponent(collection.id)}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not delete collection.')); } }
  return <><PageHeader eyebrow="Organize your library" title="Collections" description="Create manual groups for projects, topics, and reading lists." /><section className="phase2-panel"><form className="phase2-form phase2-create-collection" onSubmit={(event) => void create(event)}><label htmlFor="collection-name">Collection name</label><input id="collection-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Research for later" /><label htmlFor="collection-description">Description <span>(optional)</span></label><input id="collection-description" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What belongs here?" /><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create collection'}</button></form>{error && <p className="notice error" role="alert">{error}</p>}{loading ? <div className="phase2-state">Loading collections…</div> : collections.length ? <ul className="phase2-collection-grid">{collections.map((collection) => <li className="phase2-panel" key={collection.id}>{editingId === collection.id ? <form className="phase2-form" onSubmit={(event) => { event.preventDefault(); void update(collection); }}><label htmlFor={`collection-edit-name-${collection.id}`}>Name</label><input id={`collection-edit-name-${collection.id}`} required maxLength={80} value={editName} onChange={(event) => setEditName(event.target.value)} /><label htmlFor={`collection-edit-description-${collection.id}`}>Description</label><input id={`collection-edit-description-${collection.id}`} maxLength={500} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /><div className="phase2-card-actions"><button className="quiet-button" disabled={busy}>Save</button><button className="phase2-text-button" type="button" onClick={() => setEditingId(null)}>Cancel</button></div></form> : <><p className="eyebrow">Manual collection</p><h2><Link to={`/app/collections/${encodeURIComponent(collection.id)}`}>{collection.name}</Link></h2><p>{collection.description || 'No description yet.'}</p><div className="phase2-card-actions"><Link className="quiet-button" to={`/app/collections/${encodeURIComponent(collection.id)}`}>Open</Link><button className="quiet-button" type="button" onClick={() => { setEditingId(collection.id); setEditName(collection.name); setEditDescription(collection.description ?? ''); }}>Edit</button><button className="quiet-button danger-button" type="button" onClick={() => void remove(collection)}>Delete</button></div></>}</li>)}</ul> : <div className="empty-state"><h2>No collections yet</h2><p>Make a collection, then add saved pages and notes from its page.</p></div>}</section></>;
}

function CollectionDetailPage() {
  const { collectionId = '' } = useParams(); const [searchParams, setSearchParams] = useSearchParams(); const [collection, setCollection] = useState<Collection | null>(null); const [items, setItems] = useState<SavedItem[]>([]); const [library, setLibrary] = useState<SavedItem[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  const cursor = searchParams.get('cursor') ?? '';
  const load = useCallback(async () => { setLoading(true); try { const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''; const result = await api<{ collection: Collection; items: SavedItem[]; nextCursor: string | null; hasMore: boolean }>(`/api/collections/${encodeURIComponent(collectionId)}${query}`); setCollection(result.collection); setItems(result.items); setNextCursor(result.nextCursor); setHasMore(result.hasMore); const all = await api<{ items: SavedItem[] }>('/api/items?limit=100'); setLibrary(all.items); setError(''); } catch (cause) { setError(messageOf(cause, 'Could not load this collection.')); } finally { setLoading(false); } }, [collectionId, cursor]);
  useEffect(() => { void load(); }, [load]);
  const inCollection = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const available = useMemo(() => library.filter((item) => !inCollection.has(item.id) && `${item.title} ${item.url}`.toLowerCase().includes(search.toLowerCase())), [inCollection, library, search]);
  async function membership(item: SavedItem, add: boolean) { try { await api(`/api/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(item.id)}`, { method: add ? 'PUT' : 'DELETE' }); await load(); } catch (cause) { setError(messageOf(cause, 'Could not update collection.')); } }
  return <><div className="phase2-back"><Link to="/app/collections">← All collections</Link></div>{loading ? <div className="phase2-state">Loading collection…</div> : !collection ? <ErrorState message={error || 'Collection not found.'} /> : <><PageHeader eyebrow="Collection" title={collection.name} description={collection.description || 'A manually managed group of library items.'} /><div className="phase2-detail-grid"><section className="phase2-panel"><h2>Items in this collection</h2>{error && <p className="notice error" role="alert">{error}</p>}{items.length ? <ul className="phase2-manage-list">{items.map((item) => <li key={item.id}><Link to={`/app/items/${encodeURIComponent(item.id)}`}>{item.title}</Link><button className="quiet-button danger-button" onClick={() => void membership(item, false)} type="button">Remove</button></li>)}</ul> : <div className="phase2-state">This collection is empty. Add a saved item from the list on the right.</div>}<div className="phase2-pagination"><button className="quiet-button" disabled={!cursor} onClick={() => { const next = new URLSearchParams(searchParams); next.delete('cursor'); setSearchParams(next); }} type="button">First page</button><button className="primary-button" disabled={!hasMore || !nextCursor} onClick={() => { if (nextCursor) { const next = new URLSearchParams(searchParams); next.set('cursor', nextCursor); setSearchParams(next); } }} type="button">Next page</button></div></section><section className="phase2-panel"><h2>Add from your library</h2><label className="visually-hidden" htmlFor="collection-search">Find saved items</label><input id="collection-search" type="search" placeholder="Find a page or note" value={search} onChange={(event) => setSearch(event.target.value)} /><ul className="phase2-manage-list">{available.slice(0, 30).map((item) => <li key={item.id}><span>{item.title}</span><button className="quiet-button" onClick={() => void membership(item, true)} type="button">Add</button></li>)}</ul></section></div></>}</>;
}

function SettingsPage() {
  const { session, setSession } = useShell(); const location = useLocation(); const [profile, setProfile] = useState<Profile | null>(session.profile); const [onboarding, setOnboarding] = useState<Onboarding | null>(null); const [settingsLoaded, setSettingsLoaded] = useState(false); const [avatar, setAvatar] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const isPrefs = location.pathname.endsWith('/preferences');
  useEffect(() => { let alive = true; void Promise.all([api<{ profile: Profile | null }>('/api/profile'), api<{ onboarding: Onboarding | null }>('/api/onboarding')]).then(([p, o]) => { if (alive) { setProfile(p.profile); setOnboarding(o.onboarding); } }).catch((cause) => { if (alive) setError(messageOf(cause, 'Could not load settings.')); }).finally(() => { if (alive) setSettingsLoaded(true); }); return () => { alive = false; }; }, []);
  async function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); const form = new FormData(event.currentTarget); const username = String(form.get('username') ?? ''); const avatarUrl = String(form.get('avatarUrl') ?? ''); try { const body = avatar ? new FormData() : JSON.stringify({ username, avatarUrl }); if (avatar && body instanceof FormData) { body.set('username', username); body.set('avatar', avatar); } const result = await api<{ profile: Profile }>('/api/profile', { method: 'PATCH', body }); setAvatar(null); setProfile(result.profile); setSession({ ...session, profile: result.profile, profileComplete: true }); setMessage('Profile saved.'); } catch (cause) { setError(messageOf(cause, 'Could not save profile.')); } finally { setBusy(false); } }
  async function savePrefs(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); const form = new FormData(event.currentTarget); const contentTypes = form.getAll('contentTypes').map(String); const referralSource = String(form.get('referralSource') ?? ''); try { const result = await api<{ onboarding: Onboarding }>('/api/onboarding', { method: 'PUT', body: JSON.stringify({ contentTypes, referralSource, skipped: false }) }); setOnboarding(result.onboarding); setMessage('Preferences saved.'); } catch (cause) { setError(messageOf(cause, 'Could not save preferences.')); } finally { setBusy(false); } }
  return <><PageHeader eyebrow="Your account" title="Settings" description="Manage your profile and the preferences you shared during setup." actions={<div className="phase2-tab-links"><Link className={!isPrefs ? 'active' : ''} to="/app/settings/profile">Profile</Link><Link className={isPrefs ? 'active' : ''} to="/app/settings/preferences">Preferences</Link></div>} />{error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}{!settingsLoaded ? <div className="phase2-state" role="status">Loading settings…</div> : isPrefs ? <section className="phase2-panel phase2-narrow"><h2>Onboarding preferences</h2><p className="phase2-helper">These are the content types you said you want to save and how you found Rembr.</p><form className="phase2-form" onSubmit={(event) => void savePrefs(event)}><fieldset className="phase2-options"><legend>Content you want to keep</legend><div className="phase2-option-grid">{contentOptions.map(([value, label]) => <label className="phase2-check" key={value}><input name="contentTypes" type="checkbox" value={value} defaultChecked={onboarding?.contentTypes.includes(value)} /><span>{label}</span></label>)}</div></fieldset><label htmlFor="settings-referral">How did you hear about Rembr?</label><select id="settings-referral" name="referralSource" defaultValue={onboarding?.referralSource ?? ''}><option value="">Choose one</option>{referralOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save preferences'}</button></form></section> : <section className="phase2-panel phase2-narrow"><h2>Profile</h2><p className="phase2-helper">Signed in as {session.user.email}</p><form className="phase2-form" onSubmit={(event) => void saveProfile(event)}><label htmlFor="settings-username">Username</label><input id="settings-username" name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" defaultValue={profile?.username ?? ''} /><label htmlFor="settings-avatar">Avatar URL</label><input id="settings-avatar" name="avatarUrl" type="url" placeholder="https://…" defaultValue={profile?.avatarUrl ?? ''} onChange={() => setAvatar(null)} /><label htmlFor="settings-avatar-file">Or upload an avatar</label><input id="settings-avatar-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 250 * 1024) { setError('Profile images must be 250 KB or smaller.'); setAvatar(null); } else { setError(''); setAvatar(file); } }} /><p className="field-note">PNG, JPEG, or WebP up to 250 KB.</p><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></form><p className="phase2-helper">Account security, data export, deletion, and billing controls are planned for Phase 6.</p></section>}</>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="phase2-page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="phase2-heading-actions">{actions}</div>}</div>;
}
function ErrorState({ message }: { message: string }) { return <div className="phase2-state phase2-error-state" role="alert"><h2>We could not open this view.</h2><p>{message}</p><Link className="quiet-button" to="/app">Back to library</Link></div>; }

export function App() { return <AppRoutes />; }
