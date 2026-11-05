import {
  ArrowRight, Bot, Brain, BrandLogo, CheckCircle2, Clock, ExternalLink, Eye, FileText,
  Folder, Hash, Images, Lock, Mic, RotateCcw, RotatingOutcomeText, RotatingPlatformLogo,
  SAVE_SOURCE_LABELS, Search, ShieldCheck, Sparkles, Tag, Upload, Zap,
} from './AppShared.jsx';

export function LandingSections({
  handleLibraryCta, libraryCtaLabel, onOpenHowTo, onOpenContact, onOpenHelp,
  onOpenTerms, onOpenPrivacy, onOpenSecurity, onOpenDataDeletion, onOpenCookies,
}) {
  return (
    <><section className="relative overflow-hidden border-y border-white/5 bg-black py-8">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-black to-transparent" />
        <div className="marquee flex gap-12 whitespace-nowrap font-display text-5xl font-bold tracking-tighter md:text-7xl">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex gap-12">
              {SAVE_SOURCE_LABELS.map((label) => (
                <span key={`${index}-${label}`} className="text-foreground/20 transition hover:text-primary">
                  {label} <span className="text-primary">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section id="what-you-can-save" className="relative border-b border-white/5 bg-black px-6 py-20 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div data-reveal className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-primary">/ 01 - What you can save</div>
              <h2 className="max-w-3xl font-display text-5xl font-bold tracking-tighter md:text-7xl">
                All the internet stuff your brain refuses to remember.
              </h2>
            </div>
            <p className="max-w-md text-pretty text-muted-foreground">
              Your saves are not gone. They are just buried in too many apps, folders, chats, and screenshots. <RotatingPlatformLogo />
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [ExternalLink, 'Pinterest', 'Moodboards, recipes, outfits, interiors, products, and travel plans.'],
              [Zap, 'YouTube', 'Videos worth saving without turning your browser into a junk drawer.'],
              [Hash, 'X', 'Threads and posts that should not disappear into the feed.'],
              [Images, 'Instagram', 'Reels, posts, and collections you planned to revisit.'],
              [FileText, 'Documents and web', 'Research, shopping links, articles, docs, and sites you want again later.'],
              [Mic, 'Voice notes and notes', 'Quick thoughts, screenshots, and useful context that usually gets lost.'],
            ].map(([Icon, title, description]) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="feature-section relative overflow-hidden bg-black px-6 py-16 md:py-24">
        <div className="pointer-events-none absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="mx-auto max-w-7xl">
          <div data-reveal className="mb-16 flex flex-wrap items-end justify-between gap-8">
            <div>
              <div className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-primary">/ 02 - Why it helps</div>
              <h2 className="max-w-3xl font-display text-5xl font-bold tracking-tighter md:text-7xl">
                Your saves finally <span className="italic text-primary">work for you</span>.
              </h2>
            </div>
            <p className="max-w-md text-pretty text-muted-foreground">No messy folders. No social password handover. No "where did I save that?" panic.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              [Zap, 'Save from everywhere', 'Paste links, upload exports, add screenshots, or write quick notes in one private place.'],
              [Search, 'Find old saves fast', 'Search by idea, topic, person, brand, product, or the reason you saved it.'],
              [Brain, 'Remember why you saved it', 'Get plain-English context so old posts stop looking like mystery bookmarks.'],
              [Tag, 'Keep messy saves organized', 'Group travel, food, fitness, shopping, work, research, and inspiration without doing the boring cleanup yourself.'],
              [Bot, 'Ask questions about your saves', 'Ask what you saved about a topic and get an answer based on your own library.'],
              [Images, 'Find similar ideas', 'Use a save or screenshot to uncover more things with the same vibe.'],
              [Clock, 'Set reminders for useful saves', 'Bring a save back when it is actually time to use it. Future you gets a small favor.'],
              [ShieldCheck, 'Check your library', 'Spot links and saves that need attention before your collection turns into digital attic dust.'],
              [Lock, 'Private by default', 'Your library belongs to your account, and you choose what becomes searchable.'],
            ].map(([Icon, title, description]) => (
              <div
                key={title}
                className="step-card group relative min-h-56 overflow-hidden rounded-2xl border border-white/10 bg-black/80 p-7 transition-all hover:-translate-y-1 hover:border-primary/60"
              >
                <div
                  className="absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-100"
                  style={{ background: 'var(--glow)' }}
                />
                <div className="relative">
                  <Icon className="mb-8 h-6 w-6 text-primary" />
                  <h3 className="mb-3 font-display text-2xl font-semibold tracking-tight">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative border-y border-white/10 bg-black px-6 py-16 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div data-reveal className="mb-14 max-w-4xl">
            <div className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-primary">/ 03 - How it works</div>
            <h2 className="font-display text-5xl font-bold tracking-tighter md:text-7xl">
              Save it once. Find it when it matters.
            </h2>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Rembr turns scattered saves into a private library you can search without becoming your own unpaid filing clerk.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              [Upload, 'Add your saves', 'Bring in posts, links, screenshots, notes, and exports from the places you already use.'],
              [CheckCircle2, 'Review what matters', 'Keep the useful stuff, clean up titles or notes, and skip what is not worth saving.'],
              [Sparkles, 'Rembr organizes it', 'Your saves get easier to search by topic, person, brand, product, and reason.'],
              [Search, 'Search when you need it', 'Come back days or months later and find the thing without scrolling yourself into a bad mood.'],
            ].map(([Icon, title, description], index) => (
              <article key={title} data-reveal className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex items-center justify-between gap-4">
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">0{index + 1}</span>
                </div>
                <h3 className="mt-8 font-display text-2xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="extension" className="relative border-y border-white/10 bg-black px-6 py-16 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div data-reveal>
            <div className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-primary">/ 04 - Browser extension</div>
            <h2 className="max-w-4xl font-display text-5xl font-bold tracking-tighter md:text-7xl">
              Save the page you are on without opening another tab.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              The browser extension is not available yet. For now, add a public page link from your Rembr library.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground opacity-70"
              >
                Not available yet
              </button>
              <button
                type="button"
                onClick={onOpenHowTo}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-4 text-sm transition hover:bg-white/5"
              >
                <FileText className="h-4 w-4" /> How to use
              </button>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Until then, you can still upload exports, paste links, and add notes from the web app.
            </p>
          </div>

          <div data-reveal className="grid gap-4 sm:grid-cols-2">
            {[
              [Search, 'Save the current page', 'Send the page you are viewing into your private library.'],
              [Eye, 'Capture a screenshot', 'Save a crop of the screen when the useful bit is visual.'],
              [RotateCcw, 'Undo quickly', 'If you save the wrong thing, undo it right away.'],
              [ShieldCheck, 'Built with permission', 'It runs when you click it, not as a hidden background scraper.'],
            ].map(([Icon, title, description]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="index-section relative overflow-hidden bg-black px-6 py-16 md:py-24">
        <div className="index-pin mx-auto max-w-7xl">
          <div className="index-heading mb-16">
            <div className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-primary">/ 05 - What gets easier to find</div>
            <h2 className="max-w-4xl font-display text-5xl font-bold tracking-tighter md:text-7xl">
              For the posts you swore you would come back to.
            </h2>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Rembr helps each save carry enough context that you can actually use it later.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3 lg:grid-cols-4">
            {[
              [Sparkles, 'What it is'], [FileText, 'Quick summary'], [FileText, 'What was said'], [Eye, 'Words on screen'],
              [Eye, 'What is shown'], [Tag, 'Creator or brand'], [Bot, 'Product or idea'], [ExternalLink, 'Links or names'],
              [Hash, 'Theme'], [Folder, 'Collection'], [Brain, 'Reason you saved'], [ShieldCheck, 'Original post'],
            ].map(([Icon, title]) => (
              <div key={title} data-index-tile className="group relative min-h-36 bg-black p-8 transition-colors hover:bg-primary/5">
                <Icon className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-primary" />
                <div className="mt-6 font-display text-xl font-semibold">{title}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="feedback" className="bg-black px-6 py-16 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div data-reveal>
            <div className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-primary">/ 06 - A note to Rembr</div>
            <h2 className="font-display text-5xl font-bold tracking-tighter md:text-7xl">A little more room to think.</h2>
            <p className="mt-6 max-w-xl leading-relaxed text-muted-foreground">
              Have a question or an idea for your library? Get in touch and tell us what you are trying to keep close.
            </p>
            <button type="button" onClick={onOpenContact} className="glow-ring mt-8 inline-flex items-center gap-3 rounded-full bg-primary px-7 py-4 font-semibold text-primary-foreground transition hover:scale-[1.03]">
              Get in touch <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="feedback-card grid min-h-64 place-items-center rounded-3xl border border-white/10 bg-white/[0.025] p-8 text-center md:p-12">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">Keep the source. Keep your context.</p>
              <h3 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-4xl">Your ideas belong in your library.</h3>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">Save a page, add a note, and find it again when you need it.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section relative overflow-hidden border-t border-white/5 bg-black px-6 py-20 md:py-28">
        <div className="cta-bg radial-fade grid-bg absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-5xl text-center">
          <h2 data-reveal className="text-balance font-display text-6xl font-bold tracking-tighter md:text-8xl">
            Your best references are already saved. <br />Make them <RotatingOutcomeText />
          </h2>
          <p data-reveal className="mx-auto mt-8 max-w-xl text-lg text-muted-foreground">Paste one link or upload an export, then turn posts, products, research, screenshots, and ideas into a library you can come back to.</p>
          <div data-reveal className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleLibraryCta}
              className="glow-ring group inline-flex items-center gap-3 rounded-full bg-primary px-9 py-5 text-lg font-semibold text-primary-foreground transition hover:scale-[1.03]"
            >
              {libraryCtaLabel} <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              onClick={onOpenHowTo}
              className="inline-flex items-center gap-3 rounded-full border border-white/15 px-7 py-5 text-base font-semibold text-foreground transition hover:bg-white/5"
            >
              <FileText className="h-5 w-5" /> How to Use
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <BrandLogo className="h-10 w-32" />
          <div className="flex flex-col items-start gap-4 md:items-end">
            <div className="flex flex-wrap gap-4">
              <button type="button" onClick={onOpenHowTo} className="transition hover:text-primary">How to Use</button>
              <button type="button" onClick={onOpenHelp} className="transition hover:text-primary">Help Center</button>
              <button type="button" onClick={onOpenTerms} className="transition hover:text-primary">Terms of Service</button>
              <button type="button" onClick={onOpenPrivacy} className="transition hover:text-primary">Privacy Policy</button>
              <button type="button" onClick={onOpenSecurity} className="transition hover:text-primary">Security</button>
              <button type="button" onClick={onOpenDataDeletion} className="transition hover:text-primary">Data Deletion</button>
              <button type="button" onClick={onOpenCookies} className="transition hover:text-primary">Cookies</button>
            </div>
          </div>
        </div>
      </footer>    </>
  );
}
