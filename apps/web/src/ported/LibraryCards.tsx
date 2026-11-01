import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock3, Eye, FileText, Image as ImageIcon, LoaderCircle, RotateCcw, XCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface LibraryCardItem {
  id: string;
  kind: 'page' | 'note';
  url: string;
  title: string;
  titleOverride?: string | null;
  description: string;
  descriptionOverride?: string | null;
  textPreview: string;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  status: 'queued' | 'processing' | 'retry_wait' | 'cancel_requested' | 'cancelled' | 'paused' | 'partial' | 'ready' | 'failed';
  tags: Array<{ id: string; name: string }>;
  collections: Array<{ id: string; name: string }>;
  note?: { body: string; links: Array<string>; assets: Array<{ id: string; url: string; mime: string; byteSize: number }> };
  media?: Array<{ id: string; url: string | null; mime: string | null; byteSize: number; status: 'ready' | 'failed'; errorCode: string | null }>;
  cover?: { url: string; mime: string; byteSize: number } | null;
}

interface Props {
  items: LibraryCardItem[];
  searchActive: boolean;
  feedback: Record<string, 'helpful' | 'not_helpful'>;
  onFeedback: (item: LibraryCardItem, rating: 'helpful' | 'not_helpful') => void;
  onRemove: (item: LibraryCardItem) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string;
  onLoadMore?: () => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
}

const layouts = [
  { key: 'grid', label: 'Pins' },
  { key: 'gallery', label: 'Gallery' },
  { key: 'list', label: 'List' },
] as const;

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Saved page'; }
}

function itemData(item: LibraryCardItem) {
  const note = item.kind === 'note';
  const thumbnail = item.cover?.url
    ?? item.media?.find((asset) => asset.status === 'ready' && asset.url && asset.mime?.startsWith('image/'))?.url
    ?? item.note?.assets.find((asset) => asset.mime.startsWith('image/'))?.url
    ?? null;
  const title = item.titleOverride || item.title || 'Untitled save';
  const preview = item.descriptionOverride || item.description || item.note?.body || item.textPreview || 'No preview available.';
  const chip = item.collections[0]?.name || item.tags[0]?.name || '';
  const statusLabel = ({ ready: 'Ready', queued: 'Queued', processing: 'Processing', retry_wait: 'Retry scheduled', failed: 'Failed', partial: 'Partially ready', paused: 'Paused', cancelled: 'Canceled', cancel_requested: 'Canceling' } as Record<string, string>)[item.status] ?? 'Saved';
  const StatusIcon = item.status === 'ready' ? CheckCircle2 : item.status === 'failed' ? XCircle : item.status === 'processing' ? LoaderCircle : item.status === 'queued' ? Clock3 : item.status === 'retry_wait' ? RotateCcw : AlertCircle;
  return { note, thumbnail, title, preview, chip, statusLabel, StatusIcon, source: note ? 'Personal note' : host(item.url) };
}

export function PortedLibraryGrid({ items, searchActive, feedback, onFeedback, onRemove, hasMore = false, loadingMore = false, loadMoreError = '', onLoadMore, sort = 'created_desc', onSortChange }: Props) {
  const [layout, setLayout] = useState<(typeof layouts)[number]['key']>('grid');
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore || loadMoreError || !onLoadMore) return undefined;
    const root = document.querySelector('.rembr-dashboard-main');
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    }, { root, rootMargin: '640px 0px', threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMoreError, onLoadMore]);
  return <section className="source-library-results" aria-label="Saved library">
    <div className="source-library-toolbar">
      <p className="source-library-count">{items.length}{hasMore ? '+' : ''} saved {items.length === 1 && !hasMore ? 'item' : 'items'}</p>
      <div className="source-library-layout" aria-label="Library layout">
        {layouts.map(({ key, label }) => <button type="button" key={key} aria-pressed={layout === key} onClick={() => setLayout(key)}>{label}</button>)}
      </div>
      <label className="source-library-sort" aria-label="Sort saved items">
        <span>Sort</span>
        <select value={sort === 'created_asc' ? 'created_asc' : sort === 'relevance' ? 'relevance' : 'created_desc'} onChange={(event) => onSortChange?.(event.currentTarget.value)}>
          {searchActive && <option value="relevance">Relevant</option>}
          <option value="created_desc">Newest</option>
          <option value="created_asc">Oldest</option>
        </select>
      </label>
    </div>
    <div className={`source-library-grid ${layout === 'list' ? 'is-list' : layout === 'gallery' ? 'is-gallery' : 'is-masonry'}`}>
      {items.map((item, index) => <LibraryCard key={item.id} item={item} index={index} layout={layout} searchActive={searchActive} feedback={feedback[item.id]} onFeedback={onFeedback} onRemove={onRemove} />)}
      {loadingMore && <LibraryCardSkeletons count={4} layout={layout} />}
    </div>
    <div ref={sentinelRef} className="library-infinite-scroll-sentinel" aria-hidden="true" />
    {loadMoreError && <div className="phase2-state" role="alert">{loadMoreError} <button className="quiet-button" type="button" onClick={onLoadMore}>Retry</button></div>}
    {!hasMore && items.length > 0 && <p className="source-library-end" role="status">You’re all caught up.</p>}
  </section>;
}

export function LibraryCardSkeletons({ count = 12, layout = 'grid' }: { count?: number; layout?: 'grid' | 'gallery' | 'list' }) {
  const heights = [0.78, 1.04, 0.9, 1.18, 0.84, 1.1, 0.96, 0.75];
  return <div className={`source-library-skeleton-grid ${layout === 'list' ? 'is-list' : layout === 'gallery' ? 'is-gallery' : 'is-masonry'}`} role="status" aria-label="Loading saved items">
    {Array.from({ length: count }, (_, index) => <div className="source-library-card-skeleton" key={index} style={{ '--skeleton-ratio': heights[index % heights.length] } as React.CSSProperties}><div className="source-library-card-skeleton-cover" /><div className="source-library-card-skeleton-lines"><i /><i /><i /></div></div>)}
  </div>;
}

function LibraryCard({ item, index, layout, searchActive, feedback, onFeedback, onRemove }: {
  item: LibraryCardItem;
  index: number;
  layout: 'grid' | 'gallery' | 'list';
  searchActive: boolean;
  feedback?: 'helpful' | 'not_helpful';
  onFeedback: Props['onFeedback'];
  onRemove: Props['onRemove'];
}) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const detailHref = `/app/items/${encodeURIComponent(item.id)}${location.search}`;
  const { note, thumbnail, title, preview, chip, statusLabel, StatusIcon, source } = itemData(item);
  const backdrops = ['#d6ff24', '#f4f4f0', '#a5ff18', '#29ffc6', '#e5e7eb', '#86efac'];
  const ratios = ['4 / 5', '3 / 4', '1 / 1', '2 / 3', '5 / 4', '3 / 5'];
  if (layout === 'list') return <article className="source-library-row">
    <Link className="source-library-row-copy" to={detailHref} state={{ returnTo }}>
      <div className="source-library-meta"><span>{note ? 'My note' : 'Saved page'}</span>{chip && <span>{chip}</span>}<span className={`source-status is-${item.status}`}><StatusIcon />{statusLabel}</span></div>
      <h2>{title}</h2><p className="source-library-domain">{source}</p><p className="source-library-preview">{preview}</p>
    </Link>
    {thumbnail ? <img src={thumbnail} alt="" loading="lazy" decoding="async" /> : <div className="source-library-row-placeholder">{note ? <FileText /> : <Eye />}</div>}
    <LibraryCardActions item={item} returnTo={returnTo} searchActive={searchActive} feedback={feedback} onFeedback={onFeedback} onRemove={onRemove} />
  </article>;

  if (layout === 'gallery') return <article className="source-library-gallery group">
    <Link className="source-library-gallery-visual" to={detailHref} state={{ returnTo }}>
      {thumbnail ? <img src={thumbnail} alt="" loading="lazy" decoding="async" /> : <div className="source-library-gallery-empty"><span>{note ? <FileText /> : <ImageIcon />}</span><small>Preview pending</small><p>{preview}</p></div>}
      <span className="source-library-platform">{note ? 'My note' : 'Saved page'}</span>
    </Link>
    <div className="source-library-gallery-copy"><div className="source-library-meta"><span>{source}</span><span className={`source-status is-${item.status}`}><StatusIcon />{statusLabel}</span></div><Link to={detailHref} state={{ returnTo }}><h2>{title}</h2></Link><p className="source-library-preview">{preview}</p>{chip && <span className="source-library-chip">{chip}</span>}<LibraryCardActions item={item} returnTo={returnTo} searchActive={searchActive} feedback={feedback} onFeedback={onFeedback} onRemove={onRemove} /></div>
  </article>;

  return <article className="source-library-pin group" style={{ '--pin-backdrop': backdrops[index % backdrops.length], '--pin-ratio': ratios[index % ratios.length] } as React.CSSProperties}>
    <Link className="source-library-pin-cover" to={detailHref} state={{ returnTo }}>
      {thumbnail && <img src={thumbnail} alt="" loading="lazy" decoding="async" />}
      <div className="source-library-pin-top"><span>{note ? 'My note' : 'Saved page'}</span><i>{note ? <FileText /> : <Eye />}</i></div>
      <div className="source-library-pin-title">{chip && <span>{chip}</span>}<h2>{title}</h2></div>
    </Link>
    <div className="source-library-pin-copy"><div className="source-library-meta"><span>{source}</span>{!note && <span className={`source-status is-${item.status}`}><StatusIcon />{statusLabel}</span>}</div><p className="source-library-preview">{preview}</p><LibraryCardActions item={item} returnTo={returnTo} searchActive={searchActive} feedback={feedback} onFeedback={onFeedback} onRemove={onRemove} /></div>
  </article>;
}

function LibraryCardActions({ item, returnTo, searchActive, feedback, onFeedback, onRemove }: {
  item: LibraryCardItem;
  returnTo: string;
  searchActive: boolean;
  feedback?: 'helpful' | 'not_helpful';
  onFeedback: Props['onFeedback'];
  onRemove: Props['onRemove'];
}) {
  return <div className="source-library-actions">
    {searchActive && <div className="source-library-feedback"><span>Useful?</span><button type="button" aria-pressed={feedback === 'helpful'} onClick={() => onFeedback(item, 'helpful')}>Yes</button><button type="button" aria-pressed={feedback === 'not_helpful'} onClick={() => onFeedback(item, 'not_helpful')}>No</button></div>}
    <Link to={`/app/items/${encodeURIComponent(item.id)}/edit`} state={{ returnTo }} aria-label={`Edit ${item.title}`}>Edit <ArrowUpRight /></Link>
    <button type="button" className="source-library-remove" onClick={() => onRemove(item)} aria-label={`Remove ${item.title}`}>Remove</button>
  </div>;
}
