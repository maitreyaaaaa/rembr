import { useState, type ReactNode } from 'react';
import { Check, Cloud, Code2, Copy, ExternalLink, LockKeyhole, Server, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../app/RouteStates.js';
import { DeveloperAccessTabs } from './DeveloperAccessTabs.js';

type SetupTab = 'vscode' | 'cloud' | 'agents' | 'universal';

function CopyableConfig({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(false);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
      setError(true);
    }
  }
  return <>
    <div className="mcp-config-toolbar"><span>{label}</span><button className="secondary-button" type="button" onClick={() => void copy()} aria-label={copied ? `${label} copied` : `Copy ${label}`}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
    </button></div>
    <pre className="mcp-config-code"><code>{value}</code></pre>
    {error && <p className="field-note" role="alert">Copy was blocked. Select the configuration and copy it manually.</p>}
    {copied && <p className="visually-hidden" role="status">{label} copied.</p>}
  </>;
}

export function McpAccessPage() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [activeSetup, setActiveSetup] = useState<SetupTab>('vscode');
  const endpoint = `${window.location.origin}/mcp`;
  const vscodeConfig = JSON.stringify({ servers: { rembr: { type: 'http', url: endpoint } } }, null, 2);
  const portableConfig = JSON.stringify({ mcpServers: { rembr: { type: 'http', url: endpoint } } }, null, 2);
  const geminiCommand = `gemini mcp add --transport http --scope user rembr ${endpoint}`;
  const claudeCodeCommand = `claude mcp add --transport http --scope user rembr ${endpoint}`;
  const tabs: Array<{ id: SetupTab; label: string; icon: ReactNode }> = [
    { id: 'vscode', label: 'VS Code', icon: <Code2 size={14} aria-hidden="true" /> },
    { id: 'cloud', label: 'Cloud apps', icon: <Cloud size={14} aria-hidden="true" /> },
    { id: 'agents', label: 'Coding agents', icon: <Terminal size={14} aria-hidden="true" /> },
    { id: 'universal', label: 'Universal config', icon: <Server size={14} aria-hidden="true" /> },
  ];

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
          <h2 id="mcp-access-title">Your Rembr library in your AI tools.</h2>
          <p>Connect ChatGPT, Claude, Gemini CLI, VS Code, and compatible coding agents to search saved items, open pages and notes, and browse collections. Each client signs in with OAuth and gets only the access you approve.</p>
          <div className="mcp-access-assurances"><span><LockKeyhole size={15} aria-hidden="true" /> You approve each client</span><span><Check size={15} aria-hidden="true" /> Access can be read-only</span></div>
        </div>
        <div className="mcp-access-mark" aria-hidden="true"><Server size={34} strokeWidth={1.5} /><span>REM BR</span><i /></div>
      </section>

      <section className="phase2-panel mcp-endpoint-panel" aria-labelledby="mcp-endpoint-title">
        <div className="mcp-section-heading"><div><p className="mcp-step-label">01 / SERVER ADDRESS</p><h2 id="mcp-endpoint-title">Rembr MCP server</h2></div><span className="mcp-connection-status"><i /> Remote MCP</span></div>
        <p className="phase2-helper">Use this HTTPS address in your AI app or coding agent. Sign in to Rembr when prompted, then choose read-only or read + save. MCP access does not require an API key.</p>
        <div className="mcp-endpoint-copy"><code>{endpoint}</code><button className="secondary-button" type="button" onClick={() => void copyEndpoint()} aria-label={copied ? 'MCP server URL copied' : 'Copy MCP server URL'}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? 'Copied' : 'Copy URL'}</button></div>
        <p className="field-note" role={copied || copyError ? 'status' : undefined}>{copyError ? 'Copy was blocked by your browser. Select the server URL and copy it manually.' : copied ? 'Server URL copied.' : 'OAuth handles sign-in and access approval for each client.'}</p>
      </section>

      <section className="phase2-panel mcp-permissions-panel" aria-labelledby="mcp-permissions-title">
        <div className="mcp-section-heading"><div><p className="mcp-step-label">02 / PERMISSIONS</p><h2 id="mcp-permissions-title">You choose what it can do.</h2></div></div>
        <div className="mcp-permission-grid">
          <article className="mcp-permission-card"><span className="mcp-permission-icon"><LockKeyhole size={18} aria-hidden="true" /></span><div><h3>Read library</h3><p>Search saved items, open a saved page or note, and browse your collections.</p></div><span className="mcp-permission-tag">Read only</span></article>
          <article className="mcp-permission-card"><span className="mcp-permission-icon is-write"><Check size={18} aria-hidden="true" /></span><div><h3>Read + save links</h3><p>Everything in read access, plus capture a public URL you ask the AI tool to save in Rembr.</p></div><span className="mcp-permission-tag is-optional">Optional</span></article>
        </div>
        <p className="field-note">Each client gets its own connection grant. Rembr tools only access your Rembr library; they do not connect Gmail, Notion, or other services.</p>
      </section>

      <section className="phase2-panel mcp-setup-panel" aria-labelledby="mcp-setup-title">
        <div className="mcp-section-heading"><div><p className="mcp-step-label">03 / CLIENT SETUP</p><h2 id="mcp-setup-title">Choose your AI tool</h2></div></div>
        <div className="mcp-client-tabs" role="group" aria-label="MCP setup instructions">
          {tabs.map((tab) => <button key={tab.id} type="button" aria-pressed={activeSetup === tab.id} className={activeSetup === tab.id ? 'is-active' : ''} onClick={() => setActiveSetup(tab.id)}>{tab.icon}{tab.label}</button>)}
        </div>
        {activeSetup === 'vscode' && <div className="mcp-setup-panel-content" aria-live="polite">
          <h3>Connect from VS Code</h3>
          <p>Open your workspace’s <code>.vscode/mcp.json</code>, add the configuration below, then start or refresh the Rembr server from the MCP Servers view. VS Code will complete OAuth in your browser.</p>
          <CopyableConfig value={vscodeConfig} label="VS Code configuration" />
          <a className="mcp-doc-link" href="https://code.visualstudio.com/docs/agent-customization/mcp-servers" target="_blank" rel="noreferrer">VS Code MCP setup guide <ExternalLink size={14} aria-hidden="true" /></a>
        </div>}
        {activeSetup === 'cloud' && <div className="mcp-setup-panel-content" aria-live="polite">
          <div className="mcp-client-grid">
            <article className="mcp-client-card">
              <h3>ChatGPT</h3><p>Open ChatGPT, then in <strong>Plugins → + → Add custom MCP server</strong>, paste the Rembr URL, choose OAuth, and review the tools before connecting.</p>
              <p className="mcp-client-note">Plus does not support custom MCP. Pro supports read and fetch; Business, Enterprise, and Edu support full MCP, subject to workspace permissions.</p>
              <a className="mcp-doc-link" href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt" target="_blank" rel="noreferrer">ChatGPT connection guide <ExternalLink size={13} aria-hidden="true" /></a>
            </article>
            <article className="mcp-client-card">
              <h3>Claude</h3><p>Open Claude, then go to <strong>Settings → Connectors → Add custom connector</strong>. Paste the Rembr URL, choose Add, then Connect and approve the requested Rembr access.</p>
              <p className="mcp-client-note">Rembr Production supports both DCR and CIMD, and advertises refresh tokens. Sign in to Rembr and choose read-only or read + save. The final Claude sign-in has not yet been verified from your Claude account.</p>
              <a className="mcp-doc-link" href="https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp" target="_blank" rel="noreferrer">Claude connector guide <ExternalLink size={13} aria-hidden="true" /></a>
            </article>
            <article className="mcp-client-card"><h3>Gemini Apps</h3><p>In Gemini web, open <strong>Settings → Connected Apps → Custom apps → Add a custom app</strong>. Paste the Rembr server URL, continue, and follow the sign-in steps.</p><p className="mcp-client-note">Gemini custom apps vary by region and account. Rembr’s live OAuth provider advertises CIMD and refresh tokens; if Gemini asks for manual OAuth client credentials or authorization fails, use the Gemini CLI setup instead.</p><a className="mcp-doc-link" href="https://support.google.com/gemini/answer/17209137" target="_blank" rel="noreferrer">Gemini custom app guide <ExternalLink size={13} aria-hidden="true" /></a></article>
          </div>
          <p className="field-note">Cloud apps connect to this public HTTPS endpoint and handle sign-in in their own interface. Every user authorizes their own Rembr account.</p>
        </div>}
        {activeSetup === 'agents' && <div className="mcp-setup-panel-content" aria-live="polite">
          <div className="mcp-client-grid">
            <article className="mcp-client-card"><h3>Gemini CLI</h3><p>Add Rembr as a user-level Streamable HTTP server. Gemini CLI discovers OAuth settings and opens a browser when authorization is needed.</p><CopyableConfig value={geminiCommand} label="Gemini CLI command" /><p className="mcp-client-note">Check the result with <code>gemini mcp list</code>, then authenticate when prompted.</p><a className="mcp-doc-link" href="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md" target="_blank" rel="noreferrer">Gemini CLI MCP guide <ExternalLink size={13} aria-hidden="true" /></a></article>
            <article className="mcp-client-card"><h3>Claude Code</h3><p>Run this command in a terminal to add Rembr to your user configuration. Claude Code handles OAuth when it first connects.</p><CopyableConfig value={claudeCodeCommand} label="Claude Code command" /><p className="mcp-client-note">Then run <code>/mcp</code> inside Claude Code to review and manage connected servers.</p><a className="mcp-doc-link" href="https://docs.anthropic.com/en/docs/claude-code/mcp" target="_blank" rel="noreferrer">Claude Code MCP guide <ExternalLink size={13} aria-hidden="true" /></a></article>
          </div>
          <p className="field-note">When authorization opens in a browser, sign in to Rembr and approve the access level you want for that agent.</p>
        </div>}
        {activeSetup === 'universal' && <div className="mcp-setup-panel-content" aria-live="polite">
          <h3>For other MCP-compatible clients</h3>
          <p>Use this remote Streamable HTTP entry in a client that supports OAuth discovery. Paste it into that client’s MCP settings, replace any existing <code>mcpServers</code> object carefully, then complete sign-in in your browser.</p>
          <CopyableConfig value={portableConfig} label="Portable MCP configuration" />
          <p className="field-note">Configuration schemas vary. Some clients call the URL field <code>httpUrl</code> or require an HTTP transport field. Do not add an API key; Rembr uses OAuth and asks you to approve access.</p>
          <a className="mcp-doc-link" href="https://modelcontextprotocol.io/docs/develop/connect-remote-servers" target="_blank" rel="noreferrer">About remote MCP servers <ExternalLink size={14} aria-hidden="true" /></a>
        </div>}
      </section>
      <p className="mcp-api-key-note">Need direct HTTP access from a script? <Link to="/app/settings/developer-access">Create a scoped API key <span aria-hidden="true">↗</span></Link></p>
    </div>
  </>;
}
