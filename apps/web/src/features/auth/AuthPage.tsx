import type { ApiError, Session } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf, sameAppPath } from '../../app/helpers.js';
import { lazy, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, FileCheck2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { RembrAuthFrame } from './RembrAuthFrame.js';

const PasswordStrengthField = lazy(() => import('../../components/PasswordStrengthField.js').then(({ PasswordStrengthField: field }) => ({ default: field })));

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedMode = new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register'>(requestedMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoPromptOpen, setDemoPromptOpen] = useState(() => new URLSearchParams(location.search).get('demo') === '1');
  const returnTo = sameAppPath(new URLSearchParams(location.search).get('returnTo'));

  useEffect(() => {
    setMode(requestedMode);
    setPassword('');
    setTermsAccepted(false);
    setPasswordRevealed(false);
    setError('');
  }, [requestedMode]);

  useEffect(() => {
    let active = true;
    void api<Session>('/api/auth/session').then((session) => {
      if (active) navigate(!session.termsCurrent ? '/app' : session.profileComplete ? returnTo : '/app/setup/profile', { replace: true, state: { returnTo } });
    }).catch((cause) => {
      if (active && (cause as ApiError).status !== 401) setError(messageOf(cause, 'Could not verify your current session.'));
    });
    return () => { active = false; };
  }, [navigate, returnTo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify({ email, password, rememberMe, ...(mode === 'register' ? { acceptedTerms: termsAccepted } : {}) }) });
      const session = await api<Session>('/api/auth/session');
      navigate(!session.termsCurrent ? '/app' : session.profileComplete ? returnTo : '/app/setup/profile', { replace: true, state: { returnTo } });
    } catch (cause) { setError(messageOf(cause, 'Sign in failed. Try again.')); }
    finally { setBusy(false); }
  }

  return <><RembrAuthFrame title="Keep what you find. Find it again." description="Save a public page with its source and a readable copy." sideNote="Made for the long read">
    <div className="auth-card-heading"><h2 id="auth-form-title">{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2></div>
      <div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setPassword(''); setTermsAccepted(false); setPasswordRevealed(false); setError(''); }}>Sign in</button><button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setPassword(''); setPasswordRevealed(false); setError(''); }}>Create account</button></div>
      <form className="stack-form" onSubmit={(event) => void submit(event)}><label htmlFor="email">Email address</label><input id="email" autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />{mode === 'register' ? <PasswordStrengthField id="password" value={password} onValueChange={setPassword} disabled={busy} /> : <><label htmlFor="password">Password</label><div className="password-input-wrap"><input id="password" name="password" autoComplete="current-password" type={passwordRevealed ? 'text' : 'password'} required minLength={1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="password-reveal" aria-label={passwordRevealed ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={passwordRevealed} onClick={() => setPasswordRevealed((current) => !current)}>{passwordRevealed ? 'Hide' : 'Show'}</button></div></>}{mode === 'register' && <label className="auth-terms"><input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.currentTarget.checked)} /><span className="auth-terms-icon"><FileCheck2 size={17} aria-hidden="true" /></span><span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>. This includes the AI processing described there.</span></label>}<label className="auth-remember"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.currentTarget.checked)} /><span>Keep me signed in on this browser for 30 days</span></label>{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy || (mode === 'register' && !termsAccepted)}>{busy ? (mode === 'register' ? 'Creating account…' : 'Signing in…') : mode === 'register' ? 'Create your library' : 'Sign in to Rembr'}</button></form>
      <p className="privacy-note"><span>✳</span>Your library is private to your account. Rembr can save public pages.</p>
  </RembrAuthFrame>{demoPromptOpen && <div className="demo-choice-backdrop"><section className="demo-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-choice-title"><p className="demo-choice-kicker">A faster way to explore</p><h2 id="demo-choice-title">Take a look around first.</h2><p>Either log in or sign up with your own account and export your Instagram saves. Importing them takes a little time. Or enter the shared demo workspace now. Changes, imports, and profile edits in the demo are visible to other visitors.</p><Link className="demo-choice-primary" to="/demo" onClick={() => setDemoPromptOpen(false)}>Enter the demo workspace <ArrowRight size={18} aria-hidden="true" /></Link><button className="demo-choice-account" type="button" onClick={() => setDemoPromptOpen(false)}>Log in or sign up with my own account</button><button className="demo-choice-close" type="button" aria-label="Close demo introduction" onClick={() => setDemoPromptOpen(false)}>×</button></section></div>}</>;
}

