/* Rembr adapter for the copied IScraper presentation components. */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  AlertCircle, ArrowLeft, ArrowRight, Bot, Brain, Check, CheckCircle2, ChevronDown, Clock,
  ExternalLink, Eye, FileText, Folder, Hash, Images, LifeBuoy, Loader2, Lock, Mail, Mic,
  RotateCcw, Search, ShieldCheck, Sparkles, Tag, Upload, Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

gsap.registerPlugin(ScrollTrigger);

const PLATFORM_LOGOS = [
  { name: 'Instagram', src: '/platforms/instagram-download.webp', bg: '#fff' },
  { name: 'Pinterest', src: '/platforms/pinterest-download.png', bg: '#e60023' },
  { name: 'X', src: '/platforms/x-download.png', bg: '#fff' },
];
const OUTCOME_WORDS = ['organized', 'searchable', 'findable', 'ready'];

function BrandLogo({ className = 'h-8 w-28', align = 'left' }) {
  return <span aria-label="Rembr" className={`rembr-source-wordmark ${className} ${align === 'center' ? 'justify-center' : ''}`}>rembr<span>.</span></span>;
}

function RotatingPlatformLogo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const logoRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      const target = logoRef.current;
      if (!target) return setActiveIndex((current) => (current + 1) % PLATFORM_LOGOS.length);
      gsap.timeline()
        .to(target, { yPercent: -115, autoAlpha: 0, duration: 0.35, ease: 'power2.in' })
        .add(() => setActiveIndex((current) => (current + 1) % PLATFORM_LOGOS.length))
        .set(target, { yPercent: 115 })
        .to(target, { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: 'power3.out' });
    }, 1600);
    return () => window.clearInterval(timer);
  }, []);

  const platform = PLATFORM_LOGOS[activeIndex];
  return <span className="hero-platform-ticker ml-[0.12em] inline-grid translate-y-[0.08em] overflow-hidden rounded-full align-baseline">
    <span ref={logoRef} className="inline-flex h-[0.86em] w-[0.86em] items-center justify-center rounded-full" style={{ background: platform.bg }} aria-label={platform.name}>
      <img src={platform.src} alt="" className="h-[0.56em] w-[0.56em] object-contain" draggable="false" />
    </span>
  </span>;
}

function RotatingOutcomeText() {
  const [activeIndex, setActiveIndex] = useState(0);
  const wordRef = useRef(null);
  const word = OUTCOME_WORDS[activeIndex];

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      const target = wordRef.current;
      if (!target) return setActiveIndex((current) => (current + 1) % OUTCOME_WORDS.length);
      gsap.timeline()
        .to(target, { yPercent: -115, autoAlpha: 0, duration: 0.35, ease: 'power2.in' })
        .add(() => setActiveIndex((current) => (current + 1) % OUTCOME_WORDS.length))
        .set(target, { yPercent: 115 })
        .to(target, { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: 'power3.out' });
    }, 1700);
    return () => window.clearInterval(timer);
  }, []);

  return <span className="inline-grid min-w-[6.4em] justify-items-center overflow-visible px-[0.08em] py-[0.06em] align-baseline text-center text-glow italic text-primary">
    <span ref={wordRef} className="inline-block whitespace-nowrap" aria-live="polite">{word}<span className="text-foreground">.</span></span>
  </span>;
}

async function readRembrSession() {
  try {
    const response = await fetch('/api/auth/session', { credentials: 'include' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

const authListeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('rembr:auth-change', async () => {
    const session = await readRembrSession();
    for (const listener of authListeners) listener('SIGNED_IN', session);
  });
}

const supabase = {
  auth: {
    async getSession() { return { data: { session: await readRembrSession() } }; },
    onAuthStateChange(callback) {
      authListeners.add(callback);
      return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
    },
    async signOut() {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      for (const listener of authListeners) listener('SIGNED_OUT', null);
      return { error: null };
    },
  },
};

async function getProfile() {
  const response = await fetch('/api/profile', { credentials: 'include' });
  if (!response.ok) throw new Error('Profile could not be loaded.');
  return response.json();
}

function avatarUrlForSession(session, profile) {
  return profile?.avatarAssetUrl || profile?.avatarUrl || session?.user?.avatarUrl || '';
}

function initialForSession(session, profile) {
  return String(profile?.username || session?.user?.email || 'R').trim().charAt(0).toUpperCase();
}

function recordSessionSignInActivity() {}
function identifyPostHogUser() {}
function resetPostHogUser() {}
function setApiAccessToken() {}
function resetPageScroll() { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
function scrollToSection(event, id) { event.preventDefault(); document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

const FEEDBACK_FEATURE_OPTIONS = ['Library', 'Search', 'Imports', 'Collections', 'Other'];
const SAVE_SOURCE_LABELS = ['instagram', 'pinterest', 'x', 'web', 'note'];

export {
  AlertCircle, ArrowLeft, ArrowRight, avatarUrlForSession, Bot, Brain, BrandLogo, Check, CheckCircle2,
  ChevronDown, Clock, ExternalLink, Eye, FEEDBACK_FEATURE_OPTIONS, FileText, Folder, LifeBuoy,
  getProfile, gsap, Hash, identifyPostHogUser, Images, initialForSession, Loader2, Lock,
  Mic, recordSessionSignInActivity, resetPageScroll, resetPostHogUser, RotateCcw,
  RotatingOutcomeText, RotatingPlatformLogo, SAVE_SOURCE_LABELS, scrollToSection,
  ScrollTrigger, Search, setApiAccessToken, ShieldCheck, Sparkles, supabase, Tag,
  Upload, useEffect, useRef, useState, Zap, Mail,
};
