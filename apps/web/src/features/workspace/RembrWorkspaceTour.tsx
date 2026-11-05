import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, BookmarkPlus, Check, Compass, Network, Search, Sparkles, Upload } from 'lucide-react';

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
  target: string;
  location: string;
  icon: typeof Compass;
}

const steps: TourStep[] = [
  {
    title: 'Find a save when you need it.',
    description: 'Search your own library by keyword, or use AI + saved to combine web results with your saves when the provider is available.',
    path: '/app',
    target: 'search-ai',
    location: 'Your library',
    icon: Search,
  },
  {
    title: 'Reference a post or reel.',
    description: 'In AI + saved, type @ in this box and choose a saved post or reel to ground your question in it.',
    path: '/app?mode=web',
    target: 'reference-composer',
    location: 'Post and reel references',
    icon: Search,
  },
  {
    title: 'Save the good stuff in one tap.',
    description: 'Quick Add takes a link or a note. Rembr keeps the original source and shows when a save is ready.',
    path: '/app',
    target: 'quick-add',
    location: 'Quick Add',
    icon: BookmarkPlus,
  },
  {
    title: 'Bring your existing saves along.',
    description: 'Open Add Saves from the sidebar to save a link, write a note, or import bookmarks from Instagram, Pinterest, and X.',
    path: '/app/add',
    target: 'add-saves-nav',
    location: 'Add Saves',
    icon: Upload,
  },
  {
    title: 'Keep related saves together.',
    description: 'Smart Collections group related saves as your library grows. You can rename, pin, or hide a group without moving its saved items.',
    path: '/app/smart-collections',
    target: 'smart-collections-nav',
    location: 'Smart Collections',
    icon: Sparkles,
  },
  {
    title: 'See how your ideas connect.',
    description: 'The Knowledge Graph links saved pages through shared topics and sources. Drag to explore, zoom in, or select a node to follow a connection.',
    path: '/app/graph',
    target: 'graph-canvas',
    location: 'Knowledge Graph',
    icon: Network,
  },
];

interface Rect { top: number; right: number; bottom: number; left: number; width: number; height: number }

export function RembrWorkspaceTour({ open, onClose, onNavigate }: RembrWorkspaceTourProps) {
  const [internalOpen, setInternalOpen] = useState(open ?? true);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [panelTop, setPanelTop] = useState<number | null>(null);
  const [panelLeft, setPanelLeft] = useState<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const isOpen = open ?? internalOpen;
  const activeStep = stepIndex === null ? null : steps[stepIndex];

  useEffect(() => {
    if (open !== undefined) setInternalOpen(open);
  }, [open]);

  useEffect(() => {
    if (!activeStep) {
      setTargetRect(null);
      return undefined;
    }

    let frame = 0;
    let attempt = 0;
    let target: HTMLElement | null = null;
    let alive = true;
    const selector = `[data-rembr-tour-target="${activeStep.target}"]`;
    const update = () => {
      if (!alive) return;
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
      target = candidates.find((candidate) => candidate.getClientRects().length > 0) ?? null;
      if (!target) {
        if (attempt++ < 30) frame = window.setTimeout(update, 80);
        return;
      }
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center', inline: 'center' });
      const measure = () => {
        if (!alive || !target) return;
        const rect = target.getBoundingClientRect();
        const padding = 10;
        const next = {
          top: Math.max(8, rect.top - padding),
          left: Math.max(8, rect.left - padding),
          right: Math.min(window.innerWidth - 8, rect.right + padding),
          bottom: Math.min(window.innerHeight - 8, rect.bottom + padding),
          width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
          height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
        };
        setTargetRect(next);
        const cardHeight = cardRef.current?.offsetHeight ?? 340;
        const cardWidth = Math.min(380, window.innerWidth - 32);
        const gap = 16;
        const roomBelow = window.innerHeight - rect.bottom;
        const roomAbove = rect.top;
        const roomRight = window.innerWidth - rect.right;
        const roomLeft = rect.left;
        const fitsBelow = roomBelow >= cardHeight + gap;
        const fitsAbove = roomAbove >= cardHeight + gap;
        const fitsBeside = roomRight >= cardWidth + gap + 16 || roomLeft >= cardWidth + gap + 16;
        const panelBesideTarget = fitsBeside && (rect.width >= cardWidth || (!fitsBelow && !fitsAbove));
        const nextTop = panelBesideTarget
          ? Math.max(16, Math.min(window.innerHeight - cardHeight - 16, rect.top + (rect.height - cardHeight) / 2))
          : fitsBelow
          ? rect.bottom + gap
          : fitsAbove
            ? rect.top - cardHeight - gap
            : Math.max(16, Math.min(window.innerHeight - cardHeight - 16, rect.bottom + gap));
        setPanelTop(nextTop);
        const nextLeft = panelBesideTarget
          ? roomRight >= cardWidth + gap + 16 ? rect.right + gap : rect.left - cardWidth - gap
          : Math.max(16, Math.min(rect.left + rect.width / 2 - cardWidth / 2, window.innerWidth - cardWidth - 16));
        setPanelLeft(nextLeft);
      };
      measure();
      window.addEventListener('resize', measure);
      window.addEventListener('scroll', measure, true);
      const cleanup = () => {
        alive = false;
        window.removeEventListener('resize', measure);
        window.removeEventListener('scroll', measure, true);
      };
      targetCleanup.current = cleanup;
    };

    update();
    const card = cardRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => card?.querySelector<HTMLElement>('[data-tour-primary]')?.focus(), 80);

    return () => {
      alive = false;
      window.clearTimeout(frame);
      window.clearTimeout(focusTimer);
      targetCleanup.current?.();
      targetCleanup.current = null;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [activeStep]);

  useEffect(() => {
    if (activeStep && onNavigate) {
      onNavigate(activeStep.path);
    }
  }, [activeStep, onNavigate]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeTour(); }
      if (event.key === 'ArrowRight' && activeStep) { event.preventDefault(); advance(); }
      if (event.key === 'ArrowLeft' && activeStep) { event.preventDefault(); setStepIndex((index) => Math.max(0, (index ?? 0) - 1)); }
      if (event.key === 'Tab') {
        const focusable = cardRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, activeStep]);

  const targetCleanup = useRef<(() => void) | null>(null);

  function closeTour() {
    setStepIndex(null);
    if (open === undefined) setInternalOpen(false);
    onClose();
  }

  function advance() {
    if ((stepIndex ?? 0) >= steps.length - 1) closeTour();
    else setStepIndex((current) => (current ?? 0) + 1);
  }

  function startTour() { setStepIndex(0); }

  if (!isOpen || typeof document === 'undefined') return null;

  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  const left = targetRect?.left ?? 0;
  const right = targetRect?.right ?? viewWidth;
  const top = targetRect?.top ?? 0;
  const bottom = targetRect?.bottom ?? viewHeight;

  return createPortal(
    <div className={`rembr-tour-layer ${activeStep ? `is-guided ${targetRect ? 'has-target' : 'target-pending'}` : 'is-welcome'}`} onClick={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }}>
      {activeStep && targetRect ? <>
        <div className="rembr-tour-dim rembr-tour-dim-top" style={{ height: top }} />
        <div className="rembr-tour-dim rembr-tour-dim-bottom" style={{ top: bottom }} />
        <div className="rembr-tour-dim rembr-tour-dim-left" style={{ top, width: left, height: Math.max(0, bottom - top) }} />
        <div className="rembr-tour-dim rembr-tour-dim-right" style={{ top, left: right, height: Math.max(0, bottom - top) }} />
        <div className="rembr-tour-focus" style={{ top, left, width: Math.max(24, right - left), height: Math.max(24, bottom - top) }} aria-hidden="true" />
      </> : <div className="rembr-tour-welcome-wash" aria-hidden="true" />}

      <section ref={cardRef} className={`rembr-tour-card ${activeStep ? 'rembr-tour-card-step' : 'rembr-tour-card-welcome'}`} role="dialog" aria-modal="true" aria-labelledby="rembr-tour-title" aria-describedby="rembr-tour-description" style={activeStep && panelTop !== null ? { top: panelTop, left: panelLeft ?? 16 } : undefined}>
        <div className="rembr-tour-topline">
          <span className="rembr-tour-badge"><Compass size={13} aria-hidden="true" /> Rembr tour</span>
          <button type="button" className="rembr-tour-close" onClick={closeTour} aria-label="Close tour">×</button>
        </div>

        {activeStep ? <StepContent key={stepIndex}
          step={activeStep}
          stepIndex={stepIndex ?? 0}
          onBack={() => setStepIndex((current) => Math.max(0, (current ?? 0) - 1))}
          onNext={advance}
          onSkip={closeTour}
        /> : <WelcomeContent onStart={startTour} onSkip={closeTour} />}
      </section>
    </div>,
    document.body,
  );
}

function WelcomeContent({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return <div className="rembr-tour-welcome-copy">
    <div className="rembr-tour-mark" aria-hidden="true"><Compass size={26} /></div>
    <p className="rembr-tour-eyebrow">A quick look around</p>
    <h1 id="rembr-tour-title">Your saves, ready when you need them.</h1>
    <p id="rembr-tour-description">In six quick stops, learn to find and reference saves, add to your library, and follow ideas across the graph.</p>
    <div className="rembr-tour-actions">
      <button type="button" className="rembr-tour-secondary" onClick={onSkip}>Maybe later</button>
      <button type="button" data-tour-primary onClick={onStart} className="rembr-tour-primary">Take the tour <ArrowRight size={16} aria-hidden="true" /></button>
    </div>
  </div>;
}

function StepContent({ step, stepIndex, onBack, onNext, onSkip }: {
  step: TourStep;
  stepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const StepIcon = step.icon;
  const progress = ((stepIndex + 1) / steps.length) * 100;
  const isLast = stepIndex === steps.length - 1;

  return <div className="rembr-tour-step-content" aria-live="polite" aria-atomic="true">
    <div className="rembr-tour-step-meta"><span>STEP {String(stepIndex + 1).padStart(2, '0')} <i>/</i> {String(steps.length).padStart(2, '0')}</span><span>{step.location}</span></div>
    <div className="rembr-tour-progress" role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1}><span style={{ width: `${progress}%` }} /></div>
    <div className="rembr-tour-step-icon"><StepIcon size={19} aria-hidden="true" /></div>
    <h2 id="rembr-tour-title">{step.title}</h2>
    <p id="rembr-tour-description">{step.description}</p>
    <div className="rembr-tour-footer">
      <button type="button" className="rembr-tour-back" onClick={onBack} disabled={stepIndex === 0}><ArrowLeft size={15} aria-hidden="true" /> Back</button>
      <button type="button" className="rembr-tour-skip" onClick={onSkip}>Skip</button>
      <button type="button" data-tour-primary className="rembr-tour-primary" onClick={onNext}>{isLast ? <>Finish <Check size={15} aria-hidden="true" /></> : <>Next <ArrowRight size={15} aria-hidden="true" /></>}</button>
    </div>
  </div>;
}

export default RembrWorkspaceTour;
