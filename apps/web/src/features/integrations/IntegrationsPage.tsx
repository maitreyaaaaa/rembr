import { useState } from 'react';
import { Check, Copy, ExternalLink, LockKeyhole, Network, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../app/RouteStates.js';
import posthog from '../../posthog.js';

type ClientName = 'Claude' | 'ChatGPT';

export function IntegrationsPage() {
  const endpoint = `${window.location.origin}/mcp`;
  const [copied, setCopied] = useState(false);
  const [copiedFor, setCopiedFor] = useState<ClientName | null>(null);
  const [copyError, setCopyError] = useState(false);

  async function copyServerAddress(client?: ClientName) {
    if (client) posthog.capture('integration_setup_started', { client: client.toLowerCase() });
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      setCopiedFor(client ?? null);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopiedFor(null);
      setCopyError(true);
    }
  }

  return <>
    <PageHeader title="Integrations" description="Connect an AI assistant to your Rembr library." />
    <div className="mcp-access-page integrations-page">
      <section className="mcp-access-hero integrations-hero" aria-labelledby="integrations-title">
        <div className="mcp-access-hero-copy">
          <p className="rg-kicker">REM BR / INTEGRATIONS</p>
          <h2 id="integrations-title">Your saves, where you think.</h2>
          <p>Choose Claude or ChatGPT to search your saved links, read notes, and browse collections from a conversation.</p>
          <div className="mcp-access-assurances">
            <span><LockKeyhole size={15} aria-hidden="true" /> You approve each connection</span>
            <span><ShieldCheck size={15} aria-hidden="true" /> Read access by default</span>
          </div>
        </div>
        <div className="mcp-access-mark" aria-hidden="true"><Network size={34} strokeWidth={1.5} /><span>REM BR</span><i /></div>
      </section>

      <section className="phase2-panel integrations-panel" aria-labelledby="connect-client-title">
        <div className="mcp-section-heading">
          <div><p className="mcp-step-label">CONNECT A CLIENT</p><h2 id="connect-client-title">Choose your assistant</h2></div>
        </div>
        <div className="mcp-client-grid integrations-client-grid">
          <article className="mcp-client-card integrations-client-card">
            <div className="integration-client-heading"><span className="integration-client-mark" aria-hidden="true">C</span><div><h3>Claude</h3><p>Claude web and Claude Desktop</p></div></div>
            <p>Open Claude and add a custom connector using the Rembr server address. When you connect, Claude opens Rembr so you can sign in and choose its access.</p>
            <ol className="integration-steps">
              <li>In Claude, open <strong>Settings → Connectors → Add custom connector</strong>.</li>
              <li>Paste the copied URL, choose <strong>Add</strong>, then select <strong>Connect</strong>.</li>
              <li>Sign in to Rembr and approve read-only or read + save access.</li>
            </ol>
            <a className="primary-button integration-connect-button" href="https://claude.ai/" target="_blank" rel="noreferrer" onClick={() => void copyServerAddress('Claude')}>
              Connect Claude <ExternalLink size={14} aria-hidden="true" />
            </a>
            <p className="mcp-client-note">Available on Claude Pro, Max, Team, and Enterprise. Manage or disconnect Rembr in Claude’s connector settings.</p>
            <a className="mcp-doc-link" href="https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp" target="_blank" rel="noreferrer">Claude connector help <ExternalLink size={13} aria-hidden="true" /></a>
          </article>

          <article className="mcp-client-card integrations-client-card">
            <div className="integration-client-heading"><span className="integration-client-mark integration-client-mark-chatgpt" aria-hidden="true">G</span><div><h3>ChatGPT</h3><p>ChatGPT web</p></div></div>
            <p>Add Rembr as a custom MCP server in ChatGPT. It will discover Rembr’s tools and start OAuth when you connect.</p>
            <ol className="integration-steps">
              <li>Open ChatGPT’s <strong>Plugins</strong> page and choose <strong>+ → Add custom MCP server</strong>.</li>
              <li>Paste the copied URL, choose OAuth, then review the tools and permissions.</li>
              <li>Sign in to Rembr and approve read-only or read + save access.</li>
            </ol>
            <a className="primary-button integration-connect-button" href="https://chatgpt.com/" target="_blank" rel="noreferrer" onClick={() => void copyServerAddress('ChatGPT')}>
              Connect ChatGPT <ExternalLink size={14} aria-hidden="true" />
            </a>
            <p className="mcp-client-note">Custom MCP is unavailable on Plus. Pro supports read/fetch access; Business, Enterprise, and Edu support full MCP subject to workspace permissions.</p>
            <a className="mcp-doc-link" href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt" target="_blank" rel="noreferrer">ChatGPT connection help <ExternalLink size={13} aria-hidden="true" /></a>
          </article>
        </div>
        <p className="field-note" role={copiedFor || copyError ? 'status' : undefined}>
          {copyError ? 'The URL could not be copied automatically. Select the server address below and copy it into the client.'
              : copiedFor ? `Rembr URL copied. Paste it in ${copiedFor} to continue; you are not connected until you approve access in Rembr.`
                : copied ? 'Rembr URL copied. Paste it into a supported client, then approve access in Rembr.'
              : 'Each client has its own OAuth connection. Rembr only shares Rembr library tools; Gmail, Notion, and other services are not connected here.'}
        </p>
        <div className="integrations-endpoint-row">
          <span>Rembr server address</span>
          <code>{endpoint}</code>
          <button className="secondary-button" type="button" onClick={() => void copyServerAddress()} aria-label={copied ? 'Rembr server address copied' : 'Copy Rembr server address'}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? 'Copied' : 'Copy URL'}</button>
        </div>
      </section>

      <section className="phase2-panel integrations-security-panel" aria-labelledby="integration-approval-title">
        <div className="mcp-section-heading"><div><p className="mcp-step-label">ACCESS CONTROL</p><h2 id="integration-approval-title">You stay in control.</h2></div></div>
        <div className="mcp-permission-grid">
          <article className="mcp-permission-card"><span className="mcp-permission-icon"><LockKeyhole size={18} aria-hidden="true" /></span><div><h3>Read only first</h3><p>Search saved items, open a page or note, and browse your collections.</p></div><span className="mcp-permission-tag">Default</span></article>
          <article className="mcp-permission-card"><span className="mcp-permission-icon is-write"><Check size={18} aria-hidden="true" /></span><div><h3>Saving is optional</h3><p>You can separately approve the ability to save public links to Rembr.</p></div><span className="mcp-permission-tag is-optional">Optional</span></article>
        </div>
        <p className="field-note">Rembr asks you to approve the access level before it issues a connection. To disconnect later, remove Rembr from the client’s connector settings.</p>
      </section>
    </div>
  </>;
}
