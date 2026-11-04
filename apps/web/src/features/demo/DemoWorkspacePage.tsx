import { useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';

export function DemoWorkspacePage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  async function enterDemo() {
    setError('');
    try {
      await api('/api/auth/demo', { method: 'POST' });
      navigate('/app', { replace: true });
    } catch (cause) { setError(messageOf(cause, 'The demo workspace could not be opened.')); }
  }

  useEffect(() => { void enterDemo(); }, []);

  return <main className="demo-entry-page">
    <img className="demo-entry-brand" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" />
    {error ? <section className="demo-entry-card" role="alert"><p className="demo-entry-kicker">Demo workspace</p><h1>We couldn’t open the demo.</h1><p>{error}</p><button className="demo-entry-primary" type="button" onClick={() => void enterDemo()}>Try again <ArrowRight size={17} aria-hidden="true" /></button></section>
      : <section className="demo-entry-card" aria-live="polite"><LoaderCircle className="demo-entry-spinner" size={24} aria-hidden="true" /><p className="demo-entry-kicker">Demo workspace</p><h1>Opening the shared library…</h1><p>Changes you make here are shared with other demo visitors.</p></section>}
  </main>;
}
