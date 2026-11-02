import type { ApiError, Profile, SavedItem, Session } from './app/contracts.js';
import { api, apiWithProgress } from './app/api.js';
import { messageOf, sameAppPath } from './app/helpers.js';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FileText, Link2, Plus, Upload, X } from 'lucide-react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AvatarUpload } from './components/AvatarUpload.js';
import { RembrAuthFrame } from './features/auth/RembrAuthFrame.js';
import { RembrWorkspaceTour } from './features/workspace/RembrWorkspaceTour.js';
import { AppShellSkeleton } from './components/ui/LoadingStates.jsx';
import { GlobalButtonTooltips } from './components/ui/GlobalButtonTooltips.js';
import { LibraryPage, KnowledgeGraphPage, LibraryCheckupPage } from './features/library/pages.js';
import { AddPage, ImportsPage, ImportDetailPage } from './features/imports/pages.js';
import { ItemDetailPage, ItemEditPage, NoteEditorPage } from './features/items/pages.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { DeveloperAccessPage } from './features/settings/DeveloperAccessPage.js';

const MarketingSite = lazy(() => import('./MarketingSite.js').then(({ MarketingSite: page }) => ({ default: page })));
const PortedLanding = lazy(() => import('./features/marketing/PortedLanding.js').then(({ PortedLanding: page }) => ({ default: page })));
const HowToUsePage = lazy(() => import('./features/marketing/PublicPages.js').then(({ PortedHowToPage: page }) => ({ default: page })));
const HelpPage = lazy(() => import('./features/marketing/PublicPages.js').then(({ PortedHelpPage: page }) => ({ default: page })));
const PricingPage = lazy(() => import('./features/marketing/PublicPages.js').then(({ PortedPricingPage: page }) => ({ default: page })));
const LegalPage = lazy(() => import('./features/marketing/PublicPages.js').then(({ PortedLegalPage: page }) => ({ default: page })));
const PasswordStrengthField = lazy(() => import('./components/PasswordStrengthField.js').then(({ PasswordStrengthField: field }) => ({ default: field })));
const SmartCollectionsPage = lazy(() => import('./components/SmartCollectionsPage.js').then(({ SmartCollectionsPage: page }) => ({ default: page })));




function AppRoutes() {
  return <BrowserRouter><Suspense fallback={<main className="center-state route-loading-fallback" role="status" aria-label="Loading page" />}><Routes>
    <Route path="/" element={<PortedLanding />} />
    <Route path="/features" element={<MarketingSite />} />
    <Route path="/about" element={<MarketingSite />} />
    <Route path="/contact" element={<MarketingSite />} />
    <Route path="/how-to-use" element={<HowToUsePage />} />
    <Route path="/help" element={<HelpPage />} />
    <Route path="/pricing" element={<PricingPage />} />
    <Route path="/terms" element={<LegalPage kind="terms" />} />
    <Route path="/privacy" element={<LegalPage kind="privacy" />} />
    <Route path="/security" element={<LegalPage kind="security" />} />
    <Route path="/data-deletion" element={<LegalPage kind="data-deletion" />} />
    <Route path="/cookies" element={<LegalPage kind="cookies" />} />
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
      <Route path="smart-collections" element={<SmartCollectionsPage request={api} />} />
      <Route path="smart-collections/:collectionId" element={<SmartCollectionsPage request={api} />} />
      <Route path="graph" element={<KnowledgeGraphPage />} />
      <Route path="checkup" element={<LibraryCheckupPage />} />
      <Route path="settings/profile" element={<SettingsPage />} />
      <Route path="settings/preferences" element={<SettingsPage />} />
      <Route path="settings/developer-access" element={<DeveloperAccessPage />} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense></BrowserRouter>;
}

function NotFoundPage() {
  return <main className="rg-page"><div className="rg-main"><section className="rg-intro"><p className="rg-kicker">404 / NOT FOUND</p><h1>This page is not here.</h1><p>Check the address or return to your Rembr library.</p><div className="rg-not-found-actions"><Link className="rg-button rg-button-primary" to="/">Go to Rembr home</Link><Link className="rg-button rg-button-secondary" to="/app">Open your library</Link></div></section></div></main>;
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

  return <RembrAuthFrame title="Keep what you find. Find it again." description="Save a public page with its source and a readable copy." sideNote="Made for the long read">
    <div className="auth-card-heading"><h2 id="auth-form-title">{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2></div>
      <div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setPassword(''); setPasswordRevealed(false); setError(''); }}>Sign in</button><button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setPassword(''); setPasswordRevealed(false); setError(''); }}>Create account</button></div>
      <form className="stack-form" onSubmit={(event) => void submit(event)}><label htmlFor="email">Email address</label><input id="email" autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />{mode === 'register' ? <PasswordStrengthField id="password" value={password} onValueChange={setPassword} disabled={busy} /> : <><label htmlFor="password">Password</label><div className="password-input-wrap"><input id="password" name="password" autoComplete="current-password" type={passwordRevealed ? 'text' : 'password'} required minLength={1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="password-reveal" aria-label={passwordRevealed ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={passwordRevealed} onClick={() => setPasswordRevealed((current) => !current)}>{passwordRevealed ? 'Hide' : 'Show'}</button></div></>}{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? (mode === 'register' ? 'Creating account…' : 'Signing in…') : mode === 'register' ? 'Create your library' : 'Sign in to Rembr'}</button></form>
      <p className="privacy-note"><span>✳</span>Your library is private to your account. Rembr can save public pages.</p>
  </RembrAuthFrame>;
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
  const { session, setSession, loading, error, refresh } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const tourOpen = new URLSearchParams(location.search).get('tour') === '1';
  const [accountDenied, setAccountDenied] = useState(false);
  const detailReturnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const detailReturnPath = detailReturnTo?.split(/[?#]/, 1)[0] ?? '';
  const detailBackground = /^\/app\/items\/[^/]+$/.test(location.pathname)
    ? detailReturnPath === '/app/checkup' ? <LibraryCheckupPage /> : detailReturnPath === '/app/graph' ? <KnowledgeGraphPage /> : <LibraryPage />
    : null;
  const hasDetailBackground = Boolean(detailBackground);

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

  if (loading) return <AppShellSkeleton />;
  if (accountDenied) return <main className="phase2-centered"><section className="phase2-card"><h1>Account unavailable</h1><p>This account is disabled, so its library is unavailable.</p><Link className="quiet-button" to="/login">Back to sign in</Link></section></main>;
  if (error) return <main className="phase2-centered"><section className="phase2-card" role="alert"><h1>Your library could not load</h1><p>{error}</p><button className="quiet-button" type="button" onClick={() => void refresh()}>Try again</button></section></main>;
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (!session.profileComplete && !location.pathname.startsWith('/app/setup/')) return <Navigate to="/app/setup/profile" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  return <div className="dashboard-shell flex h-screen overflow-hidden bg-black text-foreground">
    <AppNav session={session} onLogout={async () => { await api('/api/auth/logout', { method: 'POST' }); setSession(null); navigate('/login', { replace: true }); }} />
    <main className="rembr-dashboard-main min-w-0 flex-1 overflow-y-auto">
      {detailBackground && <div className="rembr-detail-underlay" aria-hidden="true" inert><div className="phase2-main">{detailBackground}</div></div>}
      <div className={hasDetailBackground ? 'rembr-detail-route' : undefined}><div className="phase2-main"><Outlet context={{ session, setSession }} /></div></div>
    </main>
    <QuickAddDock />
    {tourOpen && <RembrWorkspaceTour
      open
      onClose={() => {
        const query = new URLSearchParams(location.search);
        query.delete('tour');
        navigate({ pathname: location.pathname, search: query.size ? `?${query.toString()}` : '' }, { replace: true });
      }}
      onNavigate={(path) => navigate(`${path}?tour=1`)}
    />}
  </div>;
}

function QuickAddDock() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'link' | 'note'>('menu');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [links, setLinks] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy]);

  function close() { setOpen(false); setView('menu'); setError(''); }
  async function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ item: SavedItem }>('/api/items', { method: 'POST', body: JSON.stringify({ url }) });
      close(); navigate(`/app/items/${encodeURIComponent(result.item.id)}`, { state: { returnTo: '/app' } });
    } catch (cause) { setError(messageOf(cause, 'Could not save that page.')); }
    finally { setBusy(false); }
  }
  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const noteLinks = links.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (noteLinks.length > 20) { setError('Add up to 20 links.'); return; }
    try { for (const value of noteLinks) { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } }
    catch { setError('Each link must be a complete HTTP or HTTPS URL.'); return; }
    if (images.length > 5 || images.some((image) => image.size > 5 * 1024 * 1024)) { setError('Choose up to five images, 5 MiB each.'); return; }
    setBusy(true);
    const form = new FormData(); form.set('title', title.trim() || 'Untitled note'); form.set('body', body); form.set('links', JSON.stringify(noteLinks)); images.forEach((image) => form.append('images', image));
    try {
      const result = await api<{ item: SavedItem }>('/api/notes', { method: 'POST', body: form });
      close(); navigate(`/app/items/${encodeURIComponent(result.item.id)}`, { state: { returnTo: '/app' } });
    } catch (cause) { setError(messageOf(cause, 'Could not save this note.')); }
    finally { setBusy(false); }
  }

  return <>
    <button className="quick-add-trigger" type="button" aria-label="Quick add to your library" aria-expanded={open} onClick={() => { setOpen(true); setView('menu'); }}><Plus aria-hidden="true" /></button>
    {open && <div className="quick-add-layer">
      <button className="quick-add-backdrop" type="button" aria-label="Close quick add" onClick={close} />
      <section className="quick-add-panel" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
        <header><div><span className="quick-add-kicker">Quick add</span><h2 id="quick-add-title">Add to your Library</h2></div><button className="quick-add-close" type="button" aria-label="Close quick add" onClick={close}><X /></button></header>
        {view === 'menu' && <div className="quick-add-menu">
          <button type="button" onClick={() => { setError(''); setView('link'); }}><span><Link2 /></span>Paste link</button>
          <button type="button" onClick={() => { setError(''); setView('note'); }}><span><FileText /></span>Write note</button>
          <button type="button" onClick={() => { close(); navigate('/app/add'); }}><span><Upload /></span>Upload file</button>
          <Link to="/app/add" onClick={close}><Upload />Open full Add Saves page</Link>
        </div>}
        {view === 'link' && <form className="quick-add-form" onSubmit={(event) => void saveLink(event)}>
          <button className="quick-add-back" type="button" onClick={() => { setView('menu'); setError(''); }}>← Quick add</button>
          <h3>Save a page</h3><label htmlFor="quick-add-url">Paste a link</label><input id="quick-add-url" type="url" inputMode="url" autoComplete="url" required maxLength={2048} placeholder="https://example.com/article" value={url} onChange={(event) => setUrl(event.currentTarget.value)} />
          {error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy || !url.trim()}>{busy ? 'Saving…' : 'Save page'}</button>
        </form>}
        {view === 'note' && <form className="quick-add-form" onSubmit={(event) => void saveNote(event)}>
          <button className="quick-add-back" type="button" onClick={() => { setView('menu'); setError(''); }}>← Quick add</button>
          <h3>Save a quick thought</h3><label className="visually-hidden" htmlFor="quick-add-note-body">Note</label><textarea id="quick-add-note-body" rows={1} maxLength={20000} required placeholder="Write the note, reminder, or idea…" value={body} onChange={(event) => { setBody(event.currentTarget.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }} />
          <label className="visually-hidden" htmlFor="quick-add-note-title">Title (optional)</label><input id="quick-add-note-title" maxLength={240} placeholder="Title optional" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          <label className="visually-hidden" htmlFor="quick-add-note-links">Optional links</label><textarea id="quick-add-note-links" rows={1} placeholder="Optional links, one per line" value={links} onChange={(event) => { setLinks(event.currentTarget.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }} />
          <label className="quick-add-image-button" htmlFor="quick-add-note-images"><Upload />Add images <span>{images.length}/5 selected</span></label><input id="quick-add-note-images" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => { const picked = Array.from(event.currentTarget.files ?? []).slice(0, 5); setImages(picked); event.currentTarget.value = ''; }} />
          {error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy || !body.trim()}>{busy ? 'Saving note…' : 'Save note'}</button>
        </form>}
      </section>
    </div>}
  </>;
}

function SidebarIcon({ name }: { name: string }) {
  return <img className="rembr-sidebar-icon" src={`/iconsax/${name}.svg`} alt="" aria-hidden="true" draggable={false} />;
}

function AppNav({ session, onLogout }: { session: Session; onLogout: () => Promise<void> }) {
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const sidebarExpanded = expanded || hoverExpanded;
  const navItems = [
    { path: '/app', label: 'Saved library', icon: <SidebarIcon name="book-saved" />, exact: true },
    { path: '/app/smart-collections', label: 'Smart collections', icon: <SidebarIcon name="folder-2" /> },
    { path: '/app/graph', label: 'Connections', icon: <SidebarIcon name="hierarchy-2" /> },
    { path: '/app/add', label: 'Add saves', icon: <SidebarIcon name="document-upload" /> },
  ];
  const moreItems = [
    { path: '/app/checkup', label: 'Review', icon: <SidebarIcon name="scan" /> },
  ];
  const activeMoreLink = moreItems.find(({ path }) => location.pathname.startsWith(path));
  const accountLabel = session.profile?.username ? `@${session.profile.username}` : session.user.email;
  const avatar = session.profile?.avatarAssetUrl ?? session.profile?.avatarUrl;
  const userMark = session.profile?.username?.slice(0, 1) ?? session.user.email.slice(0, 1);
  const isActive = (path: string, exact = false) => exact ? location.pathname === path : location.pathname.startsWith(path);
  const handleLogout = () => { setLogoutBusy(true); void onLogout().finally(() => setLogoutBusy(false)); };
  return <>
    <aside className={`iscraper-sidebar hidden h-screen shrink-0 flex-col overflow-hidden border-r border-white/5 bg-black transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex ${sidebarExpanded ? 'is-expanded w-60' : 'w-[76px]'}`}
      onMouseEnter={() => { if (!expanded) setHoverExpanded(true); }} onMouseLeave={() => setHoverExpanded(false)} aria-label="Workspace navigation">
      <div className={`flex border-b border-white/5 p-3 ${sidebarExpanded ? 'items-center gap-2' : 'flex-col items-center gap-2'}`}>
        <Link to="/" aria-label="Back to Rembr home" className={`flex min-h-11 items-center rounded-lg transition hover:bg-white/5 ${sidebarExpanded ? 'min-w-0 flex-1 gap-3 px-2' : 'h-11 w-11 justify-center'}`}>
          <SidebarIcon name="arrow-left-02" />{sidebarExpanded && <img className="rembr-official-logo app-nav-brand" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" />}
        </Link>
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={expanded} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-primary">
          <SidebarIcon name={expanded ? 'sidebar-left' : 'sidebar-right'} />
        </button>
      </div>
      <Link to="/app/settings/profile" aria-label={`Signed in as ${accountLabel}`} className={`flex items-center border-b border-white/5 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground ${sidebarExpanded ? 'gap-3 px-5 py-3' : 'justify-center px-3 py-3'}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-primary text-sm font-bold text-primary-foreground">{avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : userMark.toUpperCase()}</span>
        {sidebarExpanded && <span className="min-w-0"><span className="block">Signed in as</span><span className="block truncate font-semibold text-foreground">{accountLabel}</span></span>}
      </Link>
      <nav className={`flex-1 space-y-1 p-3 ${sidebarExpanded ? '' : 'flex flex-col items-center'}`} aria-label="Main navigation">
        {navItems.map((item) => <Link key={item.path} to={item.path} aria-label={item.label} aria-current={isActive(item.path, item.exact) ? 'page' : undefined}
          className={`flex items-center rounded-lg text-sm transition ${isActive(item.path, item.exact) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'} ${sidebarExpanded ? 'gap-3 px-3 py-2.5' : 'h-11 w-11 justify-center'}`}>
          {item.icon}{sidebarExpanded && <span className="truncate">{item.label}</span>}
        </Link>)}
        <div className={`relative ${sidebarExpanded ? '' : 'w-11'}`}>
          <button type="button" onClick={() => setMoreOpen((open) => !open)} data-active={Boolean(activeMoreLink)} aria-expanded={moreOpen} aria-controls="rembr-more-navigation" aria-label={activeMoreLink?.label ? `More navigation, ${activeMoreLink.label} selected` : 'More navigation'}
            className={`flex w-full items-center rounded-lg text-sm transition ${activeMoreLink ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'} ${sidebarExpanded ? 'gap-3 px-3 py-2.5' : 'h-11 justify-center'}`}>
            <SidebarIcon name="more" />{sidebarExpanded && <><span className="flex-1 text-left">More</span><SidebarIcon name={moreOpen ? 'arrow-up-01' : 'arrow-down-01'} /></>}
          </button>
          {moreOpen && <div id="rembr-more-navigation" className={`iscraper-more-menu ${sidebarExpanded ? 'is-expanded' : ''}`}>
            {moreItems.map((item) => <Link key={item.path} to={item.path} onClick={() => setMoreOpen(false)} aria-current={isActive(item.path) ? 'page' : undefined} className={isActive(item.path) ? 'is-active' : ''}>{item.icon}<span>{item.label}</span></Link>)}
          </div>}
        </div>
      </nav>
      <div className="flex flex-col gap-2 border-t border-white/5 p-3">
        <Link to="/how-to-use" className={`flex h-11 items-center rounded-lg text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground ${sidebarExpanded ? 'gap-3 px-3' : 'w-11 justify-center'}`} aria-label="How to use"><SidebarIcon name="book-open" />{sidebarExpanded && <span>How to use</span>}</Link>
        <div className={`flex gap-2 ${sidebarExpanded ? 'flex-row' : 'flex-col items-center'}`}>
          <Link to="/app/settings/profile" className={`flex h-11 shrink-0 items-center rounded-lg text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground ${sidebarExpanded ? 'flex-1 gap-3 px-3' : 'w-11 justify-center'}`} aria-label="Settings"><SidebarIcon name="setting-2" />{sidebarExpanded && <span>Settings</span>}</Link>
          <button type="button" className="danger-button grid h-11 w-11 shrink-0 place-items-center rounded-lg transition" aria-label="Sign out" disabled={logoutBusy} onClick={handleLogout}><SidebarIcon name="logout-01" /></button>
        </div>
      </div>
    </aside>
    <header className="mobile-app-topbar sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-black/90 p-3 backdrop-blur md:hidden">
      <Link to="/" aria-label="Rembr home" className="flex min-h-11 min-w-11 items-center gap-2"><SidebarIcon name="arrow-left-02" /><img className="rembr-official-logo app-nav-brand" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" /></Link>
      <Link to="/app/settings/profile" className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-white/10 bg-primary text-sm font-bold text-primary-foreground" aria-label="Open account settings">{avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : userMark.toUpperCase()}</Link>
    </header>
    {moreOpen && <button type="button" className="mobile-navigation-backdrop md:hidden" onClick={() => setMoreOpen(false)} aria-label="Close more navigation" />}
    <nav className="mobile-bottom-navigation md:hidden" aria-label="Main navigation" onKeyDown={(event) => { if (event.key === 'Escape') setMoreOpen(false); }}>
      <div id="rembr-mobile-more" className="mobile-more-panel" role="group" aria-label="More sections" hidden={!moreOpen}>
        {moreItems.map((item) => <Link key={item.path} to={item.path} onClick={() => setMoreOpen(false)} aria-current={isActive(item.path) ? 'page' : undefined} className={`mobile-more-item ${isActive(item.path) ? 'is-active' : ''}`}>{item.icon}<span>{item.label}</span></Link>)}
        <Link to="/app/smart-collections" onClick={() => setMoreOpen(false)} aria-current={isActive('/app/smart-collections') ? 'page' : undefined} className={`mobile-more-item ${isActive('/app/smart-collections') ? 'is-active' : ''}`}><SidebarIcon name="folder-2" /><span>Smart collections</span></Link>
        <Link to="/how-to-use" onClick={() => setMoreOpen(false)} className="mobile-more-item"><SidebarIcon name="book-open" /><span>How to use</span></Link>
      </div>
      {[
        { path: '/app', label: 'Library', icon: <SidebarIcon name="book-saved" />, exact: true },
        { path: '/app/graph', label: 'Connections', icon: <SidebarIcon name="hierarchy-2" /> },
        { path: '/app/add', label: 'Add', icon: <SidebarIcon name="document-upload" />, add: true },
      ].map((item) => <Link key={item.path} to={item.path} aria-current={isActive(item.path, item.exact) ? 'page' : undefined} className={`mobile-bottom-navigation-button ${isActive(item.path, item.exact) ? 'is-active' : ''} ${item.add ? 'is-add' : ''}`}>{item.icon}<span>{item.label}</span></Link>)}
      <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-controls="rembr-mobile-more" className={`mobile-bottom-navigation-button ${activeMoreLink || moreOpen ? 'is-active' : ''}`}><SidebarIcon name="more" /><span>More</span></button>
    </nav>
  </>;
}
function SetupRoute() {
  const { session, loading, refresh } = useSession(); const location = useLocation(); const navigate = useNavigate();
  const returnTo = sameAppPath((location.state as { returnTo?: string } | null)?.returnTo);
  if (loading) return <main className="center-state" role="status">Checking your session…</main>;
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (session.profileComplete) return <Navigate to={returnTo} replace />;
  return <main className="phase2-centered phase2-setup-shell"><section className="phase2-card phase2-setup-card"><Link className="wordmark" to="/" aria-label="Rembr home"><img className="rembr-official-logo auth-brand-logo" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" /></Link><ProfileForm session={session} onComplete={async () => { await refresh(); navigate(returnTo, { replace: true }); }} /></section></main>;
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






































export function App() { return <><AppRoutes /><GlobalButtonTooltips /></>; }
