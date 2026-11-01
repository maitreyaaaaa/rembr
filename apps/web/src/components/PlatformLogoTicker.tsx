import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

export type PlatformLogo = {
  name: string;
  logo: string;
  background: string;
  fullTile?: boolean;
};

type PlatformLogoTickerProps = {
  platforms: PlatformLogo[];
  className: string;
  iconClassName: string;
};

export function PlatformLogoTicker({ platforms, className, iconClassName }: PlatformLogoTickerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const iconRef = useRef<HTMLSpanElement>(null);
  const activeIndexRef = useRef(0);

  useEffect(() => {
    if (platforms.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let timer = 0;
    let timeline: gsap.core.Timeline | undefined;
    const showNext = () => {
      if (document.hidden) {
        timer = window.setTimeout(showNext, 800);
        return;
      }

      const nextIndex = (activeIndexRef.current + 1) % platforms.length;
      activeIndexRef.current = nextIndex;
      const icon = iconRef.current;
      if (!icon) return;

      timeline = gsap.timeline({
        onComplete: () => {
          timer = window.setTimeout(showNext, 2450);
        },
      });
      timeline
        .to(icon, { autoAlpha: 0, y: -7, scale: 0.9, filter: 'blur(2px)', duration: 0.2, ease: 'power2.in' })
        .call(() => setActiveIndex(nextIndex))
        .fromTo(icon,
          { autoAlpha: 0, y: 7, scale: 0.9, filter: 'blur(2px)' },
          { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.42, ease: 'power3.out' },
        );
    };

    timer = window.setTimeout(showNext, 2500);
    return () => {
      window.clearTimeout(timer);
      timeline?.kill();
      if (iconRef.current) gsap.set(iconRef.current, { clearProps: 'all' });
    };
  }, [platforms.length]);

  const platform = platforms[activeIndex] ?? platforms[0];
  if (!platform) return null;

  return (
    <span className={className} role="img" aria-label={platform.name}>
      <span ref={iconRef} className={iconClassName} style={{ background: platform.background }}>
        <img
          className={platform.fullTile ? 'platform-brand-logo platform-brand-logo-full' : 'platform-brand-logo'}
          src={platform.logo}
          alt=""
          draggable={false}
        />
      </span>
    </span>
  );
}
