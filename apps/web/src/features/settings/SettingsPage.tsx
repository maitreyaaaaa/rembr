import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Code2, ImagePlus, Network, SlidersHorizontal, Upload, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { Onboarding, Profile } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import { useShell } from '../../app/shell-context.js';
import { contentOptions, referralOptions } from '../../app/onboarding-options.js';

type SettingsSection = 'profile' | 'preferences';
const sectionItems: Array<{ id: SettingsSection; label: string; icon: typeof UserRound }> = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
];

export function SettingsPage() {
  const { session, setSession } = useShell();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(session.profile);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [username, setUsername] = useState(session.profile?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(session.profile?.avatarUrl ?? '');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [avatarCleared, setAvatarCleared] = useState(false);
  const avatarPreviewRef = useRef('');
  const [contentTypes, setContentTypes] = useState<string[]>([]);
  const [referralSource, setReferralSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeSection, setActiveSection] = useState<SettingsSection>(location.pathname.endsWith('/preferences') ? 'preferences' : 'profile');
  const [advancedOpen, setAdvancedOpen] = useState(location.pathname.endsWith('/advanced'));
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<{ profile: Profile | null }>('/api/profile'),
      api<{ onboarding: Onboarding | null }>('/api/onboarding'),
    ]).then(([profileResult, onboardingResult]) => {
      if (!alive) return;
      setProfile(profileResult.profile);
      setUsername(profileResult.profile?.username ?? '');
      setAvatarUrl(profileResult.profile?.avatarUrl ?? '');
      setOnboarding(onboardingResult.onboarding);
      setContentTypes(onboardingResult.onboarding?.contentTypes ?? []);
      setReferralSource(onboardingResult.onboarding?.referralSource ?? '');
    }).catch((cause) => {
      if (alive) setError(messageOf(cause, 'Could not load settings.'));
    }).finally(() => {
      if (alive) setSettingsLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const profileDirty = Boolean(profile && (
    username !== profile.username || avatarUrl !== (profile.avatarUrl ?? '') || avatar !== null || avatarCleared
  ));
  const savedContentTypes = onboarding?.contentTypes ?? [];
  const contentTypesDirty = [...new Set(contentTypes)].sort().join('|') !== [...new Set(savedContentTypes)].sort().join('|');
  const preferencesDirty = contentTypesDirty || referralSource !== (onboarding?.referralSource ?? '');
  const dirtyCount = Number(Boolean(profile && username !== profile.username))
    + Number(Boolean(profile && avatarUrl !== (profile.avatarUrl ?? '')))
    + Number(avatar !== null)
    + Number(avatarCleared)
    + Number(contentTypesDirty)
    + Number(referralSource !== (onboarding?.referralSource ?? ''));
  const clearAvatarPreview = useCallback(() => {
    if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current);
    avatarPreviewRef.current = '';
    setAvatarPreviewUrl('');
  }, []);

  function selectAvatar(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size < 1 || file.size > 250 * 1024) {
      setError('Choose an image no larger than 250 KB.');
      return;
    }
    clearAvatarPreview();
    const preview = URL.createObjectURL(file);
    avatarPreviewRef.current = preview;
    setAvatarPreviewUrl(preview);
    setAvatar(file);
    setAvatarUrl('');
    setAvatarCleared(false);
    setError('');
  }

  const saveChanges = useCallback(async () => {
    if (!dirtyCount || busy) return;
    if (profileDirty) {
      const invalid = Array.from(document.querySelectorAll<HTMLInputElement>('#settings-profile input')).find((input) => !input.checkValidity());
      if (invalid) {
        invalid.reportValidity();
        invalid.focus();
        return;
      }
    }
    setBusy(true);
    setError('');
    setMessage('');
    const saved: string[] = [];
    try {
      if (profileDirty) {
        const body = avatar ? new FormData() : JSON.stringify({ username, avatarUrl: avatarCleared ? '' : avatarUrl });
        if (avatar && body instanceof FormData) {
          body.set('username', username);
          body.set('avatar', avatar);
        }
        const result = await api<{ profile: Profile }>('/api/profile', { method: 'PATCH', body });
        setProfile(result.profile);
        setUsername(result.profile.username);
        setAvatarUrl(result.profile.avatarUrl ?? '');
        setAvatar(null);
        clearAvatarPreview();
        setAvatarCleared(false);
        setSession({ ...session, profile: result.profile, profileComplete: true });
        saved.push('Profile');
      }
      if (preferencesDirty) {
        const result = await api<{ onboarding: Onboarding }>('/api/onboarding', {
          method: 'PUT',
          body: JSON.stringify({ contentTypes, referralSource, skipped: false }),
        });
        setOnboarding(result.onboarding);
        setContentTypes(result.onboarding.contentTypes);
        setReferralSource(result.onboarding.referralSource);
        saved.push('Preferences');
      }
      setMessage(`${saved.join(' and ')} saved.`);
    } catch (cause) {
      setError(messageOf(cause, 'Some changes could not be saved. Try again.'));
      if (saved.length) setMessage(`${saved.join(' and ')} saved. The remaining changes are still here.`);
    } finally {
      setBusy(false);
    }
  }, [avatar, avatarCleared, avatarUrl, busy, clearAvatarPreview, contentTypes, dirtyCount, onboarding, preferencesDirty, profile, profileDirty, referralSource, session, setSession, username]);

  const resetChanges = () => {
    setUsername(profile?.username ?? '');
    setAvatarUrl(profile?.avatarUrl ?? '');
    setAvatar(null);
    clearAvatarPreview();
    setAvatarCleared(false);
    setContentTypes(onboarding?.contentTypes ?? []);
    setReferralSource(onboarding?.referralSource ?? '');
    setError('');
    setMessage('Changes discarded.');
  };

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !settingsLoaded) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const id = visible?.target.id;
      if (id === 'settings-profile' || id === 'settings-preferences') setActiveSection(id.replace('settings-', '') as SettingsSection);
    }, { root, rootMargin: '-8% 0px -72% 0px', threshold: 0 });
    root.querySelectorAll<HTMLElement>('[data-settings-section]').forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [settingsLoaded]);

  useEffect(() => {
    const section = location.pathname.endsWith('/preferences') ? 'preferences' : null;
    if (settingsLoaded && section) {
      window.requestAnimationFrame(() => contentRef.current?.querySelector(`#settings-${section}`)?.scrollIntoView({ behavior: 'auto', block: 'start' }));
    }
  }, [location.pathname, settingsLoaded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && dirtyCount > 0) {
        event.preventDefault();
        void saveChanges();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirtyCount, saveChanges]);

  const currentAvatarUrl = avatarPreviewUrl || (avatarCleared ? '' : avatarUrl !== (profile?.avatarUrl ?? '') ? avatarUrl : profile?.avatarAssetUrl || profile?.avatarUrl || avatarUrl);

  return <section className="rembr-settings-page" aria-labelledby="rembr-settings-title">
    <div className="rembr-settings-layout">
      <aside className="rembr-settings-rail" aria-label="Settings navigation">
        <div className="rembr-settings-rail-heading"><h1 id="rembr-settings-title">Settings</h1><p>Account and library</p></div>
        <nav className="rembr-settings-section-nav" aria-label="Settings sections">
          {sectionItems.map(({ id, label, icon: Icon }) => <a key={id} href={`#settings-${id}`} aria-current={activeSection === id ? 'location' : undefined} className={`rembr-settings-nav-item ${activeSection === id ? 'is-active' : ''}`}>
            <Icon size={17} aria-hidden="true" /><span>{label}</span>
          </a>)}
          <button type="button" className={`rembr-settings-nav-item rembr-settings-advanced-toggle ${advancedOpen ? 'is-active' : ''}`} aria-expanded={advancedOpen} aria-controls="settings-advanced-links" onClick={() => setAdvancedOpen((open) => !open)}>
            <Network size={17} aria-hidden="true" /><span>Advanced options</span><ChevronDown size={15} aria-hidden="true" className={advancedOpen ? 'is-expanded' : ''} />
          </button>
          {advancedOpen && <div id="settings-advanced-links" className="rembr-settings-subnav" aria-label="Advanced options">
            <Link to="/app/checkup" aria-current={location.pathname === '/app/checkup' ? 'page' : undefined}><span className="rembr-settings-subnav-dot" aria-hidden="true" />Review</Link>
            <Link to="/app/graph" aria-current={location.pathname === '/app/graph' ? 'page' : undefined}><span className="rembr-settings-subnav-dot" aria-hidden="true" />Graph</Link>
          </div>}
        </nav>
        <p className="rembr-settings-rail-label rembr-settings-tools-label">TOOLS</p>
        <nav className="rembr-settings-quick-links" aria-label="More settings">
          <Link to="/app/imports"><Upload size={16} aria-hidden="true" /><span>Imports</span><ArrowUpRight size={13} aria-hidden="true" /></Link>
          <Link to="/app/settings/developer-access"><Code2 size={16} aria-hidden="true" /><span>Developer access</span><ArrowUpRight size={13} aria-hidden="true" /></Link>
          <Link to="/app/settings/mcp-access"><Network size={16} aria-hidden="true" /><span>MCP access</span><ArrowUpRight size={13} aria-hidden="true" /></Link>
        </nav>
        <div className="rembr-settings-account"><span className="rembr-settings-account-avatar">{(session.profile?.username?.[0] ?? session.user.email[0] ?? 'R').toUpperCase()}</span><span><strong>{session.profile?.username ? `@${session.profile.username}` : 'Your account'}</strong><small>{session.user.email}</small></span></div>
      </aside>

      <div className="rembr-settings-content" ref={contentRef}>
        {(error || message) && <div className="rembr-settings-feedback">{error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}</div>}
        {!settingsLoaded ? <div className="rembr-settings-loading" role="status"><span className="rembr-settings-spinner" />Loading your settings…</div> : <>
          <section id="settings-profile" className="rembr-settings-section" data-settings-section aria-labelledby="settings-profile-title">
            <div className="rembr-settings-section-heading"><div><h2 id="settings-profile-title">Profile</h2><p>How you appear in your Rembr library.</p></div></div>
            <div className="rembr-settings-panel rembr-settings-profile-panel">
              <div className="rembr-settings-profile-summary"><div className="rembr-settings-avatar">{currentAvatarUrl ? <img src={currentAvatarUrl} alt="" /> : (username.trim().charAt(0).toUpperCase() || 'R')}</div><div><strong>{username || 'Your profile'}</strong><span>{session.user.email}</span></div><div className="rembr-settings-photo-actions"><label className="rembr-settings-photo-change"><ImagePlus size={14} aria-hidden="true" /> Change photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { selectAvatar(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>{(currentAvatarUrl || avatar) && <button type="button" className="rembr-settings-photo-remove" onClick={() => { setAvatar(null); setAvatarUrl(''); setAvatarCleared(true); clearAvatarPreview(); }}>Remove</button>}</div></div>
              <div className="rembr-settings-fields">
                <label htmlFor="settings-username">Username<input id="settings-username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" value={username} onChange={(event) => setUsername(event.currentTarget.value)} /></label>
                <label htmlFor="settings-email">Email address<input id="settings-email" value={session.user.email} readOnly aria-describedby="settings-email-note" /></label>
                <p id="settings-email-note" className="rembr-settings-field-note">Email is used to sign in and can’t be changed here.</p>
                <label htmlFor="settings-avatar-url">Or use an HTTPS photo URL<input id="settings-avatar-url" type="url" placeholder="https://example.com/photo.jpg" value={avatarUrl} onChange={(event) => { setAvatarUrl(event.currentTarget.value); setAvatar(null); setAvatarCleared(false); clearAvatarPreview(); }} /></label>
                <p className="rembr-settings-field-note">PNG, JPG, or WebP uploads are limited to 250 KB.</p>
              </div>
            </div>
          </section>

          <section id="settings-preferences" className="rembr-settings-section" data-settings-section aria-labelledby="settings-preferences-title">
            <div className="rembr-settings-section-heading"><div><p className="rg-kicker">MAKE IT YOURS</p><h2 id="settings-preferences-title">Preferences</h2><p>Tell Rembr what you like to keep and how you found us.</p></div></div>
            <div className="rembr-settings-panel">
              <fieldset className="rembr-settings-content-types"><legend>Content you want to keep</legend><p>Select the kinds of things you expect to save to your library.</p>
                <div className="rembr-settings-choice-grid">{contentOptions.map(([value, label]) => <label key={value} className={`rembr-settings-choice ${contentTypes.includes(value) ? 'is-selected' : ''}`}><input type="checkbox" checked={contentTypes.includes(value)} onChange={(event) => setContentTypes((current) => event.currentTarget.checked ? [...new Set([...current, value])] : current.filter((entry) => entry !== value))} /><span>{label}</span><i aria-hidden="true"><Check size={13} /></i></label>)}</div>
              </fieldset>
              <label className="rembr-settings-select-label" htmlFor="settings-referral">How did you hear about Rembr?<select id="settings-referral" value={referralSource} onChange={(event) => setReferralSource(event.currentTarget.value)}><option value="">Choose one</option>{referralOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
          </section>

        </>}
      </div>
    </div>
    {dirtyCount > 0 && <div className="rembr-settings-savebar is-visible">
      <div className="rembr-settings-save-status"><span className="rembr-settings-unsaved-dot" /><span aria-live="polite">{dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}</span><small>Saved to your account when you choose Save changes.</small></div>
      <div className="rembr-settings-save-actions"><button className="rembr-settings-discard" type="button" disabled={busy} onClick={resetChanges}>Discard</button><button className="rembr-settings-save" type="button" disabled={busy || !settingsLoaded} onClick={() => void saveChanges()}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </div>}
  </section>;
}
