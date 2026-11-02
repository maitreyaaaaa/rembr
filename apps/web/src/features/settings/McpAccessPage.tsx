import { useState } from 'react';
import { Check, Copy, ExternalLink, LockKeyhole, Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../app/RouteStates.js';
import { DeveloperAccessTabs } from './DeveloperAccessTabs.js';

export function McpAccessPage() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const endpoint = `${window.location.origin}/mcp`;

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return <>
    <PageHeader title="Developer access" description="Connect your library to an MCP client or use a scoped API key." actions={<DeveloperAccessTabs />} />
    <div className="mcp-access-page">
      <section className="mcp-access-hero" aria-labelledby="mcp-access-title">
        <div className="mcp-access-hero-copy">
          <p className="rg-kicker">REM BR / CONNECT</p>
          <h2 id="mcp-access-title">Your library, where you work.</h2>
          <p>Give an MCP client a secure way to search your saved items and collections. Rembr uses WorkOS OAuth, so you sign in with your Rembr account and review access before connecting.</p>
          <div className="mcp-access-assurances"><span><LockKeyhole size={15} aria-hidden="true" /> You approve each connection</span><span><Check size={15} aria-hidden="true" /> Access can be read-only</span></div>
        </div>
        <div className="mcp-access-mark" aria-hidden="true"><Server size={34} strokeWidth={1.5} /><span>REM BR</span><i /></div>
      </section>

      <section className="phase2-panel mcp-endpoint-panel" aria-labelledby="mcp-endpoint-title">
        <div className="mcp-section-heading"><div><p className="mcp-step-label">01 / SERVER ADDRESS</p><h2 id="mcp-endpoint-title">MCP server URL</h2></div><span className="mcp-connection-status"><i /> Remote server</span></div>
        <p className="phase2-helper">Paste this URL into the MCP server field in your client. Sign-in and token management are handled through WorkOS when the client connects.</p>
        <div className="mcp-endpoint-copy"><code>{endpoint}</code><button className="secondary-button" type="button" onClick={() => void copyEndpoint()} aria-label={copied ? 'MCP server URL copied' : 'Copy MCP server URL'}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? 'Copied' : 'Copy URL'}</button></div>
        <p className="field-note" role={copied || copyError ? 'status' : undefined}>{copyError ? 'Copy was blocked by your browser. Select the server URL and copy it manually.' : copied ? 'Server URL copied.' : 'Use OAuth in your client. No Rembr API key is needed for MCP access.'}</p>
      </section>

      <section className="phase2-panel mcp-permissions-panel" aria-labelledby="mcp-permissions-title">
        <div className="mcp-section-heading"><div><p className="mcp-step-label">02 / PERMISSIONS</p><h2 id="mcp-permissions-title">You choose what it can do.</h2></div></div>
        <div className="mcp-permission-grid">
          <article className="mcp-permission-card"><span className="mcp-permission-icon"><LockKeyhole size={18} aria-hidden="true" /></span><div><h3>Read library</h3><p>Search saved items, open item details, and browse your collections.</p></div><span className="mcp-permission-tag">Read only</span></article>
          <article className="mcp-permission-card"><span className="mcp-permission-icon is-write"><Check size={18} aria-hidden="true" /></span><div><h3>Read + save links</h3><p>Everything in read access, plus the ability to save a public link to Rembr.</p></div><span className="mcp-permission-tag is-optional">Optional</span></article>
        </div>
        <p className="field-note">Choose an access level on Rembr’s review screen. WorkOS then asks you to confirm before issuing access. The client receives only the permission you selected.</p>
      </section>

      <section className="phase2-panel mcp-setup-panel" aria-labelledby="mcp-setup-title">
        <div className="mcp-section-heading"><div><p className="mcp-step-label">03 / SETUP</p><h2 id="mcp-setup-title">Connect an MCP client</h2></div></div>
        <ol className="mcp-setup-steps">
          <li><span>1</span><div><strong>Add a remote MCP server</strong><p>Open your client’s MCP or integrations settings and add a server.</p></div></li>
          <li><span>2</span><div><strong>Paste the Rembr URL</strong><p>Use the server URL above and select OAuth when prompted.</p></div></li>
          <li><span>3</span><div><strong>Sign in and approve</strong><p>Review the selected permissions in Rembr, then confirm with WorkOS.</p></div></li>
        </ol>
        <a className="mcp-doc-link" href="https://modelcontextprotocol.io/docs/develop/connect-remote-servers" target="_blank" rel="noreferrer">About remote MCP servers <ExternalLink size={14} aria-hidden="true" /></a>
      </section>
      <p className="mcp-api-key-note">Need direct HTTP access from a script? <Link to="/app/settings/developer-access">Create a scoped API key <span aria-hidden="true">↗</span></Link></p>
    </div>
  </>;
}
