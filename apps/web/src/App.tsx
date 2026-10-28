import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

interface User {
  id: string;
  email: string;
}

interface SavedItem {
  id: string;
  url: string;
  title: string;
  description: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  textPreview: string;
  text?: string;
}

interface ApiError {
  error?: { code?: string; message?: string };
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ApiError;
    throw new Error(payload.error?.message ?? 'Rembr could not complete that request.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function readableStatus(status: SavedItem['status']): string {
  return ({ queued: 'Waiting to process', processing: 'Saving page content', ready: 'Ready to read', failed: 'Could not process' })[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [items, setItems] = useState<SavedItem[]>([]);
  const [search, setSearch] = useState('');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadItems = useCallback(async (query = search) => {
    const result = await api<{ items: SavedItem[] }>(`/api/items?search=${encodeURIComponent(query)}`);
    setItems(result.items);
  }, [search]);

  useEffect(() => {
    let alive = true;
    void api<{ user: User }>('/api/auth/session')
      .then((result) => { if (alive) setUser(result.user); })
      .catch(() => { if (alive) setUser(null); })
      .finally(() => { if (alive) setCheckingSession(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = () => { void loadItems().catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : 'Could not load your library.'); }); };
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [user, loadItems]);

  const activeCount = useMemo(() => items.filter((item) => item.status === 'queued' || item.status === 'processing').length, [items]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ user: User }>(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      setUser(result.user); setPassword(''); setMessage(authMode === 'register' ? 'Your private library is ready.' : 'You are signed in.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed. Try again.');
    } finally { setBusy(false); }
  }

  async function submitUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ item: SavedItem; duplicate: boolean }>('/api/items', {
        method: 'POST', body: JSON.stringify({ url }),
      });
      setUrl('');
      setMessage(result.duplicate ? 'That page is already in your library.' : 'Page accepted. Rembr is saving its content.');
      await loadItems();
      setExpanded(result.item.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that page.');
    } finally { setBusy(false); }
  }

  async function deleteItem(item: SavedItem) {
    if (!window.confirm(`Remove “${item.title}” and its queued processing job from your library?`)) return;
    setError(''); setMessage('');
    try {
      await api(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (expanded === item.id) setExpanded(null);
      setMessage('Page removed from your library.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove that page.');
    }
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' });
    setItems([]); setUser(null); setMessage('You are signed out.');
  }

  if (checkingSession) return <main className="center-state" role="status">Checking your session…</main>;

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-title">
          <a className="wordmark" href="/" aria-label="Rembr home">rembr<span aria-hidden="true">.</span></a>
          <p className="eyebrow">A quieter place for the web</p>
          <h1 id="auth-title">Keep what matters.<br /><span>Find it when you need it.</span></h1>
          <p className="auth-copy">Save a public page to your private library. Rembr stores the original link and builds a readable copy for you.</p>
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={authMode === 'login'} onClick={() => { setAuthMode('login'); setError(''); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={authMode === 'register'} onClick={() => { setAuthMode('register'); setError(''); }}>Create account</button>
          </div>
          <form className="stack-form" onSubmit={submitAuth}>
            <label htmlFor="email">Email address</label>
            <input id="email" autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="password">Password</label>
            <input id="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} type="password" required minLength={authMode === 'register' ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
            {authMode === 'register' && <p className="field-note">Use at least 12 characters. Your password is never shown in your library.</p>}
            {error && <p className="notice error" role="alert">{error}</p>}
            {message && <p className="notice success" role="status">{message}</p>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : authMode === 'register' ? 'Create your library' : 'Sign in to Rembr'}</button>
          </form>
          <p className="privacy-note">Your library is private to your account. Only public web pages can be captured in this first build.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Rembr home">rembr<span aria-hidden="true">.</span></a>
        <div className="account-menu"><span>{user.email}</span><button type="button" className="quiet-button" onClick={() => void signOut()}>Sign out</button></div>
      </header>
      <section className="welcome-row">
        <div><p className="eyebrow">Your private library</p><h1>Good to have you back.</h1><p>Save a page now. Rembr will keep a readable copy with its source link.</p></div>
        <div className="library-count"><strong>{items.length}</strong><span>saved {items.length === 1 ? 'page' : 'pages'}</span></div>
      </section>
      <section className="capture-card" aria-labelledby="capture-title">
        <div className="capture-heading"><span className="capture-icon" aria-hidden="true">↗</span><div><h2 id="capture-title">Save a page</h2><p>Use a public article or web page URL.</p></div></div>
        <form className="capture-form" onSubmit={submitUrl}>
          <label className="visually-hidden" htmlFor="page-url">Page URL</label>
          <input id="page-url" type="url" inputMode="url" autoComplete="url" placeholder="https://example.com/article" required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} />
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save page'}</button>
        </form>
        {error && <p className="notice error" role="alert">{error}</p>}
        {message && <p className="notice success" role="status">{message}</p>}
      </section>
      <section className="library-section" aria-labelledby="library-title">
        <div className="section-heading"><div><p className="eyebrow">Everything you kept</p><h2 id="library-title">Your library</h2></div>{activeCount > 0 && <p className="processing-note" role="status">{activeCount} {activeCount === 1 ? 'page is' : 'pages are'} being processed</p>}</div>
        <div className="search-row"><label className="visually-hidden" htmlFor="library-search">Search saved pages</label><span aria-hidden="true">⌕</span><input id="library-search" type="search" placeholder="Search by title or URL" maxLength={120} value={search} onChange={(event) => { setSearch(event.target.value); void loadItems(event.target.value); }} /></div>
        {items.length === 0 ? <div className="empty-state"><span aria-hidden="true">✳</span><h3>{search ? 'No pages match that search.' : 'Your library is ready for its first page.'}</h3><p>{search ? 'Try a different title or address.' : 'Save a public page above and it will appear here.'}</p></div> : (
          <ul className="item-list">
            {items.map((item) => (
              <li className="item-card" key={item.id}>
                <div className="item-main">
                  <div className="item-info"><p className="item-domain">{new URL(item.url).hostname}</p><button className="item-title" type="button" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{item.title}</button><p className="item-description">{item.description || item.textPreview || 'A readable copy will appear here after processing.'}</p><a className="source-link" href={item.url} target="_blank" rel="noreferrer">Open original page <span aria-hidden="true">↗</span></a></div>
                  <div className="item-actions"><span className={`status status-${item.status}`}><span aria-hidden="true">●</span>{readableStatus(item.status)}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time><button className="quiet-button danger-button" type="button" onClick={() => void deleteItem(item)}>Remove</button></div>
                </div>
                {expanded === item.id && <div className="item-content" aria-label={`Saved text for ${item.title}`}><h3>Readable copy</h3>{item.status === 'ready' ? <p>{item.text || item.textPreview || 'No readable text was found on this page.'}</p> : <p>{item.status === 'failed' ? 'Rembr could not save a readable copy. The source link is still available.' : 'Rembr is processing the page. This view updates automatically.'}</p>}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="workspace-footer"><span>Rembr keeps the source link alongside each saved copy.</span><span>Phase 1 · deterministic capture</span></footer>
    </main>
  );
}
