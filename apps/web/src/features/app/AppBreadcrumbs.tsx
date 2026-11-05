import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function AppBreadcrumbs() {
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

