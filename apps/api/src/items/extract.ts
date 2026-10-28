import { load } from 'cheerio';

export interface ExtractedPage {
  title: string;
  description: string;
  text: string;
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
  return { title: title || new URL(sourceUrl).hostname, description, text };
}
