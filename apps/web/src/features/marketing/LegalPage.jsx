import { ArrowLeft, BrandLogo } from './AppShared.jsx';

const OTHER_PAGES = {
  privacy: ['Privacy Policy', 'Privacy information is being prepared against Rembr’s current account, library, import, and AI-processing behavior.'],
  security: ['Security', 'Security information is being reviewed against Rembr’s current hosting and data controls.'],
  dataDeletion: ['Data Deletion', 'Data deletion instructions are being prepared. Use account settings or contact Rembr for current account support.'],
  cookies: ['Cookie Notice', 'Cookie and browser-storage details are being prepared.'],
};

function PageFrame({ title, eyebrow, children, onBack }) {
  return (
    <div className="min-h-screen bg-black text-foreground">
      <div className="grid-bg radial-fade pointer-events-none fixed inset-0 opacity-35" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/85 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <button type="button" onClick={onBack} className="flex items-center gap-3 transition hover:opacity-80">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            <BrandLogo className="h-12 w-40" />
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Rembr / {eyebrow}</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-14 md:py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Rembr / {title}</p>
        <h1 className="mt-3 font-display text-5xl font-bold tracking-tighter md:text-7xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}

function TermsPage({ onBack }) {
  return <PageFrame title="Terms and Conditions" eyebrow="Effective November 5, 2026 · version 2026-11-05-v1" onBack={onBack}>
    <p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground">These terms describe the Rembr service and the processing that occurs when you use it. By creating an account and checking the acceptance box, you agree to these terms.</p>
    <div className="mt-10 grid gap-5">
      <TermsSection title="Your account and library">
        <p>Rembr lets you save public links, import supported archives, organize saved items, and search your library. Keep your sign-in details secure. You are responsible for the content you save and must have the right to submit it to Rembr for the features you use.</p>
      </TermsSection>
      <TermsSection title="AI-assisted features and external providers">
        <p>Rembr uses AI providers to analyze eligible imported Instagram media, answer questions about your saved library, describe an image you choose for image search, and create embeddings for meaning-based search. Instagram import analysis may run automatically for eligible items after an import. Other features send relevant information when you choose to use them.</p>
        <p>Depending on the feature, information sent may include saved titles, descriptions, captions, extracted page or note text, public Instagram media, a selected image, your search query, or recent messages from the same library conversation. Rembr sends only the information needed for the requested feature.</p>
        <p>Rembr uses Meta AI for media analysis, grounded answers, and image search. Meaning-based and live web search use OpenRouter, which may route requests to upstream providers. Those providers process submitted information under their own terms and privacy practices. AI results can be incomplete or inaccurate; review them before relying on them.</p>
      </TermsSection>
      <TermsSection title="Storage and controls">
        <p>Rembr stores your account and library data to provide the service. It may store generated summaries, descriptions, transcripts, search terms, and library embeddings. The image selected for image search and its generated query are not saved as library items. You can stop using an AI feature at any time; account and library deletion requests are available through Rembr support.</p>
      </TermsSection>
      <TermsSection title="Service changes and contact">
        <p>We may change or discontinue features as Rembr develops. We will update this page when these terms materially change. For questions or account deletion requests, use the <a className="underline underline-offset-4" href="/contact">Rembr contact page</a>.</p>
      </TermsSection>
    </div>
  </PageFrame>;
}

function TermsSection({ title, children }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 md:p-8">
    <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
    <div className="mt-3 grid gap-3 text-sm leading-7 text-muted-foreground">{children}</div>
  </section>;
}

function LegalPage({ type = 'terms', onBack }) {
  if (type === 'terms') return <TermsPage onBack={onBack} />;
  const [title, description] = OTHER_PAGES[type] || OTHER_PAGES.privacy;
  return <PageFrame title={title} eyebrow="In preparation" onBack={onBack}>
    <p className="mt-6 max-w-3xl text-base leading-8 text-muted-foreground">{description}</p>
    <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.025] p-6 md:p-8">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">In preparation</span>
      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">This page is not a published policy.</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">We’ll publish this information after it has been checked against Rembr’s current product behavior. For account questions, use the Rembr contact page.</p>
      <a href="/contact" className="mt-6 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white/5">Contact Rembr <span className="ml-2" aria-hidden="true">↗</span></a>
    </section>
  </PageFrame>;
}

export default LegalPage;
