import { useEffect, useRef, useState } from 'react';
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
  const iconRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (platforms.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const icon = iconRef.current;
      if (!icon) {
        setActiveIndex((current) => (current + 1) % platforms.length);
        return;
      }

      timelineRef.current?.kill();
      timelineRef.current = gsap.timeline()
        .to(icon, { yPercent: -115, autoAlpha: 0, duration: 0.35, ease: 'power2.in' })
        .call(() => setActiveIndex((current) => (current + 1) % platforms.length))
        .set(icon, { yPercent: 115 })
        .to(icon, { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: 'power3.out' });
    }, 1600);

    return () => {
      window.clearInterval(timer);
      timelineRef.current?.kill();
      if (iconRef.current) gsap.set(iconRef.current, { clearProps: 'all' });
    };
  }, [platforms.length]);

  const platform = platforms[activeIndex] ?? platforms[0];
  if (!platform) return null;

  return (
    <span className={className} role="img" aria-label={platform.name}>
      <span ref={iconRef} className={iconClassName} style={{ background: platform.bg }}>
        <img
          className="platform-brand-logo"
          src={platform.logo}
          alt=""
          style={{ transform: `scale(${platform.scale ?? 1})` }}
          draggable={false}
        />
      </span>
    </span>
  );
}
