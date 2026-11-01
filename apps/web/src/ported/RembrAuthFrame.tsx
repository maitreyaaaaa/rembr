import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Sparkles } from 'lucide-react';

export interface RembrAuthFrameProps {
  title: string;
  description: string;
  sideNote?: ReactNode;
  children: ReactNode;
}

/**
 * Editorial sign-in frame adapted from IScraper's auth composition and styled
 * with Rembr's existing auth shell classes. Authentication stays in the child.
 */
export function RembrAuthFrame({ title, description, sideNote, children }: RembrAuthFrameProps) {
  return (
    <main className="auth-shell">
      <section className="auth-story" aria-labelledby="rembr-auth-story-title">
        <Link className="wordmark" to="/" aria-label="Rembr home">
          <img className="rembr-official-logo auth-brand-logo" src="/brand/rembr-wordmark-white.png" alt="Rembr" />
        </Link>

        <div className="story-copy">
          <p className="eyebrow"><span className="eyebrow-mark" aria-hidden="true" /> A little space to think</p>
          <h1 id="rembr-auth-story-title">{title}</h1>
          <p className="auth-copy">{description}</p>
        </div>

        <div className="paper-scene" aria-hidden="true">
          <div className="paper-orbit paper-orbit-one" />
          <div className="paper-orbit paper-orbit-two" />
          <div className="paper-sheet paper-sheet-back"><span /><span /><span /></div>
          <article className="paper-sheet paper-sheet-front">
            <div className="paper-meta"><span>READING NOTE</span><span>KEPT FOR LATER</span></div>
            <div className="paper-rule" />
            <strong>Ideas have a way<br />of finding their way back.</strong>
            <p>A quiet place for what stays with you.</p>
            <div className="paper-lines"><i /><i /><i /></div>
            <span className="paper-bookmark"><Bookmark className="h-4 w-4" /></span>
          </article>
          <span className="paper-sticker"><Sparkles className="h-4 w-4" /><span>SAVED<br />WITH CARE</span></span>
        </div>

        {sideNote && <div className="story-footer">
          <span className="story-check" aria-hidden="true">✓</span>
          <span>{sideNote}</span>
          <span className="story-footer-dot" aria-hidden="true">·</span>
          <span>Private by design</span>
        </div>}
      </section>

      <section className="auth-card motion-safe:animate-[card-arrive_600ms_cubic-bezier(.2,.8,.2,1)_both] motion-reduce:animate-none" aria-label="Account access">
        {children}
      </section>
    </main>
  );
}

export default RembrAuthFrame;
