import type { Profile, Session } from '../../app/contracts.js';
import { api, apiWithProgress } from '../../app/api.js';
import { messageOf, sameAppPath } from '../../app/helpers.js';
import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AvatarUpload } from '../../components/AvatarUpload.js';
import { useSession } from './useSession.js';

export function SetupRoute() {
  const { session, loading, refresh } = useSession(); const location = useLocation(); const navigate = useNavigate();
  const returnTo = sameAppPath((location.state as { returnTo?: string } | null)?.returnTo);
  if (loading) return <main className="center-state" role="status">Checking your session…</main>;
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (!session.termsCurrent) return <Navigate to="/app" replace />;
  if (session.profileComplete) return <Navigate to={returnTo} replace />;
  return <main className="phase2-centered phase2-setup-shell"><section className="phase2-card phase2-setup-card"><Link className="wordmark" to="/app" aria-label="Rembr app home"><img className="rembr-official-logo auth-brand-logo" src="/brand/rembr-wordmark.svg?v=20261101" alt="Rembr" /></Link><ProfileForm session={session} onComplete={async () => { await refresh(); navigate(returnTo, { replace: true }); }} /></section></main>;
}

function ProfileForm({ session, onComplete }: { session: Session; onComplete: () => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [profile, setProfile] = useState<Profile | null>(session.profile);
  const [username, setUsername] = useState(session.profile?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(session.profile?.avatarUrl ?? '');
  const [avatarUrlChanged, setAvatarUrlChanged] = useState(false);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarCleared, setAvatarCleared] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      let body: { profile: Profile };
      if (avatar) {
        const form = new FormData(); form.set('username', username); form.set('avatar', avatar);
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        const uploadStartedAt = performance.now();
        setAvatarProgress(1);
        setAvatarUploadError('');
        body = await apiWithProgress('/api/profile', form, controller.signal, setAvatarProgress);
        const visibleFor = 420 - (performance.now() - uploadStartedAt);
        if (visibleFor > 0) await new Promise((resolve) => window.setTimeout(resolve, visibleFor));
      }
      else body = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ username, ...(avatarCleared ? { avatarUrl: '' } : avatarUrlChanged ? { avatarUrl } : {}) }) });
      setProfile(body.profile); await onComplete();
    } catch (cause) {
      const message = messageOf(cause, 'Could not save your profile.');
      if (avatar) setAvatarUploadError(`${message.replace(/[.!?]+$/, '')}. Your previous photo is unchanged.`);
      else setError(message);
    }
    finally { uploadAbortRef.current = null; setAvatarProgress(null); setBusy(false); }
  }
  return <><h1>Choose a username</h1><p className="phase2-lead">This name appears on your profile. Your account email stays private.</p><form ref={formRef} className="phase2-form" onSubmit={(event) => void submit(event)}><label htmlFor="profile-username">Username</label><div className="phase2-prefix"><span>@</span><input id="profile-username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" autoComplete="username" value={username} disabled={busy} onChange={(event) => setUsername(event.target.value)} /></div><p className="field-note">3–24 letters, numbers, or underscores.</p><AvatarUpload name={username || 'Your profile'} src={avatarUrlChanged ? avatarUrl : profile?.avatarAssetUrl ?? profile?.avatarUrl} file={avatar} busy={busy && Boolean(avatar)} progress={avatarProgress} uploadError={avatarUploadError} onCancelUpload={() => uploadAbortRef.current?.abort()} onRetryUpload={() => formRef.current?.requestSubmit()} onDiscardUpload={() => { setAvatar(null); setAvatarCleared(false); setAvatarUploadError(''); }} onChange={(file, removed) => { setAvatar(file); setAvatarCleared(Boolean(removed)); setAvatarUploadError(''); if (file || removed) { setAvatarUrl(''); setAvatarUrlChanged(false); } setError(''); }} /><details className="avatar-url-option"><summary>Or use a public photo URL</summary><label htmlFor="profile-avatar-url">HTTPS photo URL <span>(optional)</span></label><input id="profile-avatar-url" type="url" inputMode="url" pattern="https://.*" placeholder="https://example.com/photo.jpg" value={avatarUrl} disabled={busy} onChange={(event) => { setAvatarUrl(event.target.value); setAvatarUrlChanged(true); setAvatar(null); setAvatarCleared(false); }} /><p className="field-note">Only use a photo URL you trust. It must start with https://.</p></details>{profile && <p className="phase2-helper">Current profile: @{profile.username}</p>}{error && <p className="notice error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving profile…' : 'Save and continue'}</button></form></>;
}

