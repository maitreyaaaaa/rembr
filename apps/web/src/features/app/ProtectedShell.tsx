import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppShellSkeleton } from '../../components/ui/LoadingStates.jsx';
import { RembrWorkspaceTour } from '../workspace/RembrWorkspaceTour.js';
import { LibraryPage } from '../library/pages.js';
import { KnowledgeGraphPage } from '../knowledge/KnowledgeGraphPage.js';
import { useSession } from '../auth/useSession.js';
import { AppBreadcrumbs } from './AppBreadcrumbs.js';
import { AppNav } from './AppNavigation.js';
import { QuickAddDock } from './QuickAddDock.js';

export function ProtectedShell() {
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
  if (!session.termsCurrent) return <TermsAcceptanceGate onAccepted={() => void refresh()} />;
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

function TermsAcceptanceGate({ onAccepted }: { onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function accept() {
    setBusy(true); setError('');
    try {
      await api('/api/auth/accept-terms', { method: 'POST', body: JSON.stringify({ acceptedTerms: true }) });
      onAccepted();
    } catch (cause) { setError(messageOf(cause, 'Could not save your Terms acceptance.')); }
    finally { setBusy(false); }
  }
  return <main className="phase2-centered"><section className="phase2-card" aria-labelledby="terms-update-title">
    <p className="phase2-eyebrow">TERMS UPDATED</p>
    <h1 id="terms-update-title">Please review the updated Terms.</h1>
    <p>Rembr’s Terms include AI processing used by Instagram media analysis, library answers, image search, and meaning-based search. Depending on the feature, this may send saved text, public Instagram media, a selected image, or your question to Meta AI or OpenRouter.</p>
    <p>Accepting the Terms enables these AI features. You can turn individual features off at any time.</p>
    <p><a className="phase2-text-button" href="/terms" target="_blank" rel="noopener noreferrer">Read the full Terms and Conditions</a></p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <button className="primary-button" type="button" disabled={busy} onClick={() => void accept()}>{busy ? 'Saving…' : 'Accept updated Terms and continue'}</button>
  </section></main>;
}

