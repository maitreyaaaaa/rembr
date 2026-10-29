import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

type Page = 'home' | 'features' | 'about' | 'contact';

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL?.trim();

gsap.registerPlugin(ScrollTrigger, useGSAP);

function pageForPath(path: string): Page {
  if (path.startsWith('/features')) return 'features';
  if (path.startsWith('/about')) return 'about';
  if (path.startsWith('/contact')) return 'contact';
  return 'home';
}

function Brand() {
  return <a className="brand-mark" href="/" aria-label="Rembr home">rembr<span>.</span></a>;
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true" className={diagonal ? 'arrow-mark arrow-mark-diagonal' : 'arrow-mark'}>{diagonal ? '↗' : '→'}</span>;
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
      <div className="footer-link-group"><span>EXPLORE</span><a href="/features">The library</a><a href="/about">Our point of view</a><a href="/contact">Say hello</a></div>
      <div className="footer-link-group"><span>YOUR SPACE</span><a href="/app">Open Rembr</a><a href="/app?tab=settings">Account & settings</a></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} Rembr</span><span>Keep what catches you. Find it when it matters.</span><a href="#top">Back to top ↑</a></div>
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
          <h1 data-hero-copy>Keep the<br/><span className="hero-highlight">good stuff.</span><br/>Find it <span className="hero-outline">again.</span></h1>
          <p className="hero-lede" data-hero-copy>Save a page, add what you want to remember, and find it again later.</p>
          <div className="hero-actions" data-hero-copy>
            <a className="button button-ink" href="/app">Start your library <Arrow diagonal/></a>
            <a className="underlined-link" href="#the-idea">See how it works <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <ArchiveScene/>
      </div>
    </section>

    <section className="signal-strip" aria-label="A personal library for things worth remembering">
      <div className="signal-inner"><p>For pages, ideas, and links you mean to revisit.</p></div>
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
        <article className="ritual-step step-capture" data-reveal><span className="step-number">01</span><div className="step-glyph glyph-capture" aria-hidden="true"><span>↘</span><i/><i/><i/></div><div className="step-copy"><h3>Save a page.</h3><p>Import bookmarks from supported services.</p></div><span className="step-thread" aria-hidden="true">······</span></article>
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
        <details><summary>What can I save?<span>＋</span></summary><p>Public pages and bookmarks from supported imports. Add notes or organize them in collections.</p></details>
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
    <PageHero title={<>A place for<br/>the things you</>} accent="want to keep." description="Save useful pages, add context, and find them again in your personal library."/>
    <section className="feature-story feature-story-yellow" data-reveal><div className="feature-story-number">01</div><div className="feature-story-copy"><h2>Save what caught your eye.</h2><p>Save a page or import a supported bookmark. Its original link stays with it.</p></div><div className="feature-story-art capture-art" aria-hidden="true"><span>LINK</span><i>↘</i><b>KEPT</b></div></section>
    <section className="feature-story feature-story-orange" data-reveal><div className="feature-story-number">02</div><div className="feature-story-copy"><h2>Keep related things together.</h2><p>Add notes, tags, or collections to shape your library.</p></div><div className="feature-story-art connect-art" aria-hidden="true"><span>IDEA</span><i/><i/><i/><b>THREAD</b></div></section>
    <section className="feature-story feature-story-ink" data-reveal><div className="feature-story-number">03</div><div className="feature-story-copy"><h2>Find the page you need.</h2><p>Search what you saved. Ask questions and follow answers to their sources.</p></div><div className="feature-story-art return-art" aria-hidden="true"><span>⌕</span><b>FOUND<br/>AGAIN</b></div></section>
    <section className="feature-trust" data-reveal><h2>You stay in control.</h2><p>Review an external action before it runs. Approve it when you're ready.</p><a className="underlined-link" href="/about">How Rembr handles actions <span aria-hidden="true">↗</span></a></section>
    <section className="feature-limit" data-reveal><p>Some sites limit what Rembr can save. External actions always need your approval.</p><a href="/contact">Ask us a question <Arrow diagonal/></a></section>
  </main>;
}

function AboutPage() {
  return <main id="top" className="subpage-main about-main">
    <PageHero title={<>We forget links.<br/>We remember</>} accent="what they meant." description="A personal library for the useful things you find online."/>
    <section className="about-statement" data-reveal><p>“Later” should be a place you can return to.</p><span aria-hidden="true">✳</span></section>
    <section className="about-columns"><article data-reveal><h2>Keep what caught your attention.</h2><p>Save a page with its source and any notes you want to keep.</p></article><article data-reveal><h2>Come back with the context.</h2><p>Search and organize your library. You choose what to save and what to share.</p></article></section>
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

export function MarketingSite() {
  const page = pageForPath(window.location.pathname);
  const siteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const titles: Record<Page, string> = { home: 'Rembr: Save web pages and find them again', features: 'Personal library for saved links | Rembr', about: 'Why Rembr keeps your ideas together | Rembr', contact: 'Contact Rembr | Questions and feedback' };
    const descriptions: Record<Page, string> = {
      home: 'Save useful web pages, keep notes with their sources, and find your saved links again in Rembr, a personal library for the web.',
      features: 'Save pages, organize them with notes and collections, search your library, and return to the sources you kept.',
      about: 'Rembr is a personal library for useful things you find online. Keep the source, add context, and find it again.',
      contact: 'Contact Rembr with a question, account issue, or product feedback.',
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

  return <div ref={siteRef} className="marketing-site" id="top">
    <SiteHeader page={page}/>
    {page === 'features' ? <FeaturesPage/> : page === 'about' ? <AboutPage/> : page === 'contact' ? <ContactPage/> : <HomePage/>}
    <SiteFooter/>
  </div>;
}
