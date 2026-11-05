import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../app/api.js';

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
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyInfo | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const result = await api<{ keys: ApiKeyInfo[] }>('/api/developer-keys');
    setKeys(result.keys);
  }
  useEffect(() => { void refresh().catch(() => setError('Could not load API keys.')); }, []);
  useEffect(() => {
    if (!keyToRevoke) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setKeyToRevoke(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [keyToRevoke, busy]);

  function toggleScope(scope: Scope, enabled: boolean) {
    setScopes((current) => enabled ? [...new Set([...current, scope])] : current.filter((entry) => entry !== scope));
  }
  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); setCreated(null);
    try {
      const result = await api<{ key: ApiKeyCreated }>('/api/developer-keys', {
        method: 'POST', body: JSON.stringify({ name, scopes, expiresInDays }),
      });
      setCreated(result.key); setKeyCopied(false); setName(''); setShowCreateForm(false); await refresh();
    } catch { setError('Could not create this key. Check its name and scopes, then try again.'); }
    finally { setBusy(false); }
  }
  async function revokeKey(id: string) {
    setBusy(true); setError(''); setMessage('');
    try { await api<void>(`/api/developer-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }); setKeyToRevoke(null); await refresh(); setMessage('API key revoked.'); }
    catch { setError('Could not revoke this key. Try again.'); }
    finally { setBusy(false); }
  }
  async function copyKey() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.token); setKeyCopied(true); setError(''); setMessage('API key copied. Store it somewhere safe; Rembr cannot show it again.'); }
    catch { setError('Copy was blocked. Select and copy the key manually.'); }
  }

  return <>
    {error && !created && <p className="notice error" role="alert">{error}</p>}
    {message && !created && <p className="notice success" role="status">{message}</p>}
    {created && <div className="developer-key-created-backdrop"><section className="developer-key-created-dialog" role="dialog" aria-modal="true" aria-labelledby="new-key-title" aria-describedby="new-key-warning">
      <header><div className="developer-key-created-mark"><KeyRound size={18} aria-hidden="true" /></div><button type="button" aria-label="Close API key" onClick={() => setCreated(null)}><X size={17} aria-hidden="true" /></button></header>
      <div className="developer-key-created-copy"><p className="developer-key-created-eyebrow">API KEY CREATED</p><h2 id="new-key-title">Copy your new key now</h2><p id="new-key-warning">This will be shown only once. Store it somewhere safe; Rembr cannot recover it later.</p></div>
      <div className="developer-key-created-value"><textarea aria-label="New API key" autoFocus readOnly rows={2} value={created.token} onFocus={(event) => event.currentTarget.select()} />
        <button className="primary-button" type="button" onClick={() => void copyKey()}>{keyCopied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{keyCopied ? 'Copied' : 'Copy API key'}</button>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <footer><span>{message && keyCopied ? message : 'Keep this key private. Anyone with it can use its selected permissions.'}</span><button className="secondary-button" type="button" onClick={() => setCreated(null)}>Done</button></footer>
    </section></div>}
    <section className="developer-access-card" aria-labelledby="active-keys-title">
      <header className="developer-access-heading">
        <div><h2 id="active-keys-title">API keys</h2><p>Keys inherit the permissions selected for them.</p></div>
        <div className="developer-access-heading-actions"><Link to="/app/settings/mcp-access">MCP access</Link><button className="developer-access-create-button" type="button" aria-expanded={showCreateForm} aria-controls="create-key-form" onClick={() => setShowCreateForm((open) => !open)}>
          {showCreateForm ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{showCreateForm ? 'Close' : 'Create key'}
        </button></div>
      </header>
      {showCreateForm && <form id="create-key-form" className="developer-access-create-form" onSubmit={(event) => void createKey(event)}>
        <div className="developer-access-form-heading"><div><h3>Create an API key</h3><p>Choose a clear name, only the permissions it needs, and an expiry.</p></div></div>
        <div className="developer-access-form-grid">
          <label htmlFor="api-key-name">Name<input id="api-key-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required placeholder="e.g. Personal automation" /></label>
          <label htmlFor="api-key-expiry">Expires after<select id="api-key-expiry" value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select></label>
        </div>
        <fieldset className="developer-access-permissions"><legend>Permissions</legend>
          {scopeOptions.map(([scope, title, description]) => <label className="developer-access-permission" key={scope}>
            <input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => toggleScope(scope, event.target.checked)} />
            <span><strong>{title}</strong><small>{description}</small></span>
          </label>)}
        </fieldset>
        <button className="primary-button" disabled={busy || scopes.length === 0}>{busy ? 'Creating…' : 'Create API key'}</button>
      </form>}
      {keys.length === 0 ? <div className="developer-access-empty"><KeyRound size={18} aria-hidden="true" /><p>No API keys yet.</p><span>Create a scoped key to connect a script or integration.</span></div> : <div className="developer-keys-table-scroll" role="region" aria-label="Your API keys" tabIndex={0}>
        <table className="developer-keys-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Key</th><th scope="col">Scope</th><th scope="col">Created</th><th scope="col">Last used</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>{keys.map((key) => {
            const expired = Date.parse(key.expiresAt) <= Date.now();
            const status = key.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Active';
            return <tr key={key.id}>
              <th scope="row" className="developer-keys-name"><span className="developer-key-name-row"><KeyRound size={15} aria-hidden="true" />{key.name}</span><span className={`developer-keys-status ${key.revokedAt ? 'is-revoked' : expired ? 'is-expired' : 'is-active'}`}>{status}</span></th>
              <td><div className="developer-key-cell"><code className="developer-keys-prefix" aria-label={`Masked API key beginning ${key.prefix}`}>{key.prefix.replace(/_$/, '')}{'•'.repeat(12)}</code></div></td>
              <td><div className="developer-keys-scopes">{key.scopes.map((scope) => <span key={scope}>{scope === 'library:read' ? 'Read' : scope === 'library:write' ? 'Read & write' : 'Collections'}</span>)}</div></td>
              <td><span>{new Date(key.createdAt).toLocaleDateString()}</span><span className="developer-keys-secondary">{key.revokedAt ? 'Revoked' : `Expires ${new Date(key.expiresAt).toLocaleDateString()}`}</span></td>
              <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : <span className="developer-keys-secondary">Never</span>}</td>
              <td className="developer-keys-actions">{key.revokedAt ? <span className="developer-keys-secondary"><Check size={13} aria-hidden="true" /> Revoked</span> : <button className="developer-key-revoke" type="button" disabled={busy} onClick={() => setKeyToRevoke(key)}>Revoke</button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>
    {keyToRevoke && <div className="developer-sensitive-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setKeyToRevoke(null); }}><section className="developer-sensitive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="revoke-key-title" aria-describedby="revoke-key-description"><header><div><h2 id="revoke-key-title">Revoke API key</h2><p>Access control</p></div><button type="button" aria-label="Close confirmation" disabled={busy} onClick={() => setKeyToRevoke(null)}><X size={17} /></button></header><p id="revoke-key-description">“{keyToRevoke.name}” will stop working immediately. This cannot be undone.</p><footer><button type="button" disabled={busy} onClick={() => setKeyToRevoke(null)}>Cancel</button><button className="developer-sensitive-confirm" type="button" disabled={busy} onClick={() => void revokeKey(keyToRevoke.id)}>{busy ? 'Revoking…' : 'Revoke key'}</button></footer></section></div>}
  </>;
}
