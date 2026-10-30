import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

type Page = 'home' | 'features' | 'about' | 'contact' | 'help' | 'how-to-use' | 'pricing' | 'terms' | 'privacy' | 'security' | 'data-deletion' | 'cookies' | 'not-found';

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL?.trim();

gsap.registerPlugin(ScrollTrigger, useGSAP);

function pageForPath(path: string): Page {
  const pages: Record<string, Page> = {
    '/': 'home', '/features': 'features', '/about': 'about', '/contact': 'contact',
    '/help': 'help', '/how-to-use': 'how-to-use', '/pricing': 'pricing',
    '/terms': 'terms', '/privacy': 'privacy', '/security': 'security',
    '/data-deletion': 'data-deletion', '/cookies': 'cookies',
  };
  const exactPage = pages[path.replace(/\/$/, '') || '/'];
  if (exactPage) return exactPage;
  return 'not-found';
}

function Brand() {
  return <a className="brand-mark" href="/" aria-label="Rembr home">rembr<span>.</span></a>;
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true" className={diagonal ? 'arrow-mark arrow-mark-diagonal' : 'arrow-mark'}>{diagonal ? '↗' : '→'}</span>;
}

const sourcePlatforms: Array<{ name: string; logo: string; background: string }> = [
  { name: 'Instagram', logo: '/platforms/instagram-download.webp', background: '#fff9d9' },
  { name: 'Pinterest', logo: '/platforms/pinterest-download.png', background: '#ff0000' },
  { name: 'Facebook', logo: '/platforms/facebook.svg', background: '#1877f2' },
  { name: 'LinkedIn', logo: '/platforms/linkedin-download.png', background: '#fff9d9' },
  { name: 'X', logo: '/platforms/x-download.png', background: '#fff' },
];

function RotatingPlatformLogo() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionPreference.matches) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % sourcePlatforms.length), 1400);
    return () => window.clearInterval(timer);
  }, []);

  const platform = sourcePlatforms[activeIndex]!;
  return <span className="platform-ticker" role="img" aria-label={`Platform examples: ${sourcePlatforms.map(({ name }) => name).join(', ')}`}>
    <span className="platform-ticker-icon" key={platform.name} style={{ background: platform.background }}>
      <img className="platform-logo" src={platform.logo} alt="" />
    </span>
  </span>;
}

function SiteHeader({ page }: { page: Page }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function onMenuKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') setMenuOpen(false);
  }

  return <header className="site-header">
    <div className="site-header-inner">
      <Brand />
      <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuOpen((open) => !open)} onKeyDown={onMenuKeyDown}>
        <span>{menuOpen ? 'Close' : 'Menu'}</span><span className="menu-glyph" aria-hidden="true">{menuOpen ? '×' : '＋'}</span>
      </button>
      <nav id="site-nav" className={menuOpen ? 'site-nav is-open' : 'site-nav'} aria-label="Main navigation">
        <a aria-current={page === 'features' ? 'page' : undefined} href="/features" onClick={() => setMenuOpen(false)}>The library</a>
        <a aria-current={page === 'about' ? 'page' : undefined} href="/about" onClick={() => setMenuOpen(false)}>Our point of view</a>
        <a aria-current={page === 'help' ? 'page' : undefined} href="/help" onClick={() => setMenuOpen(false)}>Help</a>
        <a aria-current={page === 'pricing' ? 'page' : undefined} href="/pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
        <a aria-current={page === 'contact' ? 'page' : undefined} href="/contact" onClick={() => setMenuOpen(false)}>Say hello</a>
        <a className="nav-cta" href="/app" onClick={() => setMenuOpen(false)}>Open Rembr <Arrow diagonal/></a>
      </nav>
    </div>
  </header>;
}

function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-main">
      <div className="footer-brand-block"><Brand/><p>A little more room for what matters.</p></div>
      <div className="footer-link-group"><span>EXPLORE</span><a href="/features">The library</a><a href="/how-to-use">How to use Rembr</a><a href="/help">Help</a><a href="/pricing">Pricing</a><a href="/about">Our point of view</a><a href="/contact">Say hello</a></div>
      <div className="footer-link-group"><span>YOUR SPACE</span><a href="/app">Open Rembr</a><a href="/app/settings/profile">Account & settings</a></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} Rembr</span><span>Keep what catches you. Find it when it matters.</span><a href="#top">Back to top ↑</a></div>
    <nav className="footer-policy-links" aria-label="Policies"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/security">Security</a><a href="/data-deletion">Data deletion</a><a href="/cookies">Cookies</a></nav>
  </footer>;
}

function ArchiveScene() {
  return <div className="archive-scene" role="img" aria-label="Illustration of saved ideas collecting into a searchable personal library">
    <div className="archive-sun" data-parallax="sun" aria-hidden="true"><span/><span/><span/></div>
    <div className="archive-orbit archive-orbit-one" data-parallax="orbit" aria-hidden="true"/>
    <div className="archive-orbit archive-orbit-two" data-parallax="orbit" aria-hidden="true"/>
    <div className="archive-paper archive-paper-back" data-hero-art aria-hidden="true">
      <span className="paper-index">FIELD NOTE / 014</span><div className="paper-art-lines"><i/><i/><i/></div><span className="paper-scribble">keep this thought</span>
    </div>
    <div className="archive-paper archive-paper-front" data-hero-art aria-hidden="true">
        <div className="archive-window-top"><span className="window-dots"><i/><i/><i/></span><span>YOUR LIBRARY</span><b>↗</b></div>
      <div className="archive-search"><span>⌕</span><span>Find a thread, a title, a thought…</span><kbd>⌘ K</kbd></div>
      <article className="archive-saved-item">
        <div className="saved-art"><svg viewBox="0 0 100 94" aria-hidden="true"><path d="M0 0h100v94H0z" fill="#FD4D1B"/><path d="M0 66c19-24 32-22 48-3S78 85 100 53v41H0z" fill="#FBE02E"/><circle cx="70" cy="24" r="13" fill="#171411"/><path d="M16 18h24M16 27h16" stroke="#171411" strokeWidth="3" strokeLinecap="round"/></svg></div>
        <div className="saved-copy"><span>ARTICLE · 6 MIN</span><strong>A thought worth coming back to</strong><small>Saved with its source and your notes</small></div>
      </article>
      <div className="archive-tags"><span>IDEAS</span><span>TO READ</span><span>+ 2</span></div>
      <div className="archive-bottomline"><span>01 / SAVED PAGE</span><span className="archive-signal"><i/> READY</span></div>
    </div>
  </div>;
}

function HomePage() {
  return <main id="top">
    <section className="hero-section">
      <div className="hero-grain" aria-hidden="true"/>
      <div className="hero-layout">
        <div className="hero-copy">
          <h1 data-hero-copy>Never lose<br/>a post saved<br/>on <RotatingPlatformLogo/></h1>
          <p className="hero-lede" data-hero-copy>Bring saved posts from Instagram, Pinterest, and X into one library. Save links from Facebook, LinkedIn, or anywhere on the web. Keep the source, add a note, and find it again.</p>
          <div className="hero-actions" data-hero-copy>
            <a className="button button-ink" href="/app">Keep your saved posts <Arrow diagonal/></a>
            <a className="underlined-link" href="#the-idea">See how it works <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <ArchiveScene/>
      </div>
    </section>

    <section className="signal-strip" aria-label="A personal library for things worth remembering">
      <div className="signal-inner"><p>Posts, pins, threads, and links. Together at last.</p></div>
    </section>

    <section className="idea-section" id="the-idea">
      <div className="idea-heading" data-reveal>
        <h2>Later gets<br/>a <span>little crowded.</span></h2>
      </div>
      <div className="idea-aside" data-reveal>
        <p>A tab closes. A link gets buried. Later, the source is hard to find.</p>
        <p className="idea-answer">Save the page with its source and notes. Search for it when you need it.</p>
        <a className="text-link text-link-light" href="/about">Why we're making this <Arrow diagonal/></a>
      </div>
    </section>

    <section className="ritual-section">
      <div className="ritual-header" data-reveal>
        <div><h2>Save it.<br/><span>Shape it.</span><br/>Find it.</h2></div>
      </div>
      <div className="ritual-steps">
        <article className="ritual-step step-capture" data-reveal><span className="step-number">01</span><div className="step-glyph glyph-capture" aria-hidden="true"><span>↘</span><i/><i/><i/></div><div className="step-copy"><h3>Bring over your posts.</h3><p>Import saved-post exports from Instagram, Pinterest, or X. Save a link from anywhere.</p></div><span className="step-thread" aria-hidden="true">······</span></article>
        <article className="ritual-step step-organize" data-reveal><span className="step-number">02</span><div className="step-glyph glyph-organize" aria-hidden="true"><i/><i/><i/><b>✳</b></div><div className="step-copy"><h3>Add your context.</h3><p>Write notes and group related finds.</p></div><span className="step-thread" aria-hidden="true">······</span></article>
        <article className="ritual-step step-return" data-reveal><span className="step-number">03</span><div className="step-glyph glyph-return" aria-hidden="true"><span>⌕</span><i/><i/></div><div className="step-copy"><h3>Find it again.</h3><p>Search your library and open the source.</p></div></article>
      </div>
    </section>

    <section className="constellation-section">
      <div className="constellation-copy" data-reveal><h2>Good ideas<br/>have <span>neighbors.</span></h2><p>Collections and connections bring related finds together.</p><a className="button button-yellow" href="/features">Meet your library <Arrow diagonal/></a></div>
      <div className="constellation-art" data-parallax="constellation" aria-label="An abstract map connecting saved ideas" role="img">
        <svg viewBox="0 0 520 460" aria-hidden="true"><path className="constellation-line" d="M75 104C143 107 158 169 221 173S329 88 411 126M81 315c77-9 84-81 149-91s103 93 193 83M221 173c-9 49 5 89 9 131m-9-131c79 13 100 24 161 60"/><circle cx="75" cy="104" r="9"/><circle cx="411" cy="126" r="9"/><circle cx="81" cy="315" r="9"/><circle cx="423" cy="307" r="9"/><circle cx="221" cy="173" r="18"/><circle cx="230" cy="304" r="12"/><circle cx="382" cy="233" r="12"/></svg>
        <div className="constellation-note note-center"><span>ONE IDEA</span><b>Making room<br/>to think</b><small>3 saved things nearby</small></div>
        <div className="constellation-note note-top"><span>ARTICLE</span><b>Attention is a<br/>quiet practice</b></div>
        <div className="constellation-note note-bottom"><span>YOUR NOTE</span><b>Come back to<br/>this on Friday</b></div>
        <span className="constellation-tag tag-one">FOCUS</span><span className="constellation-tag tag-two">READ LATER</span>
      </div>
      <div className="constellation-orbit" aria-hidden="true"/>
    </section>

    <section className="control-section">
      <div className="control-intro" data-reveal><h2>Helpful tools.<br/><span>Your call.</span></h2><p>Review anything that would act outside your library before it happens.</p></div>
      <div className="control-panel" data-reveal>
        <div className="control-panel-head"><span>Review before sharing</span><span className="action-state">DRAFT</span></div>
        <div className="control-action"><span className="action-icon">↗</span><div><b>Share a reading list</b><small>3 saved pages</small></div></div>
        <div className="control-buttons" aria-hidden="true"><span className="review-button">Review details</span><span className="approve-button">Approve <Arrow/></span></div>
      </div>
      <span className="control-side-note" aria-hidden="true">A LITTLE SPACE<br/>TO THINK FIRST</span>
    </section>

    <section className="kept-section">
      <div className="kept-stamp" aria-hidden="true">✳</div>
      <div className="kept-copy" data-reveal><h2>Your thoughts.<br/><span>Your context.</span><br/>Your way.</h2><p>Sources and notes stay with what you save. Export or manage your data when you need to.</p><a className="text-link" href="/features">Explore the details <Arrow diagonal/></a></div>
      <div className="kept-list" data-reveal><div><span>01</span><b>Sources stay connected</b><i>↗</i></div><div><span>02</span><b>Your notes keep their place</b><i>✳</i></div><div><span>03</span><b>Controls stay within reach</b><i>⌘</i></div></div>
    </section>

    <section className="faq-section">
      <div className="faq-intro" data-reveal><h2>Questions,<br/><span>answered.</span></h2></div>
      <div className="faq-list" data-reveal>
        <details><summary>Can I bring in posts I already saved?<span>＋</span></summary><p>Yes. Import saved-post exports from Instagram, Pinterest, and X. You can also save a public link from Facebook, LinkedIn, or another site.</p></details>
        <details><summary>How do I find a saved page?<span>＋</span></summary><p>Search your library or browse your collections. Answers about your library link back to the saved sources they use.</p></details>
        <details><summary>Will Rembr take action for me?<span>＋</span></summary><p>No action reaches another service without your approval. Review it first, then choose whether to continue.</p></details>
        <details><summary>Can I export or delete my library?<span>＋</span></summary><p>Yes. Review what will be included before you confirm an export or deletion.</p></details>
        <details><summary>Will every page save perfectly?<span>＋</span></summary><p>No. Some sites limit what Rembr can read. When a page is incomplete, its source link stays available.</p></details>
      </div>
    </section>

    <section className="final-call" data-reveal><div className="final-call-sun" aria-hidden="true"/><h2>Keep the spark.<br/><span>Find the thread.</span></h2><a className="button button-ink" href="/app">Start your library <Arrow diagonal/></a></section>
  </main>;
}

function PageHero({ title, accent, description }: { title: ReactNode; accent?: string; description: string }) {
  return <section className="subpage-hero" data-reveal><h1>{title}{accent && <><br/><span>{accent}</span></>}</h1><p>{description}</p><a className="button button-ink" href="/app">Open Rembr <Arrow diagonal/></a><span className="subpage-asterisk" aria-hidden="true">✳</span></section>;
}

function FeaturesPage() {
  return <main id="top" className="subpage-main">
    <PageHero title={<>Your saved posts,<br/>all in one</>} accent="place." description="Bring posts in from Instagram, Pinterest, and X. Save links from anywhere else. Keep the source beside your notes."/>
    <section className="feature-story feature-story-yellow" data-reveal><div className="feature-story-number">01</div><div className="feature-story-copy"><h2>Bring in the posts you saved.</h2><p>Import Instagram, Pinterest, and X saved-post exports, or save a public page link directly.</p></div><div className="feature-story-art capture-art" aria-hidden="true"><span>POST</span><i>↘</i><b>KEPT</b></div></section>
    <section className="feature-story feature-story-orange" data-reveal><div className="feature-story-number">02</div><div className="feature-story-copy"><h2>Keep related things together.</h2><p>Add notes, tags, or collections to shape your library.</p></div><div className="feature-story-art connect-art" aria-hidden="true"><span>IDEA</span><i/><i/><i/><b>THREAD</b></div></section>
    <section className="feature-story feature-story-ink" data-reveal><div className="feature-story-number">03</div><div className="feature-story-copy"><h2>Find the page you need.</h2><p>Search what you saved. Ask questions and follow answers to their sources.</p></div><div className="feature-story-art return-art" aria-hidden="true"><span>⌕</span><b>FOUND<br/>AGAIN</b></div></section>
    <section className="feature-trust" data-reveal><h2>You stay in control.</h2><p>Review an external action before it runs. Approve it when you're ready.</p><a className="underlined-link" href="/about">How Rembr handles actions <span aria-hidden="true">↗</span></a></section>
    <section className="feature-limit" data-reveal><p>Some sites limit what Rembr can save. External actions always need your approval.</p><a href="/contact">Ask us a question <Arrow diagonal/></a></section>
  </main>;
}

function AboutPage() {
  return <main id="top" className="subpage-main about-main">
    <PageHero title={<>We save the post.<br/>We remember</>} accent="why it mattered." description="A home for saved posts, useful links, and the context you want to keep."/>
    <section className="about-statement" data-reveal><p>“Later” should be a place you can return to.</p><span aria-hidden="true">✳</span></section>
    <section className="about-columns"><article data-reveal><h2>Keep what caught your attention.</h2><p>Bring in posts from Instagram, Pinterest, or X. Save a public link from anywhere else.</p></article><article data-reveal><h2>Come back with the context.</h2><p>Keep the original source. Add your own notes, organize related finds, and search your library when you need them.</p></article></section>
    <section className="about-manifesto" data-reveal><h2>Keep the source.<br/>Keep your context.</h2><a className="button button-yellow" href="/app">Open your library <Arrow diagonal/></a></section>
  </main>;
}

function ContactPage() {
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactEmail) return;
    const form = new FormData(event.currentTarget);
    const subject = encodeURIComponent(String(form.get('subject') ?? 'A note about Rembr'));
    const message = encodeURIComponent(`From: ${String(form.get('email') ?? '')}\n\n${String(form.get('message') ?? '')}`);
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${message}`;
    setSent(true);
  }

  return <main id="top" className="subpage-main contact-main">
    <PageHero title={<>A note can<br/>start a</>} accent="good thing." description="Questions or feedback about Rembr? Send us a note."/>
    <section className="contact-layout" data-reveal><div className="contact-note"><span>✳</span><h2>What were you trying to do?</h2><p>This opens a draft in your email app. Rembr does not send or store your message.</p><a className="text-link" href="/app">Account help <Arrow diagonal/></a></div>
      <form onSubmit={submit} className="contact-form"><div className="form-heading"><span>Write to Rembr</span></div><label htmlFor="contact-email">Your email</label><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/><label htmlFor="contact-subject">What is this about?</label><select id="contact-subject" name="subject" defaultValue="Feedback"><option>Feedback</option><option>Account help</option><option>Something is not working</option><option>Other</option></select><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" required minLength={10} maxLength={3000} rows={5} placeholder="What happened?"/><button className="button button-ink" type="submit" disabled={!contactEmail}>{sent ? 'Draft opened' : 'Open email draft'} <Arrow diagonal/></button>{!contactEmail && <p className="contact-config-note">Contact email is not set up yet.</p>}</form>
    </section>
  </main>;
}

const howToSteps = [
  { title: 'Bring in a link or export', body: <>Use <a href="/app/add">Add</a> to save a public URL, or upload an export in <a href="/app/imports">Imports</a>. Review the files you select before submitting.</> },
  { title: 'Add your context', body: <>Open an item to edit details, write a note, assign tags, or add it to a collection. Your notes stay attached to the saved item.</> },
  { title: 'Find it again', body: <>Search your library or browse tags and collections. Open a result to revisit its saved details and original source link.</> },
  { title: 'Manage your account', body: <>Settings includes profile and privacy controls, account data information, export requests, and account deletion. AI processing has separate controls and remains optional.</> },
];

function HelpPage() {
  return <main id="top" className="subpage-main public-info-main">
    <PageHero title={<>A little help<br/>finding your</>} accent="way around." description="Answers about bringing saved posts into Rembr, organizing them, and managing your account."/>
    <section className="public-info-section" aria-labelledby="help-title"><h2 id="help-title">Common questions</h2><div className="faq-list">
      <details><summary>How do I bring in saved posts?<span aria-hidden="true">+</span></summary><p>Open <a href="/app/imports">Imports</a> and upload a supported export file you requested from a platform. You can also <a href="/app/add">save a public link</a> directly.</p></details>
      <details><summary>Where can I find something I saved?<span aria-hidden="true">+</span></summary><p>Use library search or browse tags and collections. Open an item to see its source link and notes.</p></details>
      <details><summary>Can Rembr access private posts?<span aria-hidden="true">+</span></summary><p>Rembr imports files that you choose to upload and saves links you submit. A saved link does not grant access to content its source platform keeps private.</p></details>
      <details><summary>How do I export or delete account data?<span aria-hidden="true">+</span></summary><p>Open <a href="/app/settings/profile">Settings</a> to review account data, request an export, or start deletion. Deletion may need processing before it completes.</p></details>
      <details><summary>Why is an imported item incomplete?<span aria-hidden="true">+</span></summary><p>Export formats and websites vary. Rembr may not retrieve every post or media file, but the source link remains available when provided.</p></details>
    </div></section>
    <section className="public-info-callout"><h2>Still looking for an answer?</h2><p>Contact opens a message draft in your email app; it does not send or store your message.</p><a className="button button-ink" href="/contact">Contact Rembr <Arrow diagonal/></a></section>
  </main>;
}

function HowToUsePage() {
  return <main id="top" className="subpage-main public-info-main">
    <PageHero title={<>Save it now.<br/>Find it</>} accent="when it matters." description="A practical guide to importing, organizing, and finding things in your Rembr library."/>
    <section className="public-info-section" aria-labelledby="how-to-title"><h2 id="how-to-title">Your library, step by step</h2><ol className="public-info-steps">{howToSteps.map(({ title, body }, index) => <li key={title}><span className="public-info-step-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol></section>
    <section className="feature-limit"><p>Browser extensions and connected workflows are deferred. Save a link directly in Rembr or import a supported platform export.</p><a href="/help">Read help <Arrow diagonal/></a></section>
  </main>;
}

type InfoSection = { title: string; body: ReactNode };
type InfoContent = { title: ReactNode; accent: string; description: string; heading: string; sections: InfoSection[] };

const publicInfo: Partial<Record<Page, InfoContent>> = {
  pricing: { title: <>A place for<br/>what you</>, accent: 'keep.', description: 'Rembr billing and paid plans are not enabled yet. There are no paid plans available to purchase right now.', heading: 'Current availability', sections: [
    { title: 'No checkout is available', body: <>Use the Rembr features currently enabled in your account. Plan details will appear here if billing is approved and made available.</> },
    { title: 'Credits are not for sale', body: <>Credit purchases and paid entitlements are disabled. This page does not create a purchase or credit balance.</> },
    { title: 'Need help?', body: <>Visit <a href="/help">Help</a> or use <a href="/contact">Contact Rembr</a>.</> },
  ] },
  terms: { title: <>Using Rembr<br/>with care</>, accent: 'and context.', description: 'These service notes describe current product boundaries. They are not a complete set of contractual terms.', heading: 'Service notes', sections: [
    { title: 'Your library', body: <>Rembr helps organize links, imported records, and notes you choose to add. You are responsible for having permission to upload and use the material you provide.</> },
    { title: 'Third-party services', body: <>Source platforms control their services, content, and access rules. Rembr cannot guarantee that a link will remain available or that every page can be retrieved.</> },
    { title: 'Connected workflows', body: <>Browser extensions and connected workflows are deferred and are not currently available through Rembr.</> },
    { title: 'Questions', body: <>Visit <a href="/help">Help</a> or <a href="/contact">Contact Rembr</a>.</> },
  ] },
  privacy: { title: <>Your library.<br/>Your</>, accent: 'choices.', description: 'A plain-language summary of account data and privacy controls currently available in Rembr.', heading: 'Data and controls', sections: [
    { title: 'Information in your account', body: <>Rembr stores account and profile details, saved items, imports, notes, and related organization data needed to provide your library. The account data map in Settings shows categories and counts Rembr can report.</> },
    { title: 'Optional processing', body: <>AI-assisted features have separate opt-in controls. When enabled and used, relevant text or images may be sent to the provider described in Settings. You can turn these controls off.</> },
    { title: 'Export and deletion', body: <>Settings lets you request an export or account deletion. Some cleanup is processed asynchronously. See <a href="/data-deletion">Data deletion</a> for current details.</> },
    { title: 'Retention and providers', body: <>Session, activity, and export cleanup have configured limits. Retention for backups, deletion audit records, and some provider-held copies is still being finalized; this page does not promise their immediate removal.</> },
  ] },
  security: { title: <>Built around<br/>careful</>, accent: 'boundaries.', description: 'Rembr applies account checks and operational safeguards to protect private library data.', heading: 'How access is handled', sections: [
    { title: 'Private account access', body: <>Account and library operations are scoped to the signed-in owner. Administrative support tools use limited roles and record privileged actions.</> },
    { title: 'Private files', body: <>Account exports and uploaded assets use private storage paths with owner checks. Export downloads are time-limited.</> },
    { title: 'Report a concern', body: <>If you think your account may be at risk, sign out of shared devices, update your credentials, and contact Rembr. Do not include passwords or secret keys.</> },
    { title: 'Verification status', body: <>Hosted database, storage, and browser checks remain part of the release gate; this page does not claim those checks have passed.</> },
  ] },
  'data-deletion': { title: <>Your data.<br/>Your</>, accent: 'decision.', description: 'Review account data, request an export, or start account deletion from Settings.', heading: 'Requesting deletion', sections: [
    { title: 'Start from Settings', body: <>Open <a href="/app/settings/profile">Settings</a> and use the account deletion controls. A pending request freezes account activity.</> },
    { title: 'Cancel or continue', body: <>You can cancel a pending request where the control is available. Approved deletion is processed in steps and can be retried if storage cleanup fails.</> },
    { title: 'Removal boundaries', body: <>The workflow removes account-owned records and associated stored files it can identify. Retention for some audit records, backups, and provider-held copies remains subject to their policies and is still being finalized.</> },
    { title: 'Need assistance?', body: <>Visit <a href="/help">Help</a> or <a href="/contact">Contact Rembr</a>.</> },
  ] },
  cookies: { title: <>A small note<br/>about</>, accent: 'cookies.', description: 'Rembr uses a session cookie to recognize your signed-in account.', heading: 'Browser storage', sections: [
    { title: 'Signed-in session', body: <>The server sets an HttpOnly session cookie and expires sessions after their configured lifetime. The browser does not expose the cookie to page scripts.</> },
    { title: 'Manage browser data', body: <>You can clear cookies and site data in your browser. Clearing the Rembr session cookie signs you out.</> },
    { title: 'Other cookies', body: <>The current application code does not set analytics or advertising cookies. This statement should be checked against the deployed configuration before release.</> },
  ] },
};

function InfoPage({ page }: { page: Page }) {
  const content = publicInfo[page];
  if (!content) return null;
  return <main id="top" className="subpage-main public-info-main">
    <PageHero title={content.title} accent={content.accent} description={content.description}/>
    <section className="public-info-section" aria-labelledby="public-info-heading"><h2 id="public-info-heading">{content.heading}</h2><div className="public-info-cards">{content.sections.map(({ title, body }) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="public-info-callout"><h2>Manage your Rembr account</h2><p>Open Settings to review available controls and current account information.</p><a className="button button-ink" href="/app/settings/profile">Open Settings <Arrow diagonal/></a></section>
  </main>;
}

function NotFoundPage() {
  return <main id="top" className="subpage-main public-info-main"><PageHero title={<>That page<br/>isn't</>} accent="here." description="The link may have moved, or the address may be mistyped."/><section className="public-info-callout"><h2>Find your way back</h2><p>Visit the Rembr home page or browse the library guide.</p><a className="button button-ink" href="/">Rembr home <Arrow diagonal/></a></section></main>;
}

export function MarketingSite() {
  const page = pageForPath(window.location.pathname);
  const siteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const titles: Record<Page, string> = { home: 'Rembr: Keep Instagram, Pinterest & X (Twitter) saves', features: 'Bring your saved posts together | Rembr', about: 'Why Rembr keeps your saved posts together | Rembr', contact: 'Contact Rembr | Questions and feedback', help: 'Help with Rembr | Imports, library and account', 'how-to-use': 'How to use Rembr | Save, organize and find', pricing: 'Pricing and availability | Rembr', terms: 'Service terms and scope | Rembr', privacy: 'Privacy and account data | Rembr', security: 'Security at Rembr', 'data-deletion': 'Account data export and deletion | Rembr', cookies: 'Cookies and browser storage | Rembr', 'not-found': 'Page not found | Rembr' };
    const descriptions: Record<Page, string> = {
      home: 'Import saved Instagram, Pinterest, and X (Twitter) posts into one library. Save links from Facebook, LinkedIn, and across the web, then add notes and find them again.',
      features: 'Bring saved posts in from Instagram, Pinterest, and X. Save other links, add context, and search your library.',
      about: 'Rembr brings your saved posts and links into one place. Keep the source, add context, and find them again.',
      contact: 'Contact Rembr with a question, account issue, or product feedback.',
      help: 'Get help with Rembr imports, saved items, account settings, exports, and deletion.',
      'how-to-use': 'Learn how to import, organize, search, and manage your Rembr library.',
      pricing: 'See current Rembr pricing and billing availability.',
      terms: 'Read service scope notes for Rembr and third-party source links.',
      privacy: 'Learn about Rembr account data, optional processing, export, and deletion controls.',
      security: 'Learn how Rembr scopes account access and handles private files.',
      'data-deletion': 'Learn how to request an export or account deletion in Rembr.',
      cookies: 'Learn about Rembr session cookies and browser storage.',
      'not-found': 'The requested Rembr page could not be found.',
    };
    document.title = titles[page];
    document.querySelector('meta[name="description"]')?.setAttribute('content', descriptions[page]);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#FBE02E');
  }, [page]);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 900px)',
    }, (context) => {
      const { motion, desktop } = context.conditions as { motion: boolean; desktop: boolean };
      if (!motion) return;

      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      intro.from('[data-hero-copy]', { y: 28, autoAlpha: 0, duration: 0.72, stagger: 0.1 })
        .from('[data-hero-art]', { y: 24, autoAlpha: 0, rotate: -3, duration: 0.9, stagger: 0.08 }, '-=0.48');

      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
        gsap.fromTo(element, { y: 24, autoAlpha: 0 }, {
          y: 0,
          autoAlpha: 1,
          duration: 0.75,
          ease: 'power3.out',
          immediateRender: false,
          scrollTrigger: { trigger: element, start: 'top 88%', once: true },
        });
      });

      if (desktop) {
        gsap.to('[data-parallax="sun"]', {
          yPercent: 9,
          rotate: 8,
          ease: 'none',
          scrollTrigger: { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 0.8 },
        });
        gsap.to('[data-parallax="constellation"]', {
          y: -24,
          ease: 'none',
          scrollTrigger: { trigger: '.constellation-section', start: 'top bottom', end: 'bottom top', scrub: 1 },
        });
      }
    });
    return () => media.revert();
  }, { scope: siteRef });

  return <div ref={siteRef} className="marketing-site">
    <SiteHeader page={page}/>
    {page === 'features' ? <FeaturesPage/> : page === 'about' ? <AboutPage/> : page === 'contact' ? <ContactPage/> : page === 'help' ? <HelpPage/> : page === 'how-to-use' ? <HowToUsePage/> : page === 'home' ? <HomePage/> : page === 'not-found' ? <NotFoundPage/> : <InfoPage page={page}/>}
    <SiteFooter/>
  </div>;
}
