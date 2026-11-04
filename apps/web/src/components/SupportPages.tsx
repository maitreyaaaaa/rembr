import { useState, type FormEvent, type ReactNode } from 'react';
import './public-guides.css';

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL?.trim();

function PublicFrame({ children, current }: { children: ReactNode; current?: 'help' | 'pricing' }) {
  return <div className="rg-page">
    <header className="rg-header">
      <a className="rg-brand" href="/" aria-label="Rembr home">rembr<span>.</span></a>
      <nav aria-label="Public navigation">
        <a href="/features">The library</a>
        <a href="/how-to-use">How to use</a>
        <a aria-current={current === 'help' ? 'page' : undefined} href="/help">Help</a>
        <a aria-current={current === 'pricing' ? 'page' : undefined} href="/pricing">Pricing</a>
        <a className="rg-header-cta" href="/app" target="_blank" rel="noopener noreferrer">Open Rembr <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <main className="rg-main" id="main-content">{children}</main>
    <footer className="rg-footer">
      <a className="rg-brand" href="/" aria-label="Rembr home">rembr<span>.</span></a>
      <div><a href="/how-to-use">How to use</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a></div>
      <span>Keep what catches you. Find it when it matters.</span>
    </footer>
  </div>;
}

export function HelpPage() {
  const [draftOpened, setDraftOpened] = useState(false);

  function openEmailDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactEmail) return;
    const form = new FormData(event.currentTarget);
    const subject = `Rembr support: ${String(form.get('topic') ?? 'Question')}`;
    const body = [
      `From: ${String(form.get('email') ?? '')}`,
      `Topic: ${String(form.get('topic') ?? 'Question')}`,
      '',
      String(form.get('message') ?? ''),
    ].join('\n');
    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setDraftOpened(true);
  }

  return <PublicFrame current="help">
    <section className="rg-intro">
      <p className="rg-kicker">HELP</p>
      <h1>What can we help you with?</h1>
      <p>Find a quick answer below or write to us about something that is not working as expected.</p>
    </section>

    <section className="rg-help-grid" aria-label="Help topics">
      <article className="rg-help-card"><span className="rg-card-index">01</span><h2>Import and save</h2><p>Use the guides for platform exports. For a one-off save, add a public page URL in your library.</p><a className="rg-text-link" href="/how-to-use">Open the guides <span aria-hidden="true">→</span></a></article>
      <article className="rg-help-card"><span className="rg-card-index">02</span><h2>Search your library</h2><p>Search by title, source, or saved text. AI-assisted results depend on the relevant provider being available.</p><a className="rg-text-link" href="/terms" target="_blank" rel="noopener noreferrer">Read the Terms and Conditions <span aria-hidden="true">→</span></a></article>
      <article className="rg-help-card"><span className="rg-card-index">03</span><h2>AI and media analysis</h2><p>Review the Terms and Conditions to learn which content Rembr processes for AI-assisted features and which providers receive it.</p><a className="rg-text-link" href="/terms" target="_blank" rel="noopener noreferrer">Read the Terms and Conditions <span aria-hidden="true">→</span></a></article>
      <article className="rg-help-card"><span className="rg-card-index">04</span><h2>Profile and account</h2><p>Update your username, profile image, and saving preferences in account settings.</p><a className="rg-text-link" href="/app/settings/profile" target="_blank" rel="noopener noreferrer">Open profile settings <span aria-hidden="true">→</span></a></article>
    </section>

    <section className="rg-support-section" aria-labelledby="rg-support-heading">
      <div className="rg-support-copy"><p className="rg-kicker">CONTACT</p><h2 id="rg-support-heading">Tell us what happened.</h2><p>Include the screen you were on and what you expected to happen. This form opens an email draft in your email app; Rembr does not submit or store it.</p></div>
      <form className="rg-support-form" onSubmit={openEmailDraft}>
        <label htmlFor="rg-support-email">Your email</label>
        <input autoComplete="email" id="rg-support-email" maxLength={254} name="email" placeholder="you@example.com" required type="email" />
        <label htmlFor="rg-support-topic">What is this about?</label>
        <select defaultValue="Import help" id="rg-support-topic" name="topic">
          <option>Import help</option><option>Login or account</option><option>Search results</option><option>AI preferences</option><option>Other</option>
        </select>
        <label htmlFor="rg-support-message">Your message</label>
        <textarea id="rg-support-message" maxLength={1200} minLength={10} name="message" placeholder="What were you trying to do?" required rows={5} />
        <button className="rg-button rg-button-primary" disabled={!contactEmail} type="submit">{draftOpened ? 'Email draft opened' : 'Open email draft'} <span aria-hidden="true">↗</span></button>
        {!contactEmail && <p className="rg-form-note" role="status">Support email is not configured yet. You can still browse the guides above.</p>}
        {draftOpened && <p className="rg-form-note" role="status">Your email app should have opened a draft. Review it before sending.</p>}
      </form>
    </section>
  </PublicFrame>;
}

export function PricingPage() {
  return <PublicFrame current="pricing">
    <section className="rg-intro rg-pricing-intro">
      <p className="rg-kicker">PLANS</p>
      <h1>Pricing details are not published yet.</h1>
      <p>Rembr’s plan and billing details are still being prepared. We’ll explain what each plan includes before asking anyone to choose one.</p>
    </section>
    <section className="rg-pricing-panel" aria-label="Pricing status">
      <div className="rg-pricing-mark" aria-hidden="true">R.</div>
      <div><p className="rg-kicker">REMBR</p><h2>One library for things worth finding again.</h2><p>Explore the product or contact us if you have a question about access. This page does not start a subscription or request payment details.</p></div>
      <div className="rg-pricing-actions"><a className="rg-button rg-button-primary" href="/features">Explore the library <span aria-hidden="true">↗</span></a><a className="rg-text-link" href="/contact">Contact Rembr <span aria-hidden="true">→</span></a></div>
    </section>
  </PublicFrame>;
}

export type LegalPageKind = 'terms' | 'privacy' | 'security' | 'data-deletion' | 'cookies';

const legalTitles: Record<LegalPageKind, string> = {
  terms: 'Terms of service',
  privacy: 'Privacy',
  security: 'Security',
  'data-deletion': 'Data deletion',
  cookies: 'Cookies',
};

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  return <PublicFrame>
    <section className="rg-intro">
      <p className="rg-kicker">REMBR / {legalTitles[kind].toUpperCase()}</p>
      <h1>{legalTitles[kind]}</h1>
      <p>This page is being prepared and is not a published policy yet.</p>
    </section>
    <section className="rg-legal-panel">
      <span className="rg-card-index">{kind === 'security' ? 'SERVICE INFORMATION' : 'IN PREPARATION'}</span>
      <h2>{kind === 'security' ? 'Security details are being reviewed.' : `${legalTitles[kind]} details are being prepared.`}</h2>
      <p>We’ll publish information here after it has been checked against Rembr’s current product behavior. For questions about your account or saved data, contact Rembr.</p>
      <a className="rg-button rg-button-secondary" href="/contact">Contact Rembr <span aria-hidden="true">↗</span></a>
    </section>
  </PublicFrame>;
}
