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
      <div className="archive-bottomline"><span>A GOOD THING KEPT</span><span className="archive-signal"><i/> READY WHEN YOU ARE</span></div>
    </div>
  </div>;
}

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <p className={dark ? 'eyebrow eyebrow-dark' : 'eyebrow'}><span aria-hidden="true"/>{children}</p>;
}

function HomePage() {
  return <main id="top">
    <section className="hero-section">
      <div className="hero-grain" aria-hidden="true"/>
      <div className="hero-layout">
        <div className="hero-copy">
          <Eyebrow>YOUR OWN LITTLE CORNER OF THE INTERNET</Eyebrow>
          <h1 data-hero-copy>Keep the<br/><span className="hero-highlight">good stuff.</span><br/>Find it <span className="hero-outline">again.</span></h1>
          <p className="hero-lede" data-hero-copy>Pages, ideas, and useful threads—kept with their context, ready when you need them.</p>
          <div className="hero-actions" data-hero-copy>
            <a className="button button-ink" href="/app">Start your library <Arrow diagonal/></a>
            <a className="underlined-link" href="#the-idea">Take a look <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-footnote" data-hero-copy><span className="footnote-mark" aria-hidden="true">✳</span><span>Built for the things you choose to keep.</span></div>
        </div>
        <ArchiveScene/>
      </div>
      <a className="hero-scroll-cue" href="#the-idea"><span>SCROLL TO REMEMBER</span><b aria-hidden="true">↓</b></a>
    </section>

    <section className="signal-strip" aria-label="A personal library for things worth remembering">
      <div className="signal-inner"><span>GOOD READS</span><i>✳</i><span>SMALL IDEAS</span><i>✳</i><span>USEFUL THREADS</span><i>✳</i><span>THINGS TO TRY</span><i>✳</i><span>YOUR KIND OF THINGS</span></div>
    </section>

    <section className="idea-section" id="the-idea">
      <div className="idea-heading" data-reveal>
        <Eyebrow dark>THE INTERNET IS FULL OF GOOD THINGS</Eyebrow>
        <h2>Later gets<br/>a <span>little crowded.</span></h2>
      </div>
      <div className="idea-aside" data-reveal>
        <p>Open tabs pile up. Saved links disappear into lists. The thing you meant to remember gets harder to find.</p>
        <p className="idea-answer">Rembr gives the good stuff a place to land—and a way back.</p>
        <a className="text-link text-link-light" href="/about">Why we're making this <Arrow diagonal/></a>
      </div>
      <div className="idea-index" aria-hidden="true"><span>R</span><b>01—03</b></div>
    </section>

    <section className="ritual-section">
      <div className="ritual-header" data-reveal>
        <div><Eyebrow>THE REMBR RHYTHM</Eyebrow><h2>Save it.<br/><span>Shape it.</span><br/>Find it.</h2></div>
        <p>Nothing to keep up with. Just a simple loop that turns passing finds into something you can return to.</p>
      </div>
      <div className="ritual-steps">
        <article className="ritual-step step-capture" data-reveal><span className="step-number">01</span><div className="step-glyph glyph-capture" aria-hidden="true"><span>↘</span><i/><i/><i/></div><div className="step-copy"><span>CAPTURE</span><h3>Keep the spark.</h3><p>Save a page or bring in supported items from the places you already use.</p></div><span className="step-thread" aria-hidden="true">······</span></article>
        <article className="ritual-step step-organize" data-reveal><span className="step-number">02</span><div className="step-glyph glyph-organize" aria-hidden="true"><i/><i/><i/><b>✳</b></div><div className="step-copy"><span>ADD CONTEXT</span><h3>Make it yours.</h3><p>Keep notes, group related finds, and follow the ideas that connect them.</p></div><span className="step-thread" aria-hidden="true">······</span></article>
        <article className="ritual-step step-return" data-reveal><span className="step-number">03</span><div className="step-glyph glyph-return" aria-hidden="true"><span>⌕</span><i/><i/></div><div className="step-copy"><span>REDISCOVER</span><h3>Pick up the thread.</h3><p>Search your library, revisit what you saved, and ask questions with sources close by.</p></div></article>
      </div>
    </section>

    <section className="constellation-section">
      <div className="constellation-copy" data-reveal><Eyebrow>MORE THAN A PILE OF LINKS</Eyebrow><h2>Good ideas<br/>have <span>neighbors.</span></h2><p>Collections, connections, and reminders help your saved things become easier to move through—not another feed demanding your attention.</p><a className="button button-yellow" href="/features">Meet your library <Arrow diagonal/></a></div>
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
      <div className="control-intro" data-reveal><Eyebrow dark>ROOM TO EXPLORE. CONTROL THAT STAYS YOURS.</Eyebrow><h2>Helpful tools.<br/><span>Your call.</span></h2><p>Capture from where you work. Let useful connections surface. Review anything that would act outside your library.</p></div>
      <div className="control-panel" data-reveal>
        <div className="control-panel-head"><span>WHEN A WORKFLOW NEEDS YOU</span><span className="control-live"><i/> YOUR REVIEW</span></div>
        <div className="control-action"><span className="action-icon">↗</span><div><b>Share this reading list</b><small>3 saved pages · prepared for your review</small></div><span className="action-state">DRAFT</span></div>
        <div className="control-divider"><span/><i>YOUR APPROVAL</i><span/></div>
        <div className="control-buttons" aria-hidden="true"><span className="review-button">Review details</span><span className="approve-button">Approve when ready <Arrow/></span></div>
        <p className="control-note">External actions stay behind a clear review step.</p>
      </div>
      <span className="control-side-note" aria-hidden="true">A LITTLE SPACE<br/>TO THINK FIRST</span>
    </section>

    <section className="kept-section">
      <div className="kept-stamp" aria-hidden="true">✳</div>
      <div className="kept-copy" data-reveal><Eyebrow>BUILT AROUND YOUR LIBRARY</Eyebrow><h2>Your thoughts.<br/><span>Your context.</span><br/>Your way.</h2><p>Keep the source nearby. Add your own notes. Export what you have built. Manage your account and data in one place.</p><a className="text-link" href="/features">Explore the details <Arrow diagonal/></a></div>
      <div className="kept-list" data-reveal><div><span>01</span><b>Sources stay connected</b><i>↗</i></div><div><span>02</span><b>Your notes keep their place</b><i>✳</i></div><div><span>03</span><b>Controls stay within reach</b><i>⌘</i></div></div>
    </section>

    <section className="faq-section">
      <div className="faq-intro" data-reveal><Eyebrow>GOOD QUESTIONS</Eyebrow><h2>Before you<br/><span>save a spot.</span></h2><p>Clear answers, so you know what you're getting.</p></div>
      <div className="faq-list" data-reveal>
        <details><summary>What can I keep in Rembr?<span>＋</span></summary><p>Public pages and other supported sources you choose to save, along with notes and organization that help you return to them.</p></details>
        <details><summary>How do I find something again?<span>＋</span></summary><p>Search and browse your library, use your collections and tags, or follow related ideas. Optional answers can point back to the saved items they use.</p></details>
        <details><summary>Does Rembr take actions for me?<span>＋</span></summary><p>Capturing and organizing are under your control. Workflows that affect another service show you what is prepared and ask for approval before execution.</p></details>
        <details><summary>Can I export or remove my data?<span>＋</span></summary><p>Your account includes clear data controls for reviewing, exporting, and deleting your library. The exact scope is shown before a request is confirmed.</p></details>
        <details><summary>Will every page save perfectly?<span>＋</span></summary><p>No. Websites expose content differently. Rembr shows processing outcomes and keeps the original source close when a readable copy is incomplete.</p></details>
      </div>
    </section>

    <section className="final-call" data-reveal><div className="final-call-sun" aria-hidden="true"/><Eyebrow dark>MAKE ROOM FOR WHAT MATTERS</Eyebrow><h2>Keep the spark.<br/><span>Find the thread.</span></h2><a className="button button-ink" href="/app">Start your library <Arrow diagonal/></a><p>Not another feed. A place for the things you chose to keep.</p></section>
  </main>;
}

function PageHero({ label, title, accent, description }: { label: string; title: ReactNode; accent?: string; description: string }) {
  return <section className="subpage-hero" data-reveal><Eyebrow>{label}</Eyebrow><h1>{title}{accent && <><br/><span>{accent}</span></>}</h1><p>{description}</p><a className="button button-ink" href="/app">Open Rembr <Arrow diagonal/></a><span className="subpage-asterisk" aria-hidden="true">✳</span></section>;
}

function FeaturesPage() {
  return <main id="top" className="subpage-main">
    <PageHero label="THE LIBRARY" title={<>A place for<br/>the things you</>} accent="want to keep." description="Save useful finds, add your own context, and make it easier to pick the thread back up later."/>
    <section className="feature-story feature-story-yellow" data-reveal><div className="feature-story-number">01 / CAPTURE</div><div className="feature-story-copy"><h2>Catch the thought<br/>before it goes.</h2><p>Bring a page into your library from the web or a supported import. Keep the original source attached so the way back is never a mystery.</p></div><div className="feature-story-art capture-art" aria-hidden="true"><span>LINK</span><i>↘</i><b>KEPT</b></div></section>
    <section className="feature-story feature-story-orange" data-reveal><div className="feature-story-number">02 / CONNECT</div><div className="feature-story-copy"><h2>See what belongs<br/>together.</h2><p>Use notes, tags, collections, smart groups, and connections to shape a library that reflects how you think.</p></div><div className="feature-story-art connect-art" aria-hidden="true"><span>IDEA</span><i/><i/><i/><b>THREAD</b></div></section>
    <section className="feature-story feature-story-ink" data-reveal><div className="feature-story-number">03 / RETURN</div><div className="feature-story-copy"><h2>Find your way<br/>back with context.</h2><p>Search across what you saved. Ask questions that stay connected to the source material, and bring old ideas back into view.</p></div><div className="feature-story-art return-art" aria-hidden="true"><span>⌕</span><b>FOUND<br/>AGAIN</b></div></section>
    <section className="feature-trust" data-reveal><Eyebrow>YOU STAY IN THE LOOP</Eyebrow><h2>Useful automation.<br/><span>Human judgment.</span></h2><p>Review what a workflow is about to do before it reaches another service. See the decision, approve it when you're ready, and keep an audit trail.</p><a className="underlined-link" href="/about">How Rembr thinks about this <span aria-hidden="true">↗</span></a></section>
    <section className="feature-limit" data-reveal><span>GOOD TO KNOW</span><p>Rembr is designed around sources you choose and supported ways to bring them in. Processing can vary by source. Workflows that affect external services require your approval.</p><a href="/contact">Have a question? Say hello <Arrow diagonal/></a></section>
  </main>;
}

function AboutPage() {
  return <main id="top" className="subpage-main about-main">
    <PageHero label="OUR POINT OF VIEW" title={<>We forget links.<br/>We remember</>} accent="what they meant." description="Rembr is a personal library for the useful, curious, and meaningful things you find across the web."/>
    <section className="about-statement" data-reveal><div className="about-statement-number">A SMALL PROMISE</div><p>“Later” should feel like a place you can return to—not a pile you feel guilty about.</p><span aria-hidden="true">✳</span></section>
    <section className="about-columns"><article data-reveal><Eyebrow>WHAT WE'RE MAKING</Eyebrow><h2>A quieter kind of memory.</h2><p>A place for your chosen finds, their sources, and the context you add. Search, organization, and gentle rediscovery help you get back to the idea—not just the tab.</p></article><article data-reveal><Eyebrow>HOW WE WANT IT TO FEEL</Eyebrow><h2>Useful, open, and yours.</h2><p>Rembr should help without taking over. You decide what to save, what to connect, and whether an external workflow should happen. Your library should stay understandable as it grows.</p></article></section>
    <section className="about-manifesto" data-reveal><span>THE SHORT VERSION</span><h2>Keep the source.<br/>Keep your context.<br/><em>Keep your say.</em></h2><a className="button button-yellow" href="/app">Make room in Rembr <Arrow diagonal/></a></section>
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
    <PageHero label="SAY HELLO" title={<>A note can<br/>start a</>} accent="good thing." description="Questions, useful feedback, or a moment where Rembr could work better? We'd like to hear about it."/>
    <section className="contact-layout" data-reveal><div className="contact-note"><span>✳</span><h2>Tell us what<br/>you were trying<br/>to remember.</h2><p>Your note opens in your own email app when a support address is configured. It isn't sent automatically from this page.</p><a className="text-link" href="/app">Need account access? Open Rembr <Arrow diagonal/></a></div>
      <form onSubmit={submit} className="contact-form"><div className="form-heading"><span>01 — YOUR NOTE</span><p>We read every detail we can.</p></div><label htmlFor="contact-email">Your email</label><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/><label htmlFor="contact-subject">What is this about?</label><select id="contact-subject" name="subject" defaultValue="Feedback"><option>Feedback</option><option>Account help</option><option>Something is not working</option><option>Other</option></select><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" required minLength={10} maxLength={3000} rows={5} placeholder="A little context helps us understand…"/><button className="button button-ink" type="submit" disabled={!contactEmail}>{sent ? 'Email draft opened' : 'Write your message'} <Arrow diagonal/></button>{!contactEmail && <p className="contact-config-note">A support address has not been configured yet, so the email action is unavailable.</p>}</form>
    </section>
  </main>;
}

export function MarketingSite() {
  const page = pageForPath(window.location.pathname);
  const siteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const titles: Record<Page, string> = { home: 'Rembr — Keep the good stuff', features: 'Your library — Rembr', about: 'Our point of view — Rembr', contact: 'Say hello — Rembr' };
    const descriptions: Record<Page, string> = {
      home: 'A personal library for the things you find useful, curious, and worth returning to.',
      features: 'Save your finds, add context, connect ideas, and find your way back in Rembr.',
      about: 'Why Rembr is making a quieter, more personal kind of internet memory.',
      contact: 'Send Rembr a question, product note, or useful piece of feedback.',
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
