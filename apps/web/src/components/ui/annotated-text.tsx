import { useEffect, useRef, type ReactNode } from 'react';

export type AnnotationVariant = 'wavy' | 'underline' | 'highlight' | 'circle';

type AnnotatedTextProps = {
  children: ReactNode;
  variant?: AnnotationVariant;
  delay?: number;
  duration?: number;
  className?: string;
};

/**
 * A small CSS-first adaptation of Componentry's AnnotatedText for Rembr's
 * existing stylesheet. The SVG keeps the hand-drawn mark crisp at any size.
 */
export function AnnotatedText({
  children,
  variant = 'wavy',
  delay = 0,
  duration = 0.65,
  className = '',
}: AnnotatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const mark = element.querySelector<SVGPathElement>('[data-annotation-path]');
    if (!mark) return;
    const animation = mark.animate(
      variant === 'highlight'
        ? [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }]
        : [{ strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: 1 }],
      { duration: Math.max(0, duration) * 1000, delay: Math.max(0, delay) * 1000, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' },
    );
    animation.pause();
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        animation.play();
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => {
      observer.disconnect();
      animation.cancel();
    };
  }, [delay, duration, variant]);

  const path = {
    wavy: 'M2 8 C10 2 16 14 24 8 S38 2 46 8 S60 14 68 8 S82 2 90 8 S104 14 112 8 S126 2 138 8',
    underline: 'M2 7 Q38 2 70 6 T138 5',
    highlight: 'M3 5 Q36 2 70 4 T137 5 L136 21 Q100 24 70 21 T4 22 Z',
    circle: 'M7 31 C9 4 128 -2 136 29 C140 56 8 60 7 31 Z',
  }[variant];

  return (
    <span ref={ref} className={`annotated-text annotated-text--${variant} ${className}`.trim()}>
      <span className="annotated-text__label">{children}</span>
      <svg className="annotated-text__mark" viewBox={variant === 'highlight' ? '0 0 140 26' : '0 0 140 64'} preserveAspectRatio="none" aria-hidden="true">
      <path data-annotation-path d={path} pathLength="1" />
      </svg>
    </span>
  );
}
