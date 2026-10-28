import { load } from 'cheerio';

export interface ExtractedPage {
  title: string;
  description: string;
  text: string;
  mediaUrls: string[];
}

export function extractPage(html: string, sourceUrl: string): ExtractedPage {
  const page = load(html, { xml: false });
  page('script,style,noscript,svg,iframe,object,embed,template').remove();
  const title = (page('meta[property="og:title"]').attr('content')
    || page('meta[name="twitter:title"]').attr('content')
    || page('title').first().text()
    || new URL(sourceUrl).hostname).replace(/\s+/g, ' ').trim().slice(0, 240);
  const description = (page('meta[name="description"]').attr('content')
    || page('meta[property="og:description"]').attr('content')
    || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  const text = (page('main').text() || page('article').text() || page('body').text() || page.text())
    .replace(/\s+/g, ' ').trim().slice(0, 200_000);
  const mediaUrls: string[] = [];
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
  return { title: title || new URL(sourceUrl).hostname, description, text, mediaUrls };
}
