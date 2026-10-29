import { load } from 'cheerio';
import { repairMisdecodedUtf8 } from './text-normalization.js';

export interface ExtractedPage {
  title: string;
  description: string;
  text: string;
  mediaUrls: string[];
  /** Public image URLs exposed in page metadata/DOM, for temporary AI analysis only. */
  imageUrls: string[];
  /** Public video URLs exposed in page metadata/DOM, for temporary AI analysis only. */
  videoUrls: string[];
}

export function extractPage(html: string, sourceUrl: string): ExtractedPage {
  const page = load(html, { xml: false });
  page('script,style,noscript,svg,iframe,object,embed,template').remove();
  const isInstagram = /(^|\.)instagram\.com$/i.test(new URL(sourceUrl).hostname);
  const normalizeSourceText = (value: string) => isInstagram ? repairMisdecodedUtf8(value) : value;
  const title = normalizeSourceText((page('meta[property="og:title"]').attr('content')
    || page('meta[name="twitter:title"]').attr('content')
    || page('title').first().text()
    || new URL(sourceUrl).hostname).replace(/\s+/g, ' ').trim().slice(0, 240));
  const description = normalizeSourceText((page('meta[name="description"]').attr('content')
    || page('meta[property="og:description"]').attr('content')
    || '').replace(/\s+/g, ' ').trim().slice(0, 1200));
  const text = normalizeSourceText((page('main').text() || page('article').text() || page('body').text() || page.text())
    .replace(/\s+/g, ' ').trim().slice(0, 200_000));
  const mediaUrls: string[] = [];
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const addMedia = (raw: string | undefined) => {
    if (!raw || mediaUrls.length >= 5) return;
    try {
      const url = new URL(raw, sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
      url.hash = '';
      if (!mediaUrls.includes(url.toString())) mediaUrls.push(url.toString());
    } catch { /* Ignore malformed media metadata and keep the readable page. */ }
  };
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]',
    'meta[property="og:video"]', 'meta[property="og:video:url"]', 'meta[property="og:video:secure_url"]', 'meta[name="twitter:player:stream"]',
    'meta[property="og:audio"]', 'meta[property="og:audio:url"]', 'meta[property="og:audio:secure_url"]']) addMedia(page(selector).first().attr('content'));
  page('img[src]').each((_index, element) => { addMedia(page(element).attr('src')); });
  page('video[src], video source[src], audio[src], audio source[src]').each((_index, element) => { addMedia(page(element).attr('src')); });
  const addAnalysisMedia = (raw: string | undefined, kind: 'image' | 'video') => {
    if (!raw || (kind === 'image' ? imageUrls.length >= 20 : videoUrls.length >= 1)) return;
    try {
      const url = new URL(raw, sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
      url.hash = '';
      const target = kind === 'image' ? imageUrls : videoUrls;
      if (!target.includes(url.toString())) target.push(url.toString());
    } catch { /* Ignore malformed media metadata and keep the readable page. */ }
  };
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]']) {
    addAnalysisMedia(page(selector).first().attr('content'), 'image');
  }
  for (const selector of ['meta[property="og:video"]', 'meta[property="og:video:url"]', 'meta[property="og:video:secure_url"]', 'meta[name="twitter:player:stream"]']) {
    addAnalysisMedia(page(selector).first().attr('content'), 'video');
  }
  page('img[src], img[data-src], picture source[srcset]').each((_index, element) => {
    const node = page(element);
    const srcset = node.attr('srcset')?.split(',')[0]?.trim().split(/\s+/)[0];
    addAnalysisMedia(node.attr('src') || node.attr('data-src') || srcset, 'image');
  });
  page('video[src], video source[src]').each((_index, element) => addAnalysisMedia(page(element).attr('src'), 'video'));
  return { title: title || new URL(sourceUrl).hostname, description, text, mediaUrls, imageUrls, videoUrls };
}
