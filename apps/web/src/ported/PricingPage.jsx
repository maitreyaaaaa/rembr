import {
  ArrowLeft,
  ArrowRight,
  BrandLogo,
  Mail,
} from './AppShared.jsx';

function PricingPage({ onBack, onOpenHelp }) {
  return (
    <div className="pricing-page min-h-screen bg-black text-foreground">
      <div className="grid-bg radial-fade pointer-events-none fixed inset-0 opacity-35" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/85 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <button type="button" onClick={onBack} className="flex min-w-0 items-center gap-3 transition hover:opacity-80">
            <ArrowLeft className="h-5 w-5 shrink-0 text-muted-foreground" />
            <BrandLogo className="h-12 w-40 shrink-0" />
          </button>
          <button type="button" onClick={onOpenHelp} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-white/5">
            <Mail className="h-4 w-4" />
            Contact us
          </button>
        </div>
      </header>

      <main className="relative mx-auto flex min-h-[calc(100vh-6rem)] max-w-4xl flex-col items-start justify-center px-5 py-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pricing</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
          Pricing details are not published yet.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
          Contact Rembr for current access details. We will explain what a plan includes before asking anyone to choose one.
        </p>

        <div className="mt-8 flex flex-col items-start gap-4">
          <button type="button" onClick={onOpenHelp} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            Ask about Rembr
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </main>
    </div>
  );
}

export default PricingPage;
