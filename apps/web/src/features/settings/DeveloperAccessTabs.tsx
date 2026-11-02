import { Link, useLocation } from 'react-router-dom';

export function DeveloperAccessTabs() {
  const { pathname } = useLocation();
  const isMcp = pathname.endsWith('/mcp-access');
  return <nav className="phase2-tab-links" aria-label="Developer access">
    <Link className={!isMcp ? 'active' : ''} aria-current={!isMcp ? 'page' : undefined} to="/app/settings/developer-access">API keys</Link>
    <Link className={isMcp ? 'active' : ''} aria-current={isMcp ? 'page' : undefined} to="/app/settings/mcp-access">MCP access</Link>
  </nav>;
}
