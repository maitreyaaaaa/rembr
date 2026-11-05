import {
  avatarUrlForSession,
  getProfile,
  gsap,
  identifyPostHogUser,
  initialForSession,
  recordSessionSignInActivity,
  resetPageScroll,
  resetPostHogUser,
  ScrollTrigger,
  setApiAccessToken,
  supabase,
  useEffect,
  useRef,
  useState,
} from './AppShared.jsx';
import { LandingHeader } from './LandingHeader.jsx';
import { LandingHero } from './LandingHero.jsx';
import { LandingSections } from './LandingSections.jsx';

const LIBRARY_STARTED_KEY = 'rembr.libraryStarted';
function hasLibraryStarted() {
  try { return window.localStorage.getItem(LIBRARY_STARTED_KEY) === 'true'; }
  catch { return false; }
}

function rememberLibraryStarted() {
  try { window.localStorage.setItem(LIBRARY_STARTED_KEY, 'true'); }
  catch { /* Storage can be unavailable in private or restricted browser contexts. */ }
}

function Landing({ onOpenApp, onOpenLogin, onOpenPricing, onOpenHowTo, onOpenTerms, onOpenPrivacy, onOpenHelp, onOpenContact, onOpenSecurity, onOpenDataDeletion, onOpenCookies }) {
  const root = useRef(null);
  const introRef = useRef(null);
  const cursorRef = useRef(null);
  const heroTitle = useRef(null);
  const [landingSession, setLandingSession] = useState(null);
  const [landingProfile, setLandingProfile] = useState(null);
  const [libraryStarted, setLibraryStarted] = useState(false);
  const landingAvatarUrl = avatarUrlForSession(landingSession, landingProfile);
  const landingInitial = initialForSession(landingSession, landingProfile);
  const libraryCtaLabel = landingSession || libraryStarted ? 'My library' : 'Start my library';
  const handleLibraryCta = landingSession ? onOpenApp : onOpenLogin;

  useEffect(() => {
    resetPageScroll();
  }, []);

  useEffect(() => {
    setLibraryStarted(hasLibraryStarted());
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let cancelled = false;

    const syncSession = async (session) => {
      if (cancelled) return;
      setLandingSession(session || null);
      setApiAccessToken(session?.access_token);
      if (!session) {
        setLandingProfile(null);
        resetPostHogUser();
        return;
      }
      recordSessionSignInActivity(session);
      rememberLibraryStarted();
      setLibraryStarted(true);
      try {
        const body = await getProfile();
        if (!cancelled) {
          setLandingProfile(body.profile || null);
          identifyPostHogUser(session, body.profile);
        }
      } catch {
        if (!cancelled) {
          setLandingProfile(null);
          identifyPostHogUser(session, null);
        }
      }
    };

    supabase.auth.getSession().then(({ data }) => syncSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return undefined;
    const move = (event) => {
      gsap.to(cursor, { x: event.clientX, y: event.clientY, duration: 0.25, ease: 'power3.out' });
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      const words = heroTitle.current?.querySelectorAll('.word');
      const intro = introRef.current;

      mm.add(
        {
          reduceMotion: '(prefers-reduced-motion: reduce)',
          desktop: '(min-width: 900px)',
        },
        (context) => {
          const { reduceMotion, desktop } = context.conditions;

          if (reduceMotion) {
            gsap.set(intro, { autoAlpha: 0, display: 'none' });
            gsap.set(['.hero-fade', '.nav-item', '[data-reveal]', '.step-card', '[data-index-tile]', '.feedback-card'], {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              clearProps: 'transform,opacity,visibility',
            });
            return;
          }

          if (intro) {
            gsap.timeline({ defaults: { ease: 'power3.out' } })
              .set(intro, { yPercent: 0, autoAlpha: 1 })
              .fromTo('.intro-logo', { autoAlpha: 0, scale: 0.92, y: 10 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.55 })
              .to('.intro-logo', { scale: 1.04, duration: 0.45, ease: 'power1.inOut' })
              .to(intro, { yPercent: -100, duration: 1, ease: 'expo.inOut' }, '+=0.15')
              .set(intro, { display: 'none' });
          }

          gsap.from(words || [], {
            yPercent: 110,
            rotate: 6,
            duration: 1.1,
            ease: 'expo.out',
            stagger: 0.08,
            delay: intro ? 1.3 : 0.15,
          });

          gsap.from('.hero-fade', {
            autoAlpha: 0,
            y: 24,
            duration: 1,
            ease: 'power3.out',
            stagger: 0.1,
            delay: intro ? 1.75 : 0.6,
          });

          gsap.to('.parallax-grid', {
            yPercent: desktop ? 12 : 5,
            ease: 'none',
            scrollTrigger: {
              trigger: '.landing-hero',
              start: 'top top',
              end: 'bottom top',
              scrub: 1,
            },
          });

          gsap.to('.parallax-glow-primary', {
            yPercent: desktop ? 28 : 12,
            xPercent: desktop ? 8 : 2,
            ease: 'none',
            scrollTrigger: {
              trigger: '.landing-hero',
              start: 'top top',
              end: 'bottom top',
              scrub: 1.2,
            },
          });

          gsap.to('.parallax-glow-secondary', {
            yPercent: desktop ? -18 : -8,
            xPercent: desktop ? -10 : -3,
            ease: 'none',
            scrollTrigger: {
              trigger: '.landing-hero',
              start: 'top top',
              end: 'bottom top',
              scrub: 1.4,
            },
          });

          gsap.to('.hero-content', {
            yPercent: desktop ? -8 : -3,
            ease: 'none',
            scrollTrigger: {
              trigger: '.landing-hero',
              start: 'top top',
              end: 'bottom top',
              scrub: 1,
            },
          });

          gsap.utils.toArray('[data-reveal]').forEach((el) => {
            gsap.from(el, {
              autoAlpha: 0,
              y: 56,
              duration: 0.9,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: el,
                start: 'top 82%',
                toggleActions: 'play none none reverse',
              },
            });
          });

          gsap.set('.step-card', { autoAlpha: 0, y: 72, scale: 0.96 });
          ScrollTrigger.batch('.step-card', {
            start: 'top 84%',
            once: true,
            onEnter: (batch) => {
              gsap.to(batch, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.8,
                ease: 'power3.out',
                stagger: 0.12,
                overwrite: true,
              });
            },
          });

          gsap.set('[data-index-tile]', { autoAlpha: 0, y: 44, scale: 0.96 });
          gsap.from('.index-heading', {
            autoAlpha: 0,
            y: 40,
            duration: 0.85,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: '.index-section',
              start: 'top 76%',
              toggleActions: 'play none none none',
            },
          });

          ScrollTrigger.batch('[data-index-tile]', {
            start: 'top 86%',
            once: true,
            interval: 0.08,
            batchMax: desktop ? 4 : 2,
            onEnter: (batch) => {
              gsap.to(batch, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.75,
              ease: 'power3.out',
                stagger: 0.08,
                overwrite: true,
              });
            },
          });

          gsap.from('.feedback-card', {
            autoAlpha: 0,
            y: 30,
            duration: 0.65,
            ease: 'power3.out',
            stagger: 0.08,
            scrollTrigger: {
              trigger: '#feedback',
              start: 'top 70%',
              toggleActions: 'play none none reverse',
            },
          });

          gsap.to('.cta-bg', {
            yPercent: -12,
            ease: 'none',
            scrollTrigger: {
              trigger: '.cta-section',
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1,
            },
          });

          window.setTimeout(() => ScrollTrigger.refresh(), 250);
        });

      return () => mm.revert();
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} className="relative bg-black text-foreground overflow-x-hidden">
      <div ref={introRef} className="landing-intro fixed inset-0 z-[200] hidden place-items-center bg-black md:grid">
        <BrandLogo align="center" className="intro-logo opacity-0" />
      </div>

      <div
        ref={cursorRef}
        className="pointer-events-none fixed left-0 top-0 z-[100] hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary mix-blend-difference md:block"
      />

            <LandingHeader landingSession={landingSession} landingAvatarUrl={landingAvatarUrl} landingInitial={landingInitial} onOpenApp={onOpenApp} onOpenPricing={onOpenPricing} onOpenContact={onOpenContact} onOpenHowTo={onOpenHowTo} />

            <LandingHero heroTitle={heroTitle} handleLibraryCta={handleLibraryCta} libraryCtaLabel={libraryCtaLabel} onOpenHowTo={onOpenHowTo} />

            <LandingSections handleLibraryCta={handleLibraryCta} libraryCtaLabel={libraryCtaLabel} onOpenHowTo={onOpenHowTo} onOpenContact={onOpenContact} onOpenHelp={onOpenHelp} onOpenTerms={onOpenTerms} onOpenPrivacy={onOpenPrivacy} onOpenSecurity={onOpenSecurity} onOpenDataDeletion={onOpenDataDeletion} onOpenCookies={onOpenCookies} />

    </div>
  );
}
export default Landing;

