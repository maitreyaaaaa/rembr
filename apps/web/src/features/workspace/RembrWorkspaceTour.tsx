import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookmarkPlus, Check, CircleHelp, Compass, Library, Network, Settings2, Sparkles } from 'lucide-react';

export interface RembrWorkspaceTourProps {
  /** Defaults to open for direct use; pass a value to control visibility. */
  open?: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

interface TourStep {
  title: string;
  description: string;
  path: string;
  location: string;
  icon: typeof Library;
  action: string;
}

const steps: TourStep[] = [
  {
    title: 'Your library is the home for saved things.',
    description: 'Browse saved pages and notes, search your library, and open any item to see its source and captured details.',
    path: '/app',
    location: 'Library',
    icon: Library,
    action: 'Open library',
  },
  {
    title: 'Add a page or write a note.',
    description: 'Quick Add accepts a page link or a note. Rembr shows when a save is queued, processing, ready, or needs attention.',
    path: '/app/add',
    location: 'Quick Add',
    icon: BookmarkPlus,
    action: 'Open Quick Add',
  },
  {
    title: 'Bring an existing collection of saves.',
    description: 'The imports area shows import records and their progress, so you can review what was brought into your library.',
    path: '/app/imports',
    location: 'Imports',
    icon: ArrowRight,
    action: 'Open imports',
  },
  {
    title: 'Give related saves a place together.',
    description: 'Create collections for your own themes and use tags to add another way to organize and find saved items.',
    path: '/app/collections',
    location: 'Collections',
    icon: Sparkles,
    action: 'Open collections',
  },
  {
    title: 'Revisit what you saved before.',
    description: 'Checkup brings together older saves, items that need attention, import matches, and reminders you choose to set. Link checks only run when you ask.',
    path: '/app/checkup',
    location: 'Library checkup',
    icon: CircleHelp,
    action: 'Open checkup',
  },
  {
    title: 'See connections across your library.',
    description: 'The knowledge graph offers another view of relationships between the items saved in your Rembr library.',
    path: '/app/graph',
    location: 'Knowledge graph',
    icon: Network,
    action: 'Open graph',
  },
  {
    title: 'Make your workspace yours.',
    description: 'Visit settings to update your profile and preferences. Your account and library stay private to your account.',
    path: '/app/settings/profile',
    location: 'Settings',
    icon: Settings2,
    action: 'Open settings',
  },
];

export function RembrWorkspaceTour({ open, onClose, onNavigate }: RembrWorkspaceTourProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [internalOpen, setInternalOpen] = useState(open ?? true);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const isOpen = open ?? internalOpen;
  const activeStep = stepIndex === null ? null : steps[stepIndex];

  useEffect(() => {
    if (open !== undefined) setInternalOpen(open);
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  function closeTour() {
    setStepIndex(null);
    if (open === undefined) setInternalOpen(false);
    onClose();
  }

  function startTour() {
    setStepIndex(0);
  }

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    closeTour();
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-0 max-h-[100dvh] w-full max-w-none bg-transparent p-4 text-foreground backdrop:bg-black/75 sm:p-6"
      aria-labelledby="rembr-tour-title"
      aria-describedby="rembr-tour-description"
      onCancel={handleCancel}
    >
      <section className="mx-auto grid min-h-[min(540px,calc(100dvh-3rem))] w-full max-w-xl content-center overflow-hidden rounded-3xl border border-white/10 bg-card p-6 shadow-2xl shadow-black/40 motion-safe:animate-[card-arrive_420ms_cubic-bezier(.2,.8,.2,1)_both] motion-reduce:animate-none sm:p-9">
        <div className="mb-6 flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" /> Workspace tour
          </span>
          <button type="button" onClick={closeTour} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-muted-foreground transition hover:bg-white/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none" aria-label="Close workspace tour">
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        {activeStep ? <StepContent
          step={activeStep}
          stepIndex={stepIndex ?? 0}
          onBack={() => setStepIndex((current) => Math.max(0, (current ?? 0) - 1))}
          onNext={() => {
            if ((stepIndex ?? 0) === steps.length - 1) closeTour();
            else setStepIndex((current) => (current ?? 0) + 1);
          }}
          onSkip={closeTour}
          onNavigate={onNavigate}
        /> : <WelcomeContent onStart={startTour} onSkip={closeTour} />}
      </section>
    </dialog>
  );
}

function WelcomeContent({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return <div>
    <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/10" aria-hidden="true">
      <Compass className="h-7 w-7" />
    </div>
    <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">A quick look around</p>
    <h1 id="rembr-tour-title" className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Take a tour of Rembr?</h1>
    <p id="rembr-tour-description" className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">In a few steps, see how to add a save, organize your library, and find things worth revisiting.</p>
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button type="button" onClick={onSkip} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-white/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none">Maybe later</button>
      <button type="button" onClick={onStart} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none">Take the tour <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  </div>;
}

function StepContent({ step, stepIndex, onBack, onNext, onSkip, onNavigate }: {
  step: TourStep;
  stepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onNavigate?: (path: string) => void;
}) {
  const StepIcon = step.icon;
  const isLastStep = stepIndex === steps.length - 1;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  return <div aria-live="polite" aria-atomic="true">
    <div className="mb-5 flex items-center justify-between gap-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Step {stepIndex + 1} of {steps.length}</p>
      <span className="text-xs font-semibold text-primary">{step.location}</span>
    </div>
    <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1}>
      <span className="block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
    </div>
    <div className="mb-6 grid h-12 w-12 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary" aria-hidden="true"><StepIcon className="h-5 w-5" /></div>
    <h2 id="rembr-tour-title" className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{step.title}</h2>
    <p id="rembr-tour-description" className="mt-3 text-sm leading-6 text-muted-foreground">{step.description}</p>
    {onNavigate && <button type="button" onClick={() => onNavigate(step.path)} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/25 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none">
      {step.action}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>}
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
      <button type="button" onClick={onBack} disabled={stepIndex === 0} className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onSkip} className="inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-white/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none">Skip tour</button>
        <button type="button" onClick={onNext} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none">
          {isLastStep ? <><Check className="h-4 w-4" aria-hidden="true" /> Finish</> : <>Next <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
        </button>
      </div>
    </div>
  </div>;
}

export default RembrWorkspaceTour;
