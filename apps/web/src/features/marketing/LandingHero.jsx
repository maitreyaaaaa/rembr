import { ArrowRight, FileText } from 'lucide-react';
import { RotatingPlatformLogo, scrollToSection } from './AppShared.jsx';

export function LandingHero({ heroTitle, handleLibraryCta, libraryCtaLabel, onOpenHowTo }) {
  const heroWords = ['Never', 'Lose', 'a', 'Post', 'Saved', 'on'];
  return (<section className="landing-hero relative flex min-h-screen items-center overflow-hidden bg-black pt-28 md:pt-36">
        <div className="parallax-grid radial-fade grid-bg absolute inset-0 opacity-60" />
        <div
          className="parallax-glow-primary absolute -left-20 -top-32 h-[480px] w-[480px] rounded-full opacity-40 blur-[120px]"
          style={{ background: 'radial-gradient(circle, var(--glow) 0%, transparent 70%)' }}
        />
        <div
          className="parallax-glow-secondary absolute right-0 top-40 h-[520px] w-[520px] rounded-full opacity-30 blur-[140px]"
          style={{ background: 'radial-gradient(circle, var(--glow) 0%, transparent 70%)' }}
        />

        <div className="hero-content relative mx-auto w-full max-w-[100rem] overflow-visible px-6 md:px-10 md:pr-20 xl:px-14 xl:pr-24">
          <h1
            ref={heroTitle}
            className="overflow-visible text-balance font-display text-[clamp(3rem,12vw,11rem)] font-bold leading-[0.95] tracking-tighter md:text-[clamp(3rem,10.5vw,11rem)]"
          >
            {heroWords.map((word) => (
              <span key={word} className="mr-[0.18em] inline-block overflow-visible last:mr-0">
                <span className={`word inline-block ${word === 'Lose' ? 'relative isolate' : ''} ${word === 'Post' ? 'hero-post-highlight rounded-[5px] bg-accent pl-[0.08em] pr-[0.22em] text-accent-foreground' : ''}`}>
                  {word === 'Lose' && (
                    <img aria-hidden="true" src="/hero/lose-circle.png" alt="" className="hero-lose-ring pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 rotate-[-5deg]" />
                  )}
                  {word === 'Post' ? <em className="hero-word-post">{word}</em> : <span className={word === 'Lose' ? 'relative z-10' : ''}>{word}</span>}
                </span>
                {word === 'on' && <RotatingPlatformLogo />}
              </span>
            ))}
          </h1>

          <div className="mt-12 flex flex-col items-start justify-between gap-8 md:flex-row md:items-start">
            <p className="hero-fade max-w-[21rem] text-lg leading-relaxed text-muted-foreground sm:max-w-xl">
              Save posts, links, screenshots, notes, products, and references in one private library. Find them later by what they are about, not just where you saved them.
            </p>
            <div className="hero-fade flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <button
                type="button"
                onClick={handleLibraryCta}
                className="glow-ring group inline-flex items-center justify-center gap-3 rounded-full bg-primary px-7 py-4 text-base font-semibold text-primary-foreground transition hover:scale-[1.03]"
              >
                {libraryCtaLabel} <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </button>
              <button type="button" onClick={(event) => scrollToSection(event, '#how-it-works')} className="inline-flex items-center justify-center gap-2 rounded-full border border-accent/45 px-6 py-4 text-sm font-semibold text-accent transition hover:bg-accent/10">
                See how it works
              </button>
              <button type="button" onClick={onOpenHowTo} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-4 text-sm transition hover:bg-white/5">
                <FileText className="h-4 w-4" /> How to use
              </button>
            </div>
          </div>

          <div className="hero-fade mx-auto mt-24 grid w-full max-w-7xl grid-cols-2 gap-x-4 gap-y-8 text-sm md:grid-cols-4 md:gap-6">
            {[
              ['Saved posts', 'Posts'],
              ['Useful links', 'Links'],
              ['Screen grabs', 'Screenshots'],
              ['Personal notes', 'Notes'],
            ].map(([label, value]) => (
              <div key={label} className="border-l border-white/10 pl-4">
                <div className="font-display text-2xl font-bold tabular-nums sm:text-4xl">{value}</div>
                <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

      </section>  );
}
