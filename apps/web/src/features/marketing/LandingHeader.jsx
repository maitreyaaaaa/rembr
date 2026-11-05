import { BrandLogo } from './AppShared.jsx';

export function LandingHeader({ landingSession, landingAvatarUrl, landingInitial, onOpenApp, onOpenPricing, onOpenContact, onOpenHowTo }) {
  return (<header className="landing-header pointer-events-none absolute left-0 right-0 top-4 z-50">
        <div className="mx-auto grid w-full max-w-[100rem] grid-cols-[auto_1fr_auto] items-center gap-4 px-6 md:px-10 md:pr-20 xl:px-14 xl:pr-24">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="landing-brand-button nav-item pointer-events-auto flex items-center"
          >
            <BrandLogo className="landing-brand-logo" />
          </button>
          <nav className="pointer-events-auto absolute left-1/2 hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/75 p-1 text-sm font-semibold text-muted-foreground shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl md:flex">
            <button type="button" onClick={onOpenPricing} className="nav-item rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-foreground">Pricing</button>
            <button type="button" onClick={onOpenContact} className="nav-item rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-foreground">Contact us</button>
            <button type="button" onClick={onOpenHowTo} className="nav-item rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-foreground">How to use</button>
          </nav>
          <div className="nav-item pointer-events-auto flex items-center gap-2 justify-self-end">
            {landingSession ? (
              <button
                type="button"
                onClick={onOpenApp}
                className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-black/75 text-sm font-bold text-foreground shadow-[0_16px_55px_rgba(0,0,0,0.22)] backdrop-blur transition hover:scale-[1.04] hover:bg-white/10"
                aria-label="Open Rembr library"
              >
                {landingAvatarUrl ? (
                  <img src={landingAvatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-primary text-primary-foreground">{landingInitial}</span>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </header>  );
}
