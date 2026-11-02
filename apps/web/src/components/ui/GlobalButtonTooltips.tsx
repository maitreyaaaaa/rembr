import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';

interface TooltipView {
  text: string;
  left: number;
  top: number;
  side: 'top' | 'bottom';
  entrance: 'standard' | 'quick';
}

const tooltipId = 'rembr-global-button-tooltip';
const buttonSelector = 'button:not(.quick-add-backdrop):not(.mobile-navigation-backdrop), [role="button"], a.primary-button, a.quiet-button, a.rg-button, .library-search-add, .iscraper-sidebar a, .iscraper-sidebar button';

function resolveButton(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(buttonSelector) : null;
}

function buttonLabel(button: HTMLElement): string {
  const explicit = button.dataset.tooltip?.trim();
  if (explicit) return explicit;

  const accessibleLabel = button.getAttribute('aria-label')?.trim();
  if (accessibleLabel) return accessibleLabel;

  const nativeTitle = button.getAttribute('title')?.trim();
  if (nativeTitle) return nativeTitle;

  const clone = button.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"], [hidden], .sr-only, .visually-hidden').forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function GlobalButtonTooltips() {
  const [view, setView] = useState<TooltipView | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const originalTitleRef = useRef<string | null>(null);
  const originalDescriptionRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastOpenedAtRef = useRef(0);
  const viewRef = useRef<TooltipView | null>(null);

  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };

    const releaseTrigger = (trigger: HTMLElement | null) => {
      if (!trigger) return;
      if (trigger.getAttribute('aria-describedby')?.split(/\s+/).includes(tooltipId)) {
        if (originalDescriptionRef.current) trigger.setAttribute('aria-describedby', originalDescriptionRef.current);
        else trigger.removeAttribute('aria-describedby');
      }
      if (originalTitleRef.current !== null) trigger.setAttribute('title', originalTitleRef.current);
      originalTitleRef.current = null;
      originalDescriptionRef.current = null;
    };

    const dismiss = () => {
      clearTimer();
      releaseTrigger(triggerRef.current);
      triggerRef.current = null;
      setView(null);
    };

    const positionFor = (trigger: HTMLElement, text: string, entrance: TooltipView['entrance']): TooltipView => {
      const rect = trigger.getBoundingClientRect();
      const estimatedWidth = Math.min(240, Math.max(92, text.length * 7 + 48));
      const halfWidth = estimatedWidth / 2;
      const left = Math.min(window.innerWidth - halfWidth - 10, Math.max(halfWidth + 10, rect.left + rect.width / 2));
      const side = rect.top > 72 ? 'top' : 'bottom';
      return { text, left, top: side === 'top' ? rect.top - 9 : rect.bottom + 9, side, entrance };
    };

    const show = (trigger: HTMLElement, text: string, entrance: TooltipView['entrance']) => {
      if (triggerRef.current && triggerRef.current !== trigger) releaseTrigger(triggerRef.current);
      triggerRef.current = trigger;
      originalDescriptionRef.current = trigger.getAttribute('aria-describedby');
      trigger.setAttribute('aria-describedby', [...(originalDescriptionRef.current?.split(/\s+/).filter(Boolean) ?? []), tooltipId].join(' '));
      originalTitleRef.current = trigger.getAttribute('title');
      if (originalTitleRef.current !== null) trigger.removeAttribute('title');
      lastOpenedAtRef.current = Date.now();
      setView(positionFor(trigger, text, entrance));
    };

    const scheduleShow = (trigger: HTMLElement | null) => {
      if (!trigger) return;
      const text = buttonLabel(trigger);
      if (!text) return;
      if (triggerRef.current === trigger && viewRef.current) return;
      clearTimer();
      const entrance: TooltipView['entrance'] = Date.now() - lastOpenedAtRef.current < 300 ? 'quick' : 'standard';
      timerRef.current = window.setTimeout(() => show(trigger, text, entrance), entrance === 'quick' ? 0 : 250);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      scheduleShow(resolveButton(event.target));
    };
    const onPointerOut = (event: PointerEvent) => {
      const trigger = resolveButton(event.target);
      if (!trigger || (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget))) return;
      if (document.activeElement === trigger) return;
      clearTimer();
      timerRef.current = window.setTimeout(dismiss, 90);
    };
    const onFocusIn = (event: FocusEvent) => scheduleShow(resolveButton(event.target));
    const onFocusOut = (event: FocusEvent) => {
      const trigger = resolveButton(event.target);
      if (!trigger || (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget))) return;
      if (trigger.matches(':hover')) return;
      clearTimer();
      timerRef.current = window.setTimeout(dismiss, 90);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    const onScroll = () => { if (viewRef.current) dismiss(); };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismiss);
      clearTimer();
      releaseTrigger(triggerRef.current);
    };
  }, []);

  if (!view) return null;
  return createPortal(
    <div
      id={tooltipId}
      className="rembr-global-tooltip"
      role="tooltip"
      data-side={view.side}
      data-entrance={view.entrance}
      style={{ left: view.left, top: view.top }}
    >
      <CircleHelp aria-hidden="true" />
      <span>{view.text}</span>
    </div>,
    document.body,
  );
}
