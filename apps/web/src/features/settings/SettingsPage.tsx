import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Code2, ImagePlus, Network, RefreshCw, ShieldCheck, SlidersHorizontal, Upload, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { AiPreference, AiSearchPreference, Onboarding, Profile, SemanticSearchPreference, VisualSearchPreference } from '../../app/contracts.js';
import { AI_DISCLOSURE_VERSION, AI_SEARCH_DISCLOSURE_VERSION, SEMANTIC_SEARCH_DISCLOSURE_VERSION, VISUAL_SEARCH_DISCLOSURE_VERSION } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import { useShell } from '../../app/shell-context.js';
import { contentOptions, referralOptions } from '../../app/onboarding-options.js';

type SettingsSection = 'profile' | 'preferences' | 'privacy' | 'advanced';
const sectionItems: Array<{ id: SettingsSection; label: string; icon: typeof UserRound }> = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'privacy', label: 'AI & privacy', icon: ShieldCheck },
  { id: 'advanced', label: 'Advanced options', icon: Network },
];

export function SettingsPage() {
  const { session, setSession } = useShell();
  const location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(session.profile);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [aiPreference, setAiPreference] = useState<AiPreference | null>(null);
  const [aiSearchPreference, setAiSearchPreference] = useState<AiSearchPreference | null>(null);
  const [visualSearchPreference, setVisualSearchPreference] = useState<VisualSearchPreference | null>(null);
  const [semanticSearchPreference, setSemanticSearchPreference] = useState<SemanticSearchPreference | null>(null);
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
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeSection, setActiveSection] = useState<SettingsSection>(location.pathname.endsWith('/preferences') ? 'preferences' : location.pathname.endsWith('/advanced') ? 'advanced' : 'profile');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<{ profile: Profile | null }>('/api/profile'),
      api<{ onboarding: Onboarding | null }>('/api/onboarding'),
      api<{ preference: AiPreference }>('/api/ai/preferences'),
      api<{ preference: AiSearchPreference }>('/api/knowledge/ai-preferences'),
      api<{ preference: VisualSearchPreference }>('/api/ai/visual-search-preferences'),
      api<{ preference: SemanticSearchPreference }>('/api/semantic/preferences'),
    ]).then(([profileResult, onboardingResult, ai, aiSearch, visual, semantic]) => {
      if (!alive) return;
      setProfile(profileResult.profile);
      setUsername(profileResult.profile?.username ?? '');
      setAvatarUrl(profileResult.profile?.avatarUrl ?? '');
      setOnboarding(onboardingResult.onboarding);
      setContentTypes(onboardingResult.onboarding?.contentTypes ?? []);
      setReferralSource(onboardingResult.onboarding?.referralSource ?? '');
      setAiPreference(ai.preference);
      setAiSearchPreference(aiSearch.preference);
      setVisualSearchPreference(visual.preference);
      setSemanticSearchPreference(semantic.preference);
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
      if (id === 'settings-profile' || id === 'settings-preferences' || id === 'settings-privacy' || id === 'settings-advanced') setActiveSection(id.replace('settings-', '') as SettingsSection);
    }, { root, rootMargin: '-8% 0px -72% 0px', threshold: 0 });
    root.querySelectorAll<HTMLElement>('[data-settings-section]').forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [settingsLoaded]);

  useEffect(() => {
    const section = location.pathname.endsWith('/preferences') ? 'preferences' : location.pathname.endsWith('/advanced') ? 'advanced' : null;
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

  async function updateAiPreference<T extends AiPreference>(
    endpoint: string,
    enabled: boolean,
    disclosureVersion: string,
    successText: string,
    failureText: string,
    setPreference: (value: T) => void,
  ) {
    setAiBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ preference: T }>(endpoint, {
        method: 'PUT',
        body: JSON.stringify({ enabled, disclosureVersion: enabled ? disclosureVersion : undefined }),
      });
      setPreference(result.preference);
      setMessage(successText);
    } catch (cause) {
      setError(messageOf(cause, failureText));
    } finally {
      setAiBusy(false);
    }
  }

  async function indexSemanticLibrary() {
    setAiBusy(true);
    setError('');
    setMessage('Starting semantic indexing…');
    let afterId: string | undefined;
    let indexed = 0;
    try {
      for (;;) {
        const result = await api<{ indexed: number; scanned: number; nextAfterId: string | null; hasMore: boolean }>('/api/semantic/index', {
          method: 'POST', body: JSON.stringify(afterId ? { afterId } : {}),
        });
        indexed += result.indexed;
        setMessage(`Indexed ${indexed} saved ${indexed === 1 ? 'item' : 'items'} so far…`);
        if (!result.hasMore) break;
        if (!result.nextAfterId) throw new Error('Indexing did not return a continuation point.');
        afterId = result.nextAfterId;
      }
      const latest = await api<{ preference: SemanticSearchPreference }>('/api/semantic/preferences');
      setSemanticSearchPreference(latest.preference);
      setMessage(`Semantic indexing is up to date. ${indexed} ${indexed === 1 ? 'item was' : 'items were'} newly indexed.`);
    } catch (cause) {
      setError(messageOf(cause, 'Semantic indexing stopped. You can resume it later.'));
    } finally {
      setAiBusy(false);
    }
  }

  const currentAvatarUrl = avatarPreviewUrl || (avatarCleared ? '' : avatarUrl !== (profile?.avatarUrl ?? '') ? avatarUrl : profile?.avatarAssetUrl || profile?.avatarUrl || avatarUrl);

  return <section className="rembr-settings-page" aria-labelledby="rembr-settings-title">
    <div className="rembr-settings-layout">
      <aside className="rembr-settings-rail" aria-label="Settings navigation">
        <div className="rembr-settings-rail-heading"><h1 id="rembr-settings-title">Settings</h1><p>Account and library</p></div>
        <nav className="rembr-settings-section-nav" aria-label="Settings sections">
          {sectionItems.map(({ id, label, icon: Icon }) => <a key={id} href={`#settings-${id}`} aria-current={activeSection === id ? 'location' : undefined} className={`rembr-settings-nav-item ${activeSection === id ? 'is-active' : ''}`}>
            <Icon size={17} aria-hidden="true" /><span>{label}</span>
          </a>)}
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

          <section id="settings-privacy" className="rembr-settings-section" data-settings-section aria-labelledby="settings-privacy-title">
            <div className="rembr-settings-section-heading"><div><p className="rg-kicker">YOUR DATA, YOUR CALL</p><h2 id="settings-privacy-title">AI & privacy</h2><p>Each control is separate. Rembr only sends data for a feature after you enable it and use that feature.</p></div></div>
            <div className="rembr-settings-privacy-list">
              <PrivacySetting title="Instagram media analysis" description="When enabled, Rembr sends publicly accessible Instagram post and reel media plus associated post text (caption, title, and readable page text) from new imports to Meta AI to create summaries, image and video descriptions, text recognition, available speech transcripts, search keywords, and optional entity labels. People labels can only come from text or OCR; Rembr never identifies faces. Private or unavailable media is skipped. Rembr keeps the generated notes, not new raw media files." details="Off by default. Turning this off stops new analysis jobs. Media and text sent for analysis may be processed under Meta’s terms. No analysis runs until you enable this setting." enabled={Boolean(aiPreference?.enabled)} providerAvailable={aiPreference?.providerAvailable} busy={aiBusy} onChange={(enabled) => void updateAiPreference('/api/ai/preferences', enabled, AI_DISCLOSURE_VERSION, enabled ? 'AI media analysis enabled for future Instagram imports.' : 'AI media analysis turned off.', 'Could not update AI analysis preference.', setAiPreference)} />
              <PrivacySetting title="Grounded library AI" description="When enabled, questions send up to eight matching saved titles and text excerpts, existing media-analysis notes, and up to six recent conversation messages to Meta AI. A requested summary can send up to 6,000 characters of extracted page text or note body, with its title and description. People names are included only when present in source text or OCR; Rembr does not identify faces." details="Off by default and separate from Instagram media analysis. No library text or stored analysis is sent until you enable this and ask a question or request a summary. The selected text and conversation may be processed under Meta’s terms. You can turn this off at any time." enabled={Boolean(aiSearchPreference?.enabled)} providerAvailable={aiSearchPreference?.providerAvailable} busy={aiBusy} onChange={(enabled) => void updateAiPreference('/api/knowledge/ai-preferences', enabled, AI_SEARCH_DISCLOSURE_VERSION, enabled ? 'Grounded library answers enabled.' : 'Grounded library answers turned off.', 'Could not update grounded-answer preference.', setAiSearchPreference)} />
              <PrivacySetting title="Image search" description="When enabled, an image search sends only the image you choose to Meta AI to create a visual description and readable-text query. Rembr uses that text to search your private library. The image and description are not saved as a Rembr artifact." details="Off by default and separate from the other AI settings. No image is sent until you enable this, choose an image, and submit a search. The selected image may be processed under Meta’s terms. Turn consent off at any time." enabled={Boolean(visualSearchPreference?.enabled)} providerAvailable={visualSearchPreference?.providerAvailable} busy={aiBusy} onChange={(enabled) => void updateAiPreference('/api/ai/visual-search-preferences', enabled, VISUAL_SEARCH_DISCLOSURE_VERSION, enabled ? 'Image search consent enabled.' : 'Image search consent turned off.', 'Could not update image-search consent.', setVisualSearchPreference)} />
              <div className="rembr-settings-privacy-item">
                <div className="rembr-settings-privacy-copy"><div><h3>Meaning-based search</h3><span className={`rembr-settings-state ${semanticSearchPreference?.enabled ? 'is-on' : ''}`}><i />{semanticSearchPreference?.enabled ? 'Enabled' : 'Off'}</span></div>
                  <p>Rembr uses OpenAI text-embedding-3-small through OpenRouter to find saved items by meaning and blend those matches with keyword results. When you explicitly index or run semantic search, Rembr sends saved titles, descriptions, note text, extracted page text, and your query to OpenRouter. OpenRouter routes requests to an upstream provider; that provider’s terms may apply.</p>
                  <span className="rembr-settings-provider">{semanticSearchPreference?.providerAvailable ? 'Service available' : 'Service not configured · keyword search remains available'}</span>
                  <span className="rembr-settings-privacy-detail">Off by default and separate from Meta AI settings. Consent does not start indexing; you must request indexing. Turning consent off stops future semantic requests and deletes vectors stored by Rembr. Text already sent is subject to OpenRouter and its upstream provider’s retention terms.</span>
                  {semanticSearchPreference?.enabled && <p className="rembr-settings-index-status">{semanticSearchPreference.indexedItems} items indexed · {semanticSearchPreference.eligibleItems} eligible</p>}
                </div>
                <div className="rembr-settings-privacy-action"><label className="rembr-settings-switch"><input type="checkbox" role="switch" aria-label="Allow meaning-based search to process my saved library text" checked={Boolean(semanticSearchPreference?.enabled)} disabled={aiBusy || !semanticSearchPreference} onChange={(event) => void updateAiPreference<SemanticSearchPreference>('/api/semantic/preferences', event.currentTarget.checked, SEMANTIC_SEARCH_DISCLOSURE_VERSION, event.currentTarget.checked ? 'Meaning-based search consent enabled. Indexing will not start until you request it.' : 'Meaning-based search turned off and local vectors removed.', 'Could not update meaning-based search consent.', setSemanticSearchPreference)} /><span /></label></div>
                {semanticSearchPreference?.enabled && <div className="rembr-settings-index-action"><button className="quiet-button" type="button" disabled={aiBusy || !semanticSearchPreference.providerAvailable} onClick={() => void indexSemanticLibrary()}><RefreshCw size={14} aria-hidden="true" />{aiBusy ? 'Indexing…' : 'Index or refresh library'}</button><small>Indexing runs in batches and can be resumed.</small></div>}
              </div>
              <p className="rembr-settings-privacy-footnote">When you submit a live web search, Rembr sends your query to OpenRouter and its web-search provider. Their processing and retention terms may apply. Other third-party services process only the information described above when you use the enabled feature.</p>
            </div>
          </section>

          <section id="settings-advanced" className="rembr-settings-section" data-settings-section aria-labelledby="settings-advanced-title">
            <div className="rembr-settings-section-heading"><div><p className="rg-kicker">LIBRARY TOOLS</p><h2 id="settings-advanced-title">Advanced options</h2><p>Review and explore the organization and connections in your library.</p></div></div>
            <div className="rembr-settings-advanced-links">
              <Link to="/app/checkup"><span><strong>Review</strong><small>Check link status, imports, and saves that may need attention.</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
              <Link to="/app/graph"><span><strong>Connections</strong><small>Explore topics and relationships across your saved library.</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
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

function PrivacySetting({ title, description, details, enabled, providerAvailable, busy, onChange }: {
  title: string;
  description: string;
  details?: string;
  enabled: boolean;
  providerAvailable?: boolean;
  busy: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return <div className="rembr-settings-privacy-item">
    <div className="rembr-settings-privacy-copy"><div><h3>{title}</h3><span className={`rembr-settings-state ${enabled ? 'is-on' : ''}`}><i />{enabled ? 'Enabled' : 'Off'}</span></div><p>{description}</p>{details && <p className="rembr-settings-privacy-detail">{details}</p>}
      <span className="rembr-settings-provider">{providerAvailable ? 'Service available' : 'Service not configured yet'}</span>
    </div>
    <div className="rembr-settings-privacy-action"><label className="rembr-settings-switch"><input type="checkbox" role="switch" aria-label={`Allow ${title.toLocaleLowerCase()}`} checked={enabled} disabled={busy || providerAvailable === undefined} onChange={(event) => onChange(event.currentTarget.checked)} /><span /></label></div>
  </div>;
}
