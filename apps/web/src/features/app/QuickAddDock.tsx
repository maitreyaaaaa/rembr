import type { SavedItem } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import { useEffect, useState, type FormEvent } from 'react';
import { FileText, Link2, Plus, Upload, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export function QuickAddDock() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'link' | 'note'>('menu');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [links, setLinks] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy]);

  function close() { setOpen(false); setView('menu'); setError(''); }
  async function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ item: SavedItem }>('/api/items', { method: 'POST', body: JSON.stringify({ url }) });
      close(); navigate(`/app/items/${encodeURIComponent(result.item.id)}`, { state: { returnTo: '/app' } });
    } catch (cause) { setError(messageOf(cause, 'Could not save that page.')); }
    finally { setBusy(false); }
  }
  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const noteLinks = links.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (noteLinks.length > 20) { setError('Add up to 20 links.'); return; }
    try { for (const value of noteLinks) { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } }
    catch { setError('Each link must be a complete HTTP or HTTPS URL.'); return; }
    if (images.length > 5 || images.some((image) => image.size > 5 * 1024 * 1024)) { setError('Choose up to five images, 5 MiB each.'); return; }
    setBusy(true);
    const form = new FormData(); form.set('title', title.trim() || 'Untitled note'); form.set('body', body); form.set('links', JSON.stringify(noteLinks)); images.forEach((image) => form.append('images', image));
    try {
      const result = await api<{ item: SavedItem }>('/api/notes', { method: 'POST', body: form });
      close(); navigate(`/app/items/${encodeURIComponent(result.item.id)}`, { state: { returnTo: '/app' } });
    } catch (cause) { setError(messageOf(cause, 'Could not save this note.')); }
    finally { setBusy(false); }
  }

  return <>
    <button className="quick-add-trigger" data-rembr-tour-target="quick-add" type="button" aria-label="Quick add to your library" aria-expanded={open} onClick={() => { setOpen(true); setView('menu'); }}><Plus aria-hidden="true" /></button>
    {open && <div className="quick-add-layer">
      <button className="quick-add-backdrop" type="button" aria-label="Close quick add" onClick={close} />
      <section className="quick-add-panel" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
        <header><div><span className="quick-add-kicker">Quick add</span><h2 id="quick-add-title">Add to your Library</h2></div><button className="quick-add-close" type="button" aria-label="Close quick add" onClick={close}><X /></button></header>
        {view === 'menu' && <div className="quick-add-menu">
          <button type="button" onClick={() => { setError(''); setView('link'); }}><span><Link2 /></span>Paste link</button>
          <button type="button" onClick={() => { setError(''); setView('note'); }}><span><FileText /></span>Write note</button>
          <button type="button" onClick={() => { close(); navigate('/app/add'); }}><span><Upload /></span>Upload file</button>
          <Link to="/app/add" onClick={close}><Upload />Open full Add Saves page</Link>
        </div>}
        {view === 'link' && <form className="quick-add-form" onSubmit={(event) => void saveLink(event)}>
          <button className="quick-add-back" type="button" onClick={() => { setView('menu'); setError(''); }}>← Quick add</button>
          <h3>Save a page</h3><label htmlFor="quick-add-url">Paste a link</label><input id="quick-add-url" type="url" inputMode="url" autoComplete="url" required maxLength={2048} placeholder="https://example.com/article" value={url} onChange={(event) => setUrl(event.currentTarget.value)} />
          {error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy || !url.trim()}>{busy ? 'Saving…' : 'Save page'}</button>
        </form>}
        {view === 'note' && <form className="quick-add-form" onSubmit={(event) => void saveNote(event)}>
          <button className="quick-add-back" type="button" onClick={() => { setView('menu'); setError(''); }}>← Quick add</button>
          <h3>Save a quick thought</h3><label className="visually-hidden" htmlFor="quick-add-note-body">Note</label><textarea id="quick-add-note-body" rows={1} maxLength={20000} required placeholder="Write the note, reminder, or idea…" value={body} onChange={(event) => { setBody(event.currentTarget.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }} />
          <label className="visually-hidden" htmlFor="quick-add-note-title">Title (optional)</label><input id="quick-add-note-title" maxLength={240} placeholder="Title optional" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          <label className="visually-hidden" htmlFor="quick-add-note-links">Optional links</label><textarea id="quick-add-note-links" rows={1} placeholder="Optional links, one per line" value={links} onChange={(event) => { setLinks(event.currentTarget.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }} />
          <label className="quick-add-image-button" htmlFor="quick-add-note-images"><Upload />Add images <span>{images.length}/5 selected</span></label><input id="quick-add-note-images" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => { const picked = Array.from(event.currentTarget.files ?? []).slice(0, 5); setImages(picked); event.currentTarget.value = ''; }} />
          {error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy || !body.trim()}>{busy ? 'Saving note…' : 'Save note'}</button>
        </form>}
      </section>
    </div>}
  </>;
}

