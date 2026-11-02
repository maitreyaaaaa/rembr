import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, LockKeyhole, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ApiError, Session } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';

type AccessChoice = 'read' | 'read_write';

export function WorkOSMcpConsentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [access, setAccess] = useState<AccessChoice>('read');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const externalAuthId = new URLSearchParams(location.search).get('external_auth_id');
  const returnTo = `/auth/workos/mcp${location.search}`;
  const requestValid = Boolean(externalAuthId && externalAuthId.length <= 255);

  useEffect(() => {
    let active = true;
    if (!requestValid) {
      setChecking(false);
      setError('This MCP sign-in request is missing or invalid. Start again from your MCP app.');
      return () => { active = false; };
    }
    void api<Session>('/api/auth/session').catch((cause) => {
      if (!active) return;
      if ((cause as ApiError).status === 401) {
        navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      } else {
        setError(messageOf(cause, 'Rembr could not verify your session. Try again.'));
      }
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [navigate, requestValid, returnTo]);

  async function continueToWorkOS(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!externalAuthId || !requestValid) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ redirectUri: string }>('/api/auth/workos-mcp/complete', {
        method: 'POST', body: JSON.stringify({ externalAuthId, access }),
      });
      window.location.replace(result.redirectUri);
    } catch (cause) {
      const status = (cause as ApiError).status;
      if (status === 401) navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      else setError(messageOf(cause, 'Rembr could not continue this connection. Start again from your MCP app.'));
      setBusy(false);
    }
  }

  if (checking) return <main className="phase2-centered mcp-consent-shell"><section className="phase2-card mcp-consent-card" role="status"><p className="rg-kicker">REM BR / MCP ACCESS</p><h1>Checking your account…</h1></section></main>;

  return <main className="phase2-centered mcp-consent-shell"><section className="phase2-card mcp-consent-card" aria-labelledby="mcp-consent-title">
    <Link className="wordmark mcp-consent-brand" to="/" aria-label="Rembr home"><img className="rembr-official-logo auth-brand-logo" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" /></Link>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!error || requestValid ? <>
      <div className="mcp-consent-eyebrow"><span><LockKeyhole size={14} aria-hidden="true" /> SECURE CONNECTION</span><span>POWERED BY WORKOS</span></div>
      <h1 id="mcp-consent-title">Connect your library.</h1>
      <p className="mcp-consent-intro">Choose what this MCP client can do with your Rembr account. You’ll review and confirm the connection with WorkOS next.</p>
      <form onSubmit={(event) => void continueToWorkOS(event)}>
        <fieldset className="mcp-consent-options" disabled={busy}>
          <legend>Choose access</legend>
          <label className={`mcp-consent-option ${access === 'read' ? 'is-selected' : ''}`}>
            <input type="radio" name="mcp-access" value="read" checked={access === 'read'} onChange={() => setAccess('read')} />
            <span className="mcp-consent-option-mark"><LockKeyhole size={17} aria-hidden="true" /></span>
            <span className="mcp-consent-option-copy"><strong>Read only</strong><small>Search your saved items and collections. Open item details.</small></span>
            <span className="mcp-consent-radio" aria-hidden="true"><i /></span>
          </label>
          <label className={`mcp-consent-option ${access === 'read_write' ? 'is-selected' : ''}`}>
            <input type="radio" name="mcp-access" value="read_write" checked={access === 'read_write'} onChange={() => setAccess('read_write')} />
            <span className="mcp-consent-option-mark is-write"><Check size={17} aria-hidden="true" /></span>
            <span className="mcp-consent-option-copy"><strong>Read + save links</strong><small>Read access, plus save public links to your library.</small></span>
            <span className="mcp-consent-radio" aria-hidden="true"><i /></span>
          </label>
        </fieldset>
        <div className="mcp-consent-data-note"><Check size={15} aria-hidden="true" /><p>No access is granted until you confirm with WorkOS. You can cancel here before proceeding.</p></div>
        <div className="mcp-consent-actions"><Link className="quiet-button" to="/app/settings/mcp-access"><X size={15} aria-hidden="true" /> Cancel</Link><button className="primary-button" type="submit" disabled={busy || !requestValid}>{busy ? 'Opening WorkOS…' : <>Continue to WorkOS <ArrowRight size={16} aria-hidden="true" /></>}</button></div>
      </form>
      <p className="mcp-consent-footer">WorkOS will ask you to confirm before any access is granted.</p>
    </> : <Link className="quiet-button" to="/app/settings/mcp-access">Return to Rembr</Link>}
  </section></main>;
}
