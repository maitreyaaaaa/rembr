import { ArrowLeft, BrandLogo } from './AppShared.jsx';

const PAGE_CONTENT = {
  terms: ['Terms of Service', 'Terms of service are being prepared and are not published yet.'],
  privacy: ['Privacy Policy', 'The privacy policy is being prepared against Rembr’s current account, library, import, and AI-consent behavior.'],
  security: ['Security', 'Security information is being reviewed against Rembr’s current hosting and data controls.'],
  dataDeletion: ['Data Deletion', 'Data deletion instructions are being prepared. Use account settings or contact Rembr for current account support.'],
  cookies: ['Cookie Notice', 'Cookie and browser-storage details are being prepared.'],
};

function LegalPage({ type = 'terms', onBack }) {
  const [title, description] = PAGE_CONTENT[type] || PAGE_CONTENT.terms;

  return (
    <div className="min-h-screen bg-black text-foreground">
      <div className="grid-bg radial-fade pointer-events-none fixed inset-0 opacity-35" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/85 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <button type="button" onClick={onBack} className="flex items-center gap-3 transition hover:opacity-80">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            <BrandLogo className="h-12 w-40" />
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Rembr / In preparation</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-14 md:py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Rembr / {title}</p>
        <h1 className="mt-3 font-display text-5xl font-bold tracking-tighter md:text-7xl">{title}</h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-muted-foreground">{description}</p>
        <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.025] p-6 md:p-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">In preparation</span>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">This page is not a published policy.</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">We’ll publish this information after it has been checked against Rembr’s current product behavior. For account questions, use the Rembr contact page.</p>
          <a href="/contact" className="mt-6 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white/5">Contact Rembr <span className="ml-2" aria-hidden="true">↗</span></a>
        </section>
      </main>
    </div>
  );
}

export default LegalPage;
