import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

type Page = 'home' | 'features' | 'about' | 'contact';
const contactEmail = import.meta.env.VITE_CONTACT_EMAIL?.trim();

function pageForPath(path: string): Page {
  if (path.startsWith('/features')) return 'features';
  if (path.startsWith('/about')) return 'about';
  if (path.startsWith('/contact')) return 'contact';
  return 'home';
}

function Brand() {
  return <a className="ice-brand" href="/" aria-label="Rembr home">rembr<span>.</span></a>;
}

function Header({ page }: { page: Page }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <><div className="ice-promo"><span>A softer internet, one saved page at a time.</span><a href="/features">See how Rembr works <b aria-hidden="true">↗</b></a></div><header className="ice-header"><div className="ice-header-inner"><Brand />
    <button className="ice-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="ice-nav" onClick={() => setMenuOpen(!menuOpen)}><span>{menuOpen ? 'Close' : 'Menu'}</span><b aria-hidden="true">{menuOpen ? '×' : '☰'}</b></button>
    <nav id="ice-nav" className={menuOpen ? 'ice-nav is-open' : 'ice-nav'} aria-label="Main navigation">
      <a aria-current={page === 'features' ? 'page' : undefined} href="/features">What it does</a><a aria-current={page === 'about' ? 'page' : undefined} href="/about">Our approach</a><a aria-current={page === 'contact' ? 'page' : undefined} href="/contact">Contact</a><a className="ice-nav-cta" href="/app">Open your library <span aria-hidden="true">↗</span></a>
    </nav>
  </div></header></>;
}

function Footer() {
  return <footer className="ice-footer"><div className="ice-footer-main"><div><Brand /><p>A softer place for the good things you find online.</p></div><div className="ice-footer-links"><a href="/features">What it does</a><a href="/about">Our approach</a><a href="/contact">Contact</a><a href="/app">Open your library</a></div></div><div className="ice-footer-bottom"><span>© {new Date().getFullYear()} Rembr</span><span>Made for the things you want to find again.</span></div></footer>;
}

function CookieIllustration() {
  return <div className="scoop-scene" aria-label="Illustration of a saved page tucked into a colorful library" role="img"><div className="scoop-orbit scoop-orbit-one"/><div className="scoop-orbit scoop-orbit-two"/><div className="scoop-sticker sticker-pistachio">KEEP<br />THIS</div><div className="scoop-card scoop-card-back"><span className="scoop-label">A LITTLE NOTE</span><i/><i/><i/></div><div className="scoop-card scoop-card-front"><div className="scoop-card-top"><span>REMEMBER THIS</span><span>↗</span></div><div className="scoop-card-scoop"><span>✳</span></div><small>YOUR SAVED WEB</small><strong>Good things<br />worth keeping.</strong><div className="scoop-card-lines"><i/><i/><i/></div></div><div className="scoop-sticker sticker-cherry">FIND IT<br />LATER ↗</div></div>;
}

function FeatureCard({ number, title, copy, tone }: { number: string; title: string; copy: string; tone: string }) {
  return <article className={`ice-feature ${tone}`}><span className="ice-feature-number">{number}</span><span className="ice-feature-mark" aria-hidden="true">✳</span><h3>{title}</h3><p>{copy}</p></article>;
}

const faqItems = [
  {
    question: 'Okay, what can I actually save?',
    answer: 'A public page or article with an HTTP or HTTPS link. Paste it into your library and Rembr will try to keep a readable copy, with the original link close by.',
  },
  {
    question: 'Will it work on every website?',
    answer: 'We wish! Some sites block automated requests or do not expose much readable text. If a page cannot be processed, Rembr shows a failure and keeps the source link with your saved item.',
  },
  {
    question: 'Can I search the whole article later?',
    answer: 'Not yet. Search currently checks saved page titles and URLs. You can still open the readable text for a page you saved.',
  },
  {
    question: 'Does Rembr summarize pages with AI?',
    answer: 'Not right now. Rembr saves a readable copy of the page; AI summaries and ask-your-library search are not part of this version.',
  },
  {
    question: 'Can I save something behind a login or paywall?',
    answer: 'No. Rembr only processes public pages and does not sign in to websites or fetch paywalled content.',
  },
  {
    question: 'So, how much does it cost?',
    answer: 'Pricing has not been announced for this early build. We will share the details once the plan is set.',
  },
];

function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(0);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % faqItems.length;
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + faqItems.length) % faqItems.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = faqItems.length - 1;
    if (nextIndex !== undefined) {
      event.preventDefault();
      document.getElementById(`ice-faq-trigger-${nextIndex}`)?.focus();
    }
  }

  return <div className="ice-faq-list">
    {faqItems.map((item, index) => {
      const isOpen = openIndex === index;
      const triggerId = `ice-faq-trigger-${index}`;
      const panelId = `ice-faq-panel-${index}`;
      return <article className={`ice-faq-item${isOpen ? ' is-open' : ''}`} key={item.question}>
        <h3><button id={triggerId} className="ice-faq-trigger" type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenIndex(isOpen ? -1 : index)} onKeyDown={(event) => handleKeyDown(event, index)}>
          <span>{item.question}</span><span className="ice-faq-icon" aria-hidden="true">+</span>
        </button></h3>
        <div id={panelId} className="ice-faq-panel" role="region" aria-labelledby={triggerId} aria-hidden={!isOpen} inert={!isOpen}>
          <div className="ice-faq-answer"><p>{item.answer}</p></div>
        </div>
      </article>;
    })}
  </div>;
}

function HomePage() {
  return <>
    <main>
      <section className="ice-hero"><div className="ice-hero-copy"><p className="ice-eyebrow"><span/>A calm home for your open tabs</p><h1>Keep <span className="keyword-mark keyword-yellow">good</span> stuff.<br/>Find it again.</h1><p className="ice-hero-lede">Save a public page once. Come back to a clean, readable copy with the original link right there.</p><div className="ice-hero-actions"><a className="ice-button ice-button-dark" href="/app">Make your library <span aria-hidden="true">↗</span></a><a className="ice-text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a></div><p className="ice-hero-note"><span aria-hidden="true">✳</span> Made for pages you want to come back to.</p></div><CookieIllustration/><div className="ice-scroll-hint" aria-hidden="true">SCROLL A LITTLE <span>↓</span></div></section>
      <section className="ice-marquee" aria-label="Things you can save"><div aria-hidden="true">ARTICLES <span>✳</span> IDEAS <span>✳</span> RECIPES <span>✳</span> RESEARCH <span>✳</span> GOOD READS <span>✳</span> ARTICLES <span>✳</span> IDEAS <span>✳</span> RECIPES <span>✳</span> RESEARCH <span>✳</span> GOOD READS <span>✳</span></div></section>
      <section className="ice-section ice-why" id="how-it-works"><div className="ice-section-intro"><p className="ice-eyebrow"><span/>A small ritual for the internet</p><h2>Save now.<br/>Read on your <span className="keyword-mark keyword-mint">time.</span></h2><p>Rembr gives useful public pages a place to wait for you, without asking you to keep a dozen tabs open.</p></div><div className="ice-steps"><article><span>01</span><div><h3>Drop in a link</h3><p>Paste a public web page or article into your library.</p></div><b aria-hidden="true">↗</b></article><article><span>02</span><div><h3>Let it settle</h3><p>Rembr saves the page and prepares a readable copy.</p></div><b aria-hidden="true">✳</b></article><article><span>03</span><div><h3>Find your way back</h3><p>Search by title or URL, then open the saved text or original source.</p></div><b aria-hidden="true">⌕</b></article></div></section>
      <section className="ice-section ice-feature-band"><div className="ice-section-heading"><div><p className="ice-eyebrow"><span/>The useful bits</p><h2>Less tab juggling.<br/>More room to <span className="keyword-mark keyword-pink">think.</span></h2></div><a className="ice-text-link" href="/features">Explore the details <span aria-hidden="true">↗</span></a></div><div className="ice-feature-grid"><FeatureCard number="01 / SAVE" title="One place to put it" copy="Keep a personal list of public pages you want to revisit." tone="feature-peach"/><FeatureCard number="02 / READ" title="A clearer copy" copy="Open the readable text Rembr extracted, with the source link beside it." tone="feature-lilac"/><FeatureCard number="03 / FIND" title="Search what you saved" copy="Look through saved pages by their title or web address." tone="feature-green"/></div></section>
      <section className="ice-truth"><div className="ice-truth-mark" aria-hidden="true">✳</div><div><p className="ice-eyebrow"><span/>Small and honest, on purpose</p><h2>Just the <span className="keyword-mark keyword-pink">useful</span> part<br/>of saving for later.</h2><p>Today, Rembr works with public web pages. It is not a bulk crawler, it does not access private or paywalled pages, and it does not promise perfect extraction on every site.</p><a className="ice-text-link" href="/about">What we are building (and not building) <span aria-hidden="true">↗</span></a></div><aside><span>RIGHT NOW</span><strong>Public pages<br/>in. Readable copies<br/>back out.</strong><i aria-hidden="true">↗</i></aside></section>
      <section className="ice-faq" aria-label="Frequently asked questions"><div><p className="ice-eyebrow"><span/>The questions in your tabs</p><h2><span className="keyword-mark keyword-yellow">Good</span> to know.</h2><p>Real answers about what Rembr can do today.</p></div><FaqAccordion/></section>
      <section className="ice-last-call"><p className="ice-eyebrow"><span/>Your next good read is waiting</p><h2>Give the tabs<br/>a little <span className="keyword-mark keyword-yellow">break.</span></h2><a className="ice-button ice-button-dark" href="/app">Start a library <span aria-hidden="true">↗</span></a><p>No feeds to catch up on. Just the pages you chose to keep.</p></section>
    </main>
  </>;
}

function FeaturesPage() {
  return <main className="ice-subpage"><section className="ice-subhero"><p className="ice-eyebrow"><span/>What Rembr does today</p><h1>Keep a <span className="keyword-mark keyword-yellow">readable</span><br/>piece of the web.</h1><p>Rembr is an early, focused way to save a public page and return to its text later.</p><a className="ice-button ice-button-dark" href="/app">Open your library <span aria-hidden="true">↗</span></a></section><section className="ice-feature-grid ice-feature-grid-page"><FeatureCard number="01 / CAPTURE" title="Save a public page" copy="Add an HTTP or HTTPS URL from your library. Rembr checks and processes the page in the background." tone="feature-peach"/><FeatureCard number="02 / READ" title="Keep the source nearby" copy="See the extracted title and readable text together with a link back to the original page." tone="feature-lilac"/><FeatureCard number="03 / SEARCH" title="Find by title or URL" copy="Search the pages you saved by their title or address." tone="feature-green"/><FeatureCard number="04 / YOUR ACCOUNT" title="A private library" copy="Your saved items are associated with your signed-in account. Sign out when you are done." tone="feature-blue"/></section><section className="ice-limitations"><p className="ice-eyebrow"><span/>A clear first version</p><h2>What Rembr does not do yet</h2><div className="ice-limit-list"><p><b>It only captures public pages.</b> It does not sign in to websites or access content behind a paywall.</p><p><b>It is not a bulk crawler.</b> Each page is saved when you choose to submit its URL.</p><p><b>Extraction can vary by page.</b> Some sites block automated requests or do not expose readable text.</p><p><b>No AI search, browser extension, or automation is advertised here.</b> Those capabilities are not part of the current product experience.</p></div></section></main>;
}

function AboutPage() {
  return <main className="ice-subpage"><section className="ice-subhero about-subhero"><p className="ice-eyebrow"><span/>Our approach</p><h1>The <span className="keyword-mark keyword-yellow">internet</span> is full<br/>of “save for later.”</h1><p>Rembr is for the smaller, more human version of that promise: save a public page you chose, keep a readable copy, and make it easier to find again.</p></section><section className="ice-about-columns"><article><span className="ice-about-stamp">WE ARE</span><h2>A personal reading shelf.</h2><p>A focused place for public articles and pages you deliberately keep. A library with the original source close by, and a simple search by title or URL.</p></article><article><span className="ice-about-stamp stamp-not">WE ARE NOT</span><h2>A crawler or a magic archive.</h2><p>Rembr does not collect pages in bulk, bypass sign-in, or promise that every site will extract cleanly. It is an early product, and its current scope is deliberately narrow.</p></article></section><section className="ice-about-note"><span>OUR NORTH STAR</span><p>Make it easier to return to something you found meaningful, without turning “later” into another feed.</p></section></main>;
}

function ContactPage() {
  const [sent, setSent] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactEmail) return;
    const form = new FormData(event.currentTarget);
    const subject = encodeURIComponent(String(form.get('subject') ?? 'A note about Rembr'));
    const message = encodeURIComponent(`From: ${String(form.get('email') ?? '')}\n\n${String(form.get('message') ?? '')}`);
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${message}`;
    setSent(true);
  };
  return <main className="ice-subpage contact-page"><section className="ice-subhero"><p className="ice-eyebrow"><span/>A note is always welcome</p><h1>Say <span className="keyword-mark keyword-pink">hello.</span></h1><p>Questions, useful feedback, or a page Rembr should handle better? Send a note and tell us what happened.</p></section><section className="ice-contact-card"><div className="ice-contact-aside"><span className="ice-contact-spark" aria-hidden="true">✳</span><h2>Help us make<br/>“later” better.</h2><p>We read product feedback closely. For account access, open your library and sign in with the email you registered.</p><a href="/app" className="ice-text-link">Go to Rembr <span aria-hidden="true">↗</span></a></div><form onSubmit={submit} className="ice-contact-form"><label htmlFor="contact-email">Your email</label><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/><label htmlFor="contact-subject">What is this about?</label><select id="contact-subject" name="subject" defaultValue="Feedback"><option>Feedback</option><option>Account help</option><option>Something is not working</option><option>Other</option></select><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" required minLength={10} maxLength={3000} rows={5} placeholder="A little context helps us understand…"/><button className="ice-button ice-button-dark" type="submit" disabled={!contactEmail}>{sent ? 'Email draft opened' : 'Write your message'} <span aria-hidden="true">↗</span></button>{!contactEmail && <p className="contact-config-note">The contact form is ready, but a support address has not been configured yet.</p>}</form></section></main>;
}

export function MarketingSite() {
  const page = pageForPath(window.location.pathname);
  useEffect(() => {
    const titles: Record<Page, string> = { home: 'Rembr — Keep the good stuff', features: 'What Rembr does — Rembr', about: 'Our approach — Rembr', contact: 'Contact — Rembr' };
    const descriptions: Record<Page, string> = { home: 'A calm, private home for public web pages you want to read again.', features: 'Save a public page, keep a readable copy and search your Rembr library.', about: 'What Rembr is building: a focused personal shelf for public pages you want to revisit.', contact: 'Send the Rembr team a question or product note.' };
    document.title = titles[page];
    document.querySelector('meta[name="description"]')?.setAttribute('content', descriptions[page]);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#fff9ef');
  }, [page]);
  return <div className="marketing-site"><Header page={page}/>{page === 'features' ? <FeaturesPage/> : page === 'about' ? <AboutPage/> : page === 'contact' ? <ContactPage/> : <HomePage/>}<Footer/></div>;
}
