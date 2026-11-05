import type { Session } from '../../app/contracts.js';
import { useState } from 'react';
import { Brain, Network } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { externalIntegrationsEnabled } from './feature-flags.js';

function SidebarIcon({ name }: { name: string }) {
  return <img className="rembr-sidebar-icon" src={`/iconsax/${name}.svg`} alt="" aria-hidden="true" draggable={false} />;
}

function SidebarMenuIcon() {
  return <svg className="sidebar-menu-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}

export function AppNav({ session, onLogout }: { session: Session; onLogout: () => Promise<void> }) {
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

