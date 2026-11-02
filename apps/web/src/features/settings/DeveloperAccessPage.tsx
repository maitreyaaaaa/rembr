import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../app/api.js';
import { PageHeader } from '../../app/RouteStates.js';

type Scope = 'library:read' | 'library:write' | 'collections:read';
type ApiKeyInfo = { id: string; name: string; scopes: Scope[]; prefix: string; createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null };
type ApiKeyCreated = { token: string; prefix: string; name: string; scopes: Scope[]; expiresAt: string };
const scopeOptions: Array<[Scope, string, string]> = [
  ['library:read', 'Read saved items', 'Search or retrieve your saved items.'],
  ['collections:read', 'Read collections', 'List your named collections.'],
  ['library:write', 'Save links', 'Add a public page link to your library.'],
];

export function DeveloperAccessPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['library:read', 'collections:read']);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const result = await api<{ keys: ApiKeyInfo[] }>('/api/developer-keys');
    setKeys(result.keys);
  }
  useEffect(() => { void refresh().catch(() => setError('Could not load API keys.')); }, []);

  function toggleScope(scope: Scope, enabled: boolean) {
    setScopes((current) => enabled ? [...new Set([...current, scope])] : current.filter((entry) => entry !== scope));
  }
  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); setCreated(null);
    try {
      const result = await api<{ key: ApiKeyCreated }>('/api/developer-keys', {
        method: 'POST', body: JSON.stringify({ name, scopes, expiresInDays }),
      });
      setCreated(result.key); setName(''); await refresh();
    } catch { setError('Could not create this key. Check its name and scopes, then try again.'); }
    finally { setBusy(false); }
  }
  async function revokeKey(id: string) {
    setBusy(true); setError(''); setMessage('');
    try { await api<void>(`/api/developer-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refresh(); setMessage('API key revoked.'); }
    catch { setError('Could not revoke this key. Try again.'); }
    finally { setBusy(false); }
  }
  async function copyKey() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.token); setMessage('Key copied. Store it somewhere safe; Rembr will not show it again.'); }
    catch { setError('Copy was blocked. Select and copy the key manually.'); }
  }

  return <>
    <PageHeader title="Developer access" description="Create scoped keys for scripts and integrations that connect to Rembr." />
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice success" role="status">{message}</p>}
    {created && <section className="phase2-panel phase2-narrow" aria-labelledby="new-key-title">
      <h2 id="new-key-title">Copy your new key now</h2>
      <p className="phase2-helper">This secret is shown once. Anyone with it can use the selected permissions until it expires or you revoke it.</p>
      <p><code className="developer-key-secret">{created.token}</code></p>
      <button className="primary-button" type="button" onClick={() => void copyKey()}>Copy key</button>
    </section>}
    <section className="phase2-panel phase2-narrow" aria-labelledby="create-key-title">
      <h2 id="create-key-title">Create an API key</h2>
      <form className="phase2-form" onSubmit={(event) => void createKey(event)}>
        <label htmlFor="api-key-name">Key name</label>
        <input id="api-key-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required placeholder="e.g. Personal automation" />
        <fieldset className="phase2-options">
          <legend>Permissions</legend>
          {scopeOptions.map(([scope, title, description]) => <label className="phase2-check" key={scope}>
            <input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => toggleScope(scope, event.target.checked)} />
            <span><strong>{title}</strong><br />{description}</span>
          </label>)}
        </fieldset>
        <label htmlFor="api-key-expiry">Expires after</label>
        <select id="api-key-expiry" value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}>
          <option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option>
        </select>
        <button className="primary-button" disabled={busy || scopes.length === 0}>{busy ? 'Creating…' : 'Create API key'}</button>
      </form>
    </section>
    <section className="phase2-panel phase2-narrow" aria-labelledby="active-keys-title">
      <h2 id="active-keys-title">Your keys</h2>
      {keys.length === 0 ? <p className="phase2-helper">No API keys yet.</p> : <div className="developer-keys-table-scroll" role="region" aria-label="Your API keys" tabIndex={0}>
        <table className="developer-keys-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Key prefix</th><th scope="col">Permissions</th><th scope="col">Created / expires</th><th scope="col">Last used</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>{keys.map((key) => {
            const expired = Date.parse(key.expiresAt) <= Date.now();
            const status = key.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Active';
            return <tr key={key.id}>
              <th scope="row" className="developer-keys-name">{key.name}<span className={`developer-keys-status ${key.revokedAt ? 'is-revoked' : expired ? 'is-expired' : 'is-active'}`}>{status}</span></th>
              <td><code className="developer-keys-prefix">{key.prefix}…</code></td>
              <td><div className="developer-keys-scopes">{key.scopes.map((scope) => <span key={scope}>{scope}</span>)}</div></td>
              <td><span>{new Date(key.createdAt).toLocaleDateString()}</span><span className="developer-keys-secondary">Expires {new Date(key.expiresAt).toLocaleDateString()}</span></td>
              <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : <span className="developer-keys-secondary">Never</span>}</td>
              <td className="developer-keys-actions">{key.revokedAt ? <span className="developer-keys-secondary">Revoked {new Date(key.revokedAt).toLocaleDateString()}</span> : <button className="secondary-button" type="button" disabled={busy} onClick={() => void revokeKey(key.id)}>Revoke</button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>
    <section className="phase2-panel phase2-narrow" aria-labelledby="api-guide-title">
      <h2 id="api-guide-title">Use a key</h2>
      <p className="phase2-helper">Keep your key in an environment variable. Send it as a Bearer token; never put it in a URL or browser code.</p>
      <p className="field-note">Set <code>REMBR_BASE_URL</code> to your Rembr instance URL and <code>REMBR_API_KEY</code> to the key you just created.</p>
      <pre><code>curl "$REMBR_BASE_URL/api/v1/items?limit=25" -H "Authorization: Bearer $REMBR_API_KEY"</code></pre>
      <p className="field-note">Add <code>search</code> or <code>limit</code> (1–100) to filter results; follow <code>nextCursor</code> to load another page. Read access requires <code>library:read</code>.</p>
      <pre><code>curl -X POST "$REMBR_BASE_URL/api/v1/items" -H "Authorization: Bearer $REMBR_API_KEY" -H "Content-Type: application/json" -d '&#123;"url":"https://example.com/article"&#125;'</code></pre>
      <p className="field-note">Saving a link requires <code>library:write</code>; new links return <code>202</code> and duplicates return <code>200</code>. The key can also use <code>GET /api/v1/items/:id</code> with <code>library:read</code> and <code>GET /api/v1/collections</code> with <code>collections:read</code>.</p>
    </section>
  </>;
}
