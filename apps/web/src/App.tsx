import type { ApiError, Profile, SavedItem, Session } from './app/contracts.js';
import { api, apiWithProgress } from './app/api.js';
import { messageOf, sameAppPath } from './app/helpers.js';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Brain, ChevronRight, FileCheck2, FileText, Link2, Network, Plus, Upload, X } from 'lucide-react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AvatarUpload } from './components/AvatarUpload.js';
import { RembrAuthFrame } from './features/auth/RembrAuthFrame.js';
import { RembrWorkspaceTour } from './features/workspace/RembrWorkspaceTour.js';
import { AppShellSkeleton } from './components/ui/LoadingStates.jsx';
import { GlobalButtonTooltips } from './components/ui/GlobalButtonTooltips.js';
import { LibraryPage, KnowledgeGraphPage } from './features/library/pages.js';
import { AddPage, ImportsPage, ImportDetailPage } from './features/imports/pages.js';
import { ItemDetailPage, ItemEditPage, NoteEditorPage } from './features/items/pages.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { DeveloperAccessPage } from './features/settings/DeveloperAccessPage.js';
import { McpAccessPage } from './features/settings/McpAccessPage.js';
import { IntegrationsPage } from './features/integrations/IntegrationsPage.js';
import { WorkOSMcpConsentPage } from './features/auth/WorkOSMcpConsentPage.js';
import { DemoWorkspacePage } from './features/demo/DemoWorkspacePage.js';
import { MemoryRecallPage } from './features/knowledge/MemoryRecallPage.js';

const MarketingSite = lazy(() => import('./MarketingSite.js').then(({ MarketingSite: page }) => ({ default: page })));
const PortedLanding = lazy(() => import('./features/marketing/PortedLanding.js').then(({ PortedLanding: page }) => ({ default: page })));
const HowToUsePage = lazy(() => import('./features/marketing/PublicPages.js').then(({ PortedHowToPage: page }) => ({ default: page })));
const HelpPage = lazy(() => import('./features/marketing/PublicPages.js').then(({ PortedHelpPage: page }) => ({ default: page })));
const PricingPage = lazy(() => import('./features/marketing/PublicPages.js').then(({ PortedPricingPage: page }) => ({ default: page })));
const LegalPage = lazy(() => import('./features/marketing/PublicPages.js').then(({ PortedLegalPage: page }) => ({ default: page })));
const PasswordStrengthField = lazy(() => import('./components/PasswordStrengthField.js').then(({ PasswordStrengthField: field }) => ({ default: field })));
const SmartCollectionsPage = lazy(() => import('./components/SmartCollectionsPage.js').then(({ SmartCollectionsPage: page }) => ({ default: page })));
const externalIntegrationsEnabled = import.meta.env.VITE_EXTERNAL_INTEGRATIONS_ENABLED === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_EXTERNAL_INTEGRATIONS_ENABLED !== 'false');




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
    <Route path="/demo" element={<DemoWorkspacePage />} />
    {externalIntegrationsEnabled && <Route path="/auth/workos/mcp" element={<WorkOSMcpConsentPage />} />}
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
      <Route path="checkup" element={<Navigate to="/app" replace />} />
      <Route path="remember" element={<MemoryRecallPage />} />
      <Route path="settings/profile" element={<SettingsPage />} />
      <Route path="settings/preferences" element={<SettingsPage />} />
      <Route path="settings/advanced" element={<Navigate to="/app/graph" replace />} />
      {externalIntegrationsEnabled && <Route path="settings/developer-access" element={<DeveloperAccessPage />} />}
      {externalIntegrationsEnabled && <Route path="integrations" element={<IntegrationsPage />} />}
      {externalIntegrationsEnabled && <Route path="settings/mcp-access" element={<McpAccessPage />} />}
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense></BrowserRouter>;
}

function NotFoundPage() {
  return <main className="rg-page"><div className="rg-main"><section className="rg-intro"><p className="rg-kicker">404 / NOT FOUND</p><h1>This page is not here.</h1><p>Check the address or return to your Rembr library.</p><div className="rg-not-found-actions"><Link className="rg-button rg-button-primary" to="/">Go to Rembr home</Link><Link className="rg-button rg-button-secondary" to="/app" target="_blank" rel="noopener noreferrer">Open your library</Link></div></section></div></main>;
}

function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>(() => new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoPromptOpen, setDemoPromptOpen] = useState(() => new URLSearchParams(location.search).get('demo') === '1');
  const returnTo = sameAppPath(new URLSearchParams(location.search).get('returnTo'));

  useEffect(() => {
    let active = true;
    void api<Session>('/api/auth/session').then((session) => {
      if (active) navigate(session.profileComplete ? returnTo : '/app/setup/profile', { replace: true, state: { returnTo } });
    }).catch((cause) => {
      if (active && (cause as ApiError).status !== 401) setError(messageOf(cause, 'Could not verify your current session.'));
    });
    return () => { active = false; };
  }, [navigate, returnTo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify({ email, password, rememberMe, ...(mode === 'register' ? { acceptedTerms: termsAccepted } : {}) }) });
      const session = await api<Session>('/api/auth/session');
      navigate(session.profileComplete ? returnTo : '/app/setup/profile', { replace: true, state: { returnTo } });
    } catch (cause) { setError(messageOf(cause, 'Sign in failed. Try again.')); }
    finally { setBusy(false); }
  }

  return <><RembrAuthFrame title="Keep what you find. Find it again." description="Save a public page with its source and a readable copy." sideNote="Made for the long read">
    <div className="auth-card-heading"><h2 id="auth-form-title">{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2></div>
      <div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setPassword(''); setTermsAccepted(false); setPasswordRevealed(false); setError(''); }}>Sign in</button><button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setPassword(''); setPasswordRevealed(false); setError(''); }}>Create account</button></div>
      <form className="stack-form" onSubmit={(event) => void submit(event)}><label htmlFor="email">Email address</label><input id="email" autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />{mode === 'register' ? <PasswordStrengthField id="password" value={password} onValueChange={setPassword} disabled={busy} /> : <><label htmlFor="password">Password</label><div className="password-input-wrap"><input id="password" name="password" autoComplete="current-password" type={passwordRevealed ? 'text' : 'password'} required minLength={1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="password-reveal" aria-label={passwordRevealed ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={passwordRevealed} onClick={() => setPasswordRevealed((current) => !current)}>{passwordRevealed ? 'Hide' : 'Show'}</button></div></>}{mode === 'register' && <label className="auth-terms"><input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.currentTarget.checked)} /><span className="auth-terms-icon"><FileCheck2 size={17} aria-hidden="true" /></span><span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>, including the AI processing described there.</span></label>}<label className="auth-remember"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.currentTarget.checked)} /><span>Keep me signed in on this browser for 30 days</span></label>{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy || (mode === 'register' && !termsAccepted)}>{busy ? (mode === 'register' ? 'Creating account…' : 'Signing in…') : mode === 'register' ? 'Create your library' : 'Sign in to Rembr'}</button></form>
      <p className="privacy-note"><span>✳</span>Your library is private to your account. Rembr can save public pages.</p>
  </RembrAuthFrame>{demoPromptOpen && <div className="demo-choice-backdrop"><section className="demo-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-choice-title"><p className="demo-choice-kicker">A faster way to explore</p><h2 id="demo-choice-title">Take a look around first.</h2><p>Either log in or sign up with your own account and export your Instagram saves. Importing them takes a little time. Or enter the shared demo workspace now. Changes, imports, and profile edits in the demo are visible to other visitors.</p><Link className="demo-choice-primary" to="/demo" onClick={() => setDemoPromptOpen(false)}>Enter the demo workspace <ArrowRight size={18} aria-hidden="true" /></Link><button className="demo-choice-account" type="button" onClick={() => setDemoPromptOpen(false)}>Log in or sign up with my own account</button><button className="demo-choice-close" type="button" aria-label="Close demo introduction" onClick={() => setDemoPromptOpen(false)}>×</button></section></div>}</>;
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
  const explicitTourOpen = new URLSearchParams(location.search).get('tour') === '1';
  const [firstRunTourOpen, setFirstRunTourOpen] = useState(false);
  const navigateForTour = useCallback((path: string) => {
    const destination = new URL(path, window.location.origin);
    destination.searchParams.set('tour', '1');
    navigate({ pathname: destination.pathname, search: destination.search, hash: destination.hash });
  }, [navigate]);
  const [accountDenied, setAccountDenied] = useState(false);
  const detailReturnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const detailReturnPath = detailReturnTo?.split(/[?#]/, 1)[0] ?? '';
  const detailBackground = /^\/app\/items\/[^/]+$/.test(location.pathname)
    ? detailReturnPath === '/app/graph' ? <KnowledgeGraphPage /> : <LibraryPage />
    : null;
  const hasDetailBackground = Boolean(detailBackground);
  const isFullScreenSettings = location.pathname === '/app/settings/profile' || location.pathname === '/app/settings/preferences' || location.pathname === '/app/settings/advanced';
  const isSensitiveAccess = location.pathname === '/app/settings/developer-access' || location.pathname === '/app/integrations' || location.pathname === '/app/settings/mcp-access';

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || explicitTourOpen) return;
    const seenKey = `rembr:workspace-tour:v1:${userId}`;
    try {
      if (!window.localStorage.getItem(seenKey)) {
        window.localStorage.setItem(seenKey, 'seen');
        setFirstRunTourOpen(true);
      }
    } catch {
      setFirstRunTourOpen(true);
    }
  }, [explicitTourOpen, session?.user.id]);

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
  if (!session) return <Navigate to={`/login?demo=1&returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (!session.profileComplete && !location.pathname.startsWith('/app/setup/')) return <Navigate to="/app/setup/profile" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  const tourOpen = explicitTourOpen || firstRunTourOpen;
  return <div className="dashboard-shell flex h-screen overflow-hidden bg-black text-foreground">
    <div className="rembr-tour-underlay" aria-hidden={tourOpen} inert={tourOpen}>
      <AppNav session={session} onLogout={async () => { await api('/api/auth/logout', { method: 'POST' }); setSession(null); navigate('/login', { replace: true }); }} />
      <main className="rembr-dashboard-main min-w-0 flex-1 overflow-y-auto">
        {detailBackground && <div className="rembr-detail-underlay" aria-hidden="true" inert><div className="phase2-main">{detailBackground}</div></div>}
        <div className={hasDetailBackground ? 'rembr-detail-route' : isFullScreenSettings ? 'rembr-settings-route' : isSensitiveAccess ? 'rembr-sensitive-route' : undefined}><div className={`phase2-main ${isFullScreenSettings ? 'phase2-main-settings' : isSensitiveAccess ? 'phase2-main-sensitive' : ''}`}><AppBreadcrumbs /><Outlet context={{ session, setSession }} /></div></div>
      </main>
      {!hasDetailBackground && <QuickAddDock />}
    </div>
    {tourOpen && <RembrWorkspaceTour open onClose={() => {
      setFirstRunTourOpen(false);
      const query = new URLSearchParams(location.search);
      query.delete('tour');
      navigate({ pathname: location.pathname, search: query.size ? `?${query.toString()}` : '' }, { replace: true });
    }} onNavigate={navigateForTour} />}
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
    <button className="quick-add-trigger" data-rembr-tour-target="quick-add" type="button" aria-label="Quick add to your library" aria-expanded={open} onClick={() => { setOpen(true); setView('menu'); }}><Plus aria-hidden="true" /></button>
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

function SidebarMenuIcon() {
  return <svg className="sidebar-menu-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}

function AppBreadcrumbs() {
  const { pathname } = useLocation();
  const itemId = pathname.match(/^\/app\/items\/([^/]+)/)?.[1];
  let parents: Array<{ label: string; to: string }> = [];
  let current = 'Home';

  if (pathname === '/app/add') current = 'Add saves';
  else if (pathname === '/app/imports') current = 'Imports';
  else if (pathname.startsWith('/app/imports/')) { parents = [{ label: 'Imports', to: '/app/imports' }]; current = 'Import details'; }
  else if (pathname === '/app/smart-collections') current = 'Smart collections';
  else if (pathname.startsWith('/app/smart-collections/')) { parents = [{ label: 'Smart collections', to: '/app/smart-collections' }]; current = 'Collection'; }
  else if (pathname === '/app/graph') current = 'Knowledge graph';
  else if (pathname === '/app/remember') current = 'Remember';
  else if (pathname === '/app/integrations') current = 'Integrations';
  else if (pathname === '/app/notes/new') current = 'New note';
  else if (pathname.startsWith('/app/notes/')) { parents = [{ label: 'Saved note', to: pathname.replace(/\/edit$/, '') }]; current = 'Edit'; }
  else if (pathname.startsWith('/app/settings/')) {
    parents = [{ label: 'Settings', to: '/app/settings/profile' }];
    current = pathname.endsWith('/mcp-access') ? 'MCP access'
      : pathname.endsWith('/developer-access') ? 'API keys'
        : pathname.endsWith('/preferences') ? 'Preferences' : 'Profile';
  } else if (itemId && pathname.endsWith('/edit')) {
    parents = [{ label: 'Saved item', to: `/app/items/${itemId}` }]; current = 'Edit';
  } else if (itemId) current = 'Saved item';
  else if (pathname === '/how-to-use') current = 'How to use';

  return <nav className="app-breadcrumbs" aria-label="Breadcrumb">
    {current === 'Home' ? <span aria-current="page">Home</span> : <Link to="/app">Home</Link>}
    {parents.map((parent) => <span className="app-breadcrumb-part" key={parent.to}><ChevronRight size={13} aria-hidden="true" /><Link to={parent.to}>{parent.label}</Link></span>)}
    {current !== 'Home' && <span className="app-breadcrumb-part" aria-current="page"><ChevronRight size={13} aria-hidden="true" /><span>{current}</span></span>}
  </nav>;
}

function AppNav({ session, onLogout }: { session: Session; onLogout: () => Promise<void> }) {
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const sidebarExpanded = expanded;
  const navItems = [
    { path: '/app', label: 'Home', icon: <SidebarIcon name="book-saved" />, exact: true },
    { path: '/app/smart-collections', label: 'Smart collections', icon: <SidebarIcon name="folder-2" /> },
    { path: '/app/remember', label: 'Remember', icon: <Brain size={18} aria-hidden="true" /> },
    ...(externalIntegrationsEnabled ? [{ path: '/app/integrations', label: 'Integrations', icon: <Network size={18} aria-hidden="true" /> }] : []),
    { path: '/app/add', label: 'Add saves', icon: <SidebarIcon name="document-upload" /> },
  ];
  const mobileMoreActive = location.pathname.startsWith('/app/smart-collections') || (externalIntegrationsEnabled && location.pathname === '/app/integrations') || location.pathname === '/how-to-use';
  const accountLabel = session.profile?.username ? `@${session.profile.username}` : session.user.email;
  const avatar = session.profile?.avatarAssetUrl ?? session.profile?.avatarUrl;
  const userMark = session.profile?.username?.slice(0, 1) ?? session.user.email.slice(0, 1);
  const isActive = (path: string, exact = false) => exact ? location.pathname === path : location.pathname.startsWith(path);
  const handleLogout = () => { setLogoutBusy(true); void onLogout().finally(() => setLogoutBusy(false)); };
  return <>
    <aside className={`iscraper-sidebar hidden h-screen shrink-0 flex-col overflow-hidden border-r border-white/5 bg-black transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex ${sidebarExpanded ? 'is-expanded w-60' : 'w-[76px]'}`}
      aria-label="Workspace navigation">
      <div className={`flex border-b border-white/5 p-3 ${sidebarExpanded ? 'items-center gap-2' : 'flex-col items-center gap-2'}`}>
        <Link to="/app" aria-label="Back to your Rembr library" className={`flex min-h-11 items-center rounded-lg transition hover:bg-white/5 ${sidebarExpanded ? 'min-w-0 flex-1 gap-3 px-2' : 'h-11 w-11 justify-center'}`}>
          <SidebarIcon name="arrow-left-02" />{sidebarExpanded && <img className="rembr-official-logo app-nav-brand" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" />}
        </Link>
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={expanded} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-primary">
          <SidebarMenuIcon />
        </button>
      </div>
      <Link to="/app/settings/profile" aria-label={`Signed in as ${accountLabel}`} className={`flex items-center border-b border-white/5 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground ${sidebarExpanded ? 'gap-3 px-5 py-3' : 'justify-center px-3 py-3'}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-primary text-sm font-bold text-primary-foreground">{avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : userMark.toUpperCase()}</span>
        {sidebarExpanded && <span className="min-w-0"><span className="block">Signed in as</span><span className="block truncate font-semibold text-foreground">{accountLabel}</span></span>}
      </Link>
      <nav className={`flex-1 space-y-1 p-3 ${sidebarExpanded ? '' : 'flex flex-col items-center'}`} aria-label="Main navigation">
        {navItems.map((item) => <Link key={item.path} to={item.path} data-rembr-tour-target={item.path === '/app/add' ? 'add-saves-nav' : item.path === '/app/smart-collections' ? 'smart-collections-nav' : undefined} aria-label={item.label} aria-current={isActive(item.path, item.exact) ? 'page' : undefined}
          className={`flex items-center rounded-lg text-sm transition ${isActive(item.path, item.exact) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'} ${sidebarExpanded ? 'gap-3 px-3 py-2.5' : 'h-11 w-11 justify-center'}`}>
          {item.icon}{sidebarExpanded && <span className="truncate">{item.label}</span>}
        </Link>)}
      </nav>
      <div className="flex flex-col gap-2 border-t border-white/5 p-3">
        <Link to="/help" className={`flex h-11 items-center rounded-lg text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground ${sidebarExpanded ? 'gap-3 px-3' : 'w-11 justify-center'}`} aria-label="Help and tour"><SidebarIcon name="book-open" />{sidebarExpanded && <span>Help &amp; tour</span>}</Link>
        <div className={`flex gap-2 ${sidebarExpanded ? 'flex-row' : 'flex-col items-center'}`}>
          <Link to="/app/settings/profile" className={`flex h-11 shrink-0 items-center rounded-lg text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground ${sidebarExpanded ? 'flex-1 gap-3 px-3' : 'w-11 justify-center'}`} aria-label="Settings"><SidebarIcon name="setting-2" />{sidebarExpanded && <span>Settings</span>}</Link>
          <button type="button" className="danger-button grid h-11 w-11 shrink-0 place-items-center rounded-lg transition" aria-label="Sign out" disabled={logoutBusy} onClick={handleLogout}><SidebarIcon name="logout-01" /></button>
        </div>
      </div>
    </aside>
    <header className="mobile-app-topbar sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-black/90 p-3 backdrop-blur md:hidden">
      <Link to="/app" aria-label="Rembr library" className="flex min-h-11 min-w-11 items-center gap-2"><SidebarIcon name="arrow-left-02" /><img className="rembr-official-logo app-nav-brand" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" /></Link>
      <Link to="/app/settings/profile" className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-white/10 bg-primary text-sm font-bold text-primary-foreground" aria-label="Open account settings">{avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : userMark.toUpperCase()}</Link>
    </header>
    {moreOpen && <button type="button" className="mobile-navigation-backdrop md:hidden" onClick={() => setMoreOpen(false)} aria-label="Close more navigation" />}
    <nav className="mobile-bottom-navigation md:hidden" aria-label="Main navigation" onKeyDown={(event) => { if (event.key === 'Escape') setMoreOpen(false); }}>
      <div id="rembr-mobile-more" className="mobile-more-panel" role="group" aria-label="More sections" hidden={!moreOpen}>
        <Link to="/app/smart-collections" data-rembr-tour-target="smart-collections-nav" onClick={() => setMoreOpen(false)} aria-current={isActive('/app/smart-collections') ? 'page' : undefined} className={`mobile-more-item ${isActive('/app/smart-collections') ? 'is-active' : ''}`}><SidebarIcon name="folder-2" /><span>Smart collections</span></Link>
        {externalIntegrationsEnabled && <Link to="/app/integrations" onClick={() => setMoreOpen(false)} aria-current={isActive('/app/integrations') ? 'page' : undefined} className={`mobile-more-item ${isActive('/app/integrations') ? 'is-active' : ''}`}><Network size={17} aria-hidden="true" /><span>Integrations</span></Link>}
        <Link to="/help" onClick={() => setMoreOpen(false)} className="mobile-more-item"><SidebarIcon name="book-open" /><span>Help &amp; tour</span></Link>
      </div>
      {[
        { path: '/app', label: 'Library', icon: <SidebarIcon name="book-saved" />, exact: true },
        { path: '/app/add', label: 'Add', icon: <SidebarIcon name="document-upload" />, add: true },
      ].map((item) => <Link key={item.path} to={item.path} data-rembr-tour-target={item.path === '/app/add' ? 'add-saves-nav' : undefined} aria-current={isActive(item.path, item.exact) ? 'page' : undefined} className={`mobile-bottom-navigation-button ${isActive(item.path, item.exact) ? 'is-active' : ''} ${item.add ? 'is-add' : ''}`}>{item.icon}<span>{item.label}</span></Link>)}
      <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-controls="rembr-mobile-more" className={`mobile-bottom-navigation-button ${mobileMoreActive || moreOpen ? 'is-active' : ''}`}><SidebarIcon name="more" /><span>More</span></button>
    </nav>
  </>;
}
function SetupRoute() {
  const { session, loading, refresh } = useSession(); const location = useLocation(); const navigate = useNavigate();
  const returnTo = sameAppPath((location.state as { returnTo?: string } | null)?.returnTo);
  if (loading) return <main className="center-state" role="status">Checking your session…</main>;
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (session.profileComplete) return <Navigate to={returnTo} replace />;
  return <main className="phase2-centered phase2-setup-shell"><section className="phase2-card phase2-setup-card"><Link className="wordmark" to="/app" aria-label="Rembr app home"><img className="rembr-official-logo auth-brand-logo" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" /></Link><ProfileForm session={session} onComplete={async () => { await refresh(); navigate(returnTo, { replace: true }); }} /></section></main>;
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
