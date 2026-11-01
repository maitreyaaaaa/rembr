import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

export type PlatformLogo = {
  name: string;
  logo: string;
  bg: string;
  scale?: number;
};

type PlatformLogoTickerProps = {
  platforms: PlatformLogo[];
  className: string;
  iconClassName: string;
};

export function PlatformLogoTicker({ platforms, className, iconClassName }: PlatformLogoTickerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [slotIndexes, setSlotIndexes] = useState<[number, number]>([0, -1]);
  const [transition, setTransition] = useState<{ from: number; to: number; index: number } | null>(null);
  const activeIndexRef = useRef(0);
  const activeSlotRef = useRef(0);
  const transitionRef = useRef(false);
  const slotRefs = useRef<[HTMLSpanElement | null, HTMLSpanElement | null]>([null, null]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    // Warm the browser cache before the first transition so a slow logo request
    // cannot extend the time the ticker appears empty.
    const images = platforms.map(({ logo }) => {
      const image = new Image();
      image.src = logo;
      void image.decode?.().catch(() => undefined);
      return image;
    });
    return () => { images.forEach((image) => { image.onload = null; image.onerror = null; }); };
  }, [platforms]);

  useLayoutEffect(() => {
    if (!transition) return undefined;
    const outgoing = slotRefs.current[transition.from];
    const incoming = slotRefs.current[transition.to];
    if (!outgoing || !incoming) {
      activeSlotRef.current = transition.to;
      activeIndexRef.current = transition.index;
      transitionRef.current = false;
      setActiveIndex(transition.index);
      setTransition(null);
      return undefined;
    }

    timelineRef.current?.kill();
    transitionRef.current = true;
    timelineRef.current = gsap.timeline({ onComplete: () => {
      activeSlotRef.current = transition.to;
      activeIndexRef.current = transition.index;
      transitionRef.current = false;
      setActiveIndex(transition.index);
      setTransition(null);
    } })
      .to(outgoing, { yPercent: -115, autoAlpha: 0, duration: 0.35, ease: 'power2.in' }, 0)
      .fromTo(incoming, { yPercent: 115, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: 'power3.out' }, 0);

    return () => { timelineRef.current?.kill(); };
  }, [transition]);

  useEffect(() => {
    if (platforms.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const timer = window.setInterval(() => {
      if (document.hidden || transitionRef.current) return;
      const nextIndex = (activeIndexRef.current + 1) % platforms.length;
      const incomingSlot = 1 - activeSlotRef.current;
      transitionRef.current = true;
      setSlotIndexes((current) => incomingSlot === 0
        ? [nextIndex, current[1]]
        : [current[0], nextIndex]);
      setTransition({ from: activeSlotRef.current, to: incomingSlot, index: nextIndex });
    }, 1600);

    return () => {
      window.clearInterval(timer);
      timelineRef.current?.kill();
    };
  }, [platforms.length]);

  const platform = platforms[activeIndex] ?? platforms[0];
  if (!platform) return null;

  return (
    <span className={`${className} platform-ticker-stage`} role="img" aria-label={platform.name}>
      {slotIndexes.map((index, slot) => {
        const current = platforms[index];
        return <span
          key={slot}
          ref={(element) => { slotRefs.current[slot] = element; }}
          className={`${iconClassName} platform-ticker-layer`}
          style={{ background: current?.bg ?? 'transparent', opacity: slot === activeSlotRef.current ? 1 : 0, transform: slot === activeSlotRef.current ? 'translateY(0)' : 'translateY(115%)' }}
          aria-hidden="true"
        >
          {current && <img
            className="platform-brand-logo"
            src={current.logo}
            alt=""
            style={{ transform: `scale(${current.scale ?? 1})` }}
            draggable={false}
          />}
        </span>;
      })}
    </span>
  );
}
