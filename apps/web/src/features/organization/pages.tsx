import type { Tag } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../../app/RouteStates.js';

export function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTags((await api<{ tags: Tag[] }>('/api/tags')).tags);
      setError('');
    } catch (cause) {
      setError(messageOf(cause, 'Could not load tags.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/tags', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      await load();
    } catch (cause) {
      setError(messageOf(cause, 'Could not create tag.'));
    } finally {
      setBusy(false);
    }
  }

  async function update(tag: Tag) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/tags/${encodeURIComponent(tag.id)}`, { method: 'PATCH', body: JSON.stringify({ name: editName }) });
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(messageOf(cause, 'Could not update tag.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(tag: Tag) {
    if (!window.confirm(`Delete the tag “${tag.name}”? Saved items will remain.`)) return;
    try {
      await api(`/api/tags/${encodeURIComponent(tag.id)}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(messageOf(cause, 'Could not delete tag.'));
    }
  }

  return <>
    <PageHeader title="Tags" description="Add a few precise labels to saved items." />
    <section className="phase2-panel phase2-narrow">
      <form className="phase2-inline-form" onSubmit={(event) => void add(event)}>
        <label className="visually-hidden" htmlFor="new-tag">New tag name</label>
        <input id="new-tag" maxLength={40} required placeholder="Name a tag" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="primary-button" disabled={busy}>{busy ? 'Adding…' : 'Add tag'}</button>
      </form>
      {error && <p className="notice error" role="alert">{error}</p>}
      {loading ? <div className="phase2-state" role="status">Loading tags…</div> : tags.length ? <ul className="phase2-manage-list">
        {tags.map((tag) => <li key={tag.id}>
          {editingId === tag.id ? <form className="phase2-inline-edit" onSubmit={(event) => { event.preventDefault(); void update(tag); }}>
            <label className="visually-hidden" htmlFor={`edit-tag-${tag.id}`}>Edit tag name</label>
            <input id={`edit-tag-${tag.id}`} maxLength={40} required value={editName} onChange={(event) => setEditName(event.target.value)} />
            <button className="quiet-button" disabled={busy}>Save</button>
            <button className="phase2-text-button" type="button" onClick={() => setEditingId(null)}>Cancel</button>
          </form> : <span className="phase2-pill">{tag.name}</span>}
          <div className="phase2-card-actions">
            <button className="quiet-button" type="button" aria-label={`Edit tag ${tag.name}`} onClick={() => { setEditingId(tag.id); setEditName(tag.name); }}>Edit</button>
            <button className="quiet-button danger-button" aria-label={`Delete tag ${tag.name}`} onClick={() => void remove(tag)} type="button">Delete</button>
          </div>
        </li>)}
      </ul> : <div className="empty-state"><h2>No tags yet</h2><p>Create a tag, then add it to saved items from their detail page.</p></div>}
    </section>
  </>;
}
