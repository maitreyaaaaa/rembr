import { inflateRawSync } from 'node:zlib';
import { load } from 'cheerio';

export type ImportPlatform = 'instagram' | 'pinterest' | 'x';
export interface ImportFile { name: string; bytes: Buffer }
export interface ParsedImportItem {
  platform: ImportPlatform;
  url: string;
  sourceId: string | null;
  title: string;
  description: string;
  collection: string | null;
  metadata: Record<string, string | string[]>;
}
export class ImportParseError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ImportParseError'; }
}

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5_000;
const URL_PATTERN = /https?:\\?\/\\?\/(?:www\.|m\.|mobile\.|basic\.)?(?:instagram\.com|(?:[a-z0-9-]+\.)*pinterest\.com|pin\.it|x\.com|twitter\.com)\/[^\s"'<>\\]+/gi;

function safeHttpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.replaceAll('\\/', '/'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    url.protocol = 'https:';
    return url;
  } catch { return null; }
}

function normalizeInstagramUrl(value: string): string | null {
  try {
    const url = safeHttpsUrl(value);
    if (!url) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return null;
    if (!/^\/(?:p|reels?|tv)\/[a-z\d_-]+\/?$/i.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/^\/reels\//i, '/reel/');
    url.hostname = 'www.instagram.com'; url.search = ''; url.hash = '';
    return url.toString();
  } catch { return null; }
}

function normalizePinterestUrl(value: string): string | null {
  try {
    const url = safeHttpsUrl(value);
    if (!url) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'pin.it') { url.search = ''; url.hash = ''; return url.toString(); }
    if (host !== 'pinterest.com' && !host.endsWith('.pinterest.com')) return null;
    const match = url.pathname.match(/^\/pin\/(\d+)/i);
    if (!match) return null;
    return `https://www.pinterest.com/pin/${match[1]}/`;
  } catch { return null; }
}

function normalizeXUrl(value: string): string | null {
  try {
    const url = safeHttpsUrl(value);
    if (!url) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^mobile\./, '');
    if (!['x.com', 'twitter.com'].includes(host)) return null;
    const match = url.pathname.match(/^\/(?:[a-z\d_]+|i)\/status\/(\d+)/i);
    return match ? `https://x.com/i/status/${match[1]}` : null;
  } catch { return null; }
}

function platformForName(name: string): ImportPlatform | null {
  const path = name.replaceAll('\\', '/').toLowerCase();
  if (/(?:saved_posts|saved_collections)/.test(path)) return 'instagram';
  if (/(?:bookmark|pauch)/.test(path)) return 'x';
  if (/(?:pins|boards|boards_followed)/.test(path)) return 'pinterest';
  return null;
}

function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value.length === 0) quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (quoted) throw new ImportParseError('malformed_csv', 'The CSV export has an unclosed quoted field.');
  if (value.length || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function decodeText(bytes: Buffer): string {
  if (bytes.includes(0)) throw new ImportParseError('unsupported_binary_file', 'This export contains unsupported binary content.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ImportParseError('invalid_text_encoding', 'The export must use valid UTF-8 text.'); }
}

interface ZipEntry { name: string; bytes: Buffer }
const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});
function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zipEntries(archive: Buffer): ZipEntry[] {
  if (archive.length > MAX_ARCHIVE_BYTES) throw new ImportParseError('archive_too_large', 'The expanded archive exceeds the 100 MiB limit.');
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50 && offset + 22 + archive.readUInt16LE(offset + 20) === archive.length) { eocd = offset; break; }
  }
  if (eocd < 0) throw new ImportParseError('invalid_archive', 'This ZIP archive is incomplete or invalid.');
  if (archive.readUInt16LE(eocd + 4) !== 0 || archive.readUInt16LE(eocd + 6) !== 0) throw new ImportParseError('unsupported_archive', 'Multi-disk ZIP archives are not supported.');
  if (archive.readUInt16LE(eocd + 8) !== archive.readUInt16LE(eocd + 10)) throw new ImportParseError('invalid_archive', 'The ZIP central directory is inconsistent.');
  const count = archive.readUInt16LE(eocd + 10); const directorySize = archive.readUInt32LE(eocd + 12); const directoryOffset = archive.readUInt32LE(eocd + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new ImportParseError('unsupported_archive', 'ZIP64 archives are not supported.');
  if (count > MAX_ARCHIVE_ENTRIES || directoryOffset + directorySize > eocd) throw new ImportParseError('archive_limits_exceeded', 'The archive exceeds the 5,000-entry limit or has an invalid directory.');
  const result: ZipEntry[] = []; let cursor = directoryOffset; const directoryEnd = directoryOffset + directorySize; let expanded = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > directoryEnd || archive.readUInt32LE(cursor) !== 0x02014b50) throw new ImportParseError('invalid_archive', 'This ZIP archive has a malformed directory.');
    const crc = archive.readUInt32LE(cursor + 16); const flags = archive.readUInt16LE(cursor + 8); const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20); const expandedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28); const extraLength = archive.readUInt16LE(cursor + 30); const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameLength + extraLength + commentLength > directoryEnd) throw new ImportParseError('invalid_archive', 'This ZIP archive has an invalid directory entry.');
    const name = decodeText(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0) throw new ImportParseError('encrypted_archive', 'Password-protected ZIP archives are not supported.');
    if (name.endsWith('/')) continue;
    if (name.startsWith('/') || name.split(/[\\/]/).some((part) => part === '..')) throw new ImportParseError('invalid_archive_path', 'The archive contains an unsafe file path.');
    expanded += expandedSize;
    if (expanded > MAX_ARCHIVE_BYTES) throw new ImportParseError('archive_too_large', 'The expanded archive exceeds the 100 MiB limit.');
    if (expandedSize > MAX_ARCHIVE_BYTES || localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new ImportParseError('invalid_archive', 'This ZIP archive has an invalid file entry.');
    if (archive.readUInt16LE(localOffset + 6) !== flags || archive.readUInt16LE(localOffset + 8) !== method) throw new ImportParseError('invalid_archive', 'ZIP entry headers do not match.');
    const localNameLength = archive.readUInt16LE(localOffset + 26); const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength; const end = start + compressedSize;
    if (end > archive.length) throw new ImportParseError('invalid_archive', 'This ZIP archive has a truncated file entry.');
    const localName = decodeText(archive.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== name) throw new ImportParseError('invalid_archive', 'ZIP entry names do not match.');
    const compressed = archive.subarray(start, end); let bytes: Buffer;
    try {
      if (method === 0) bytes = Buffer.from(compressed);
      else if (method === 8) bytes = inflateRawSync(compressed, { maxOutputLength: Math.max(1, MAX_ARCHIVE_BYTES - (expanded - expandedSize)) });
      else throw new ImportParseError('unsupported_compression', 'This ZIP archive uses an unsupported compression method.');
    } catch (error) {
      if (error instanceof ImportParseError) throw error;
      throw new ImportParseError('invalid_archive', 'This ZIP archive could not be safely expanded.');
    }
    if (bytes.length !== expandedSize) throw new ImportParseError('invalid_archive', 'A ZIP entry did not match its declared size.');
    if ((flags & 8) === 0 && archive.readUInt32LE(localOffset + 14) !== crc) throw new ImportParseError('invalid_archive', 'ZIP entry checksums do not match.');
    if (crc32(bytes) !== crc) throw new ImportParseError('invalid_archive', 'A ZIP entry failed its integrity check.');
    result.push({ name, bytes });
  }
  if (cursor !== directoryEnd) throw new ImportParseError('invalid_archive', 'The ZIP central directory length is inconsistent.');
  return result;
}

function stringsFromJson(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') result.push(value);
  else if (Array.isArray(value)) for (const child of value) stringsFromJson(child, result);
  else if (value && typeof value === 'object') for (const child of Object.values(value)) stringsFromJson(child, result);
  return result;
}

function hashtags(value: string): string[] {
  return [...new Set([...value.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]!.toLowerCase()))].slice(0, 40);
}

function instagramMapValue(map: Record<string, unknown>, labels: string[]): string {
  for (const label of labels) {
    const value = map[label];
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const raw = entry.value ?? entry.title ?? entry.href;
    if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 1200);
  }
  return '';
}

function instagramTimestamp(map: Record<string, unknown>): string {
  for (const entry of Object.values(map)) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = (entry as Record<string, unknown>).timestamp;
    if (raw == null) continue;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  }
  return '';
}

function instagramJsonRecords(value: unknown, sourceFile: string, inheritedCollection: string | null = null, found: ParsedImportItem[] = []): ParsedImportItem[] {
  if (Array.isArray(value)) { for (const child of value) instagramJsonRecords(child, sourceFile, inheritedCollection, found); return found; }
  if (!value || typeof value !== 'object') return found;
  const object = value as Record<string, unknown>;
  const map = object.string_map_data && typeof object.string_map_data === 'object' ? object.string_map_data as Record<string, unknown> : {};
  const collection = inheritedCollection || instagramMapValue(map, ['Collection name', 'Name']) || (/saved_collections/i.test(sourceFile) ? String(object.title ?? '') : '') || null;
  const ownStrings = stringsFromJson(object);
  const links = [...new Set(ownStrings.flatMap((text) => [...text.matchAll(URL_PATTERN)].map((match) => normalizeInstagramUrl(match[0])).filter((url): url is string => Boolean(url))))];
  const hasChildren = ['media', 'items', 'children', 'saved_saved_media', 'saved_saved_collections'].some((key) => Array.isArray(object[key]) || (object[key] && typeof object[key] === 'object'));
  if (links.length && (!hasChildren || Object.keys(map).length > 0)) {
    const caption = instagramMapValue(map, ['Caption', 'Title', 'Text']) || String(object.title ?? '').slice(0, 1200);
    const ownerName = instagramMapValue(map, ['Name', 'Full name']); const ownerUsername = instagramMapValue(map, ['Username', 'Author', 'Account username']);
    const savedAt = instagramTimestamp(map); const tags = hashtags(caption);
    for (const url of links) {
      const id = url.match(/\/(?:p|reel|tv)\/([a-z\d_-]+)/i)?.[1] ?? null;
      found.push({ platform: 'instagram', url, sourceId: id, title: caption.slice(0, 240) || url, description: caption,
        collection: collection || 'Saved posts', metadata: { sourceFile, ownerName, ownerUsername, savedAt, hashtags: tags, collections: [collection || 'Saved posts'] } });
    }
    return found;
  }
  for (const child of Object.values(object)) instagramJsonRecords(child, sourceFile, collection, found);
  return found;
}

function instagramHtmlRecords(text: string, sourceFile: string): ParsedImportItem[] {
  const $ = load(text); const collectionByUrl = new Map<string, Set<string>>();
  if (/saved_collections/i.test(sourceFile)) {
    $('td').each((_index, cell) => {
      if ($(cell).text().trim() !== 'Name') return;
      const collection = $(cell).next('td').text().trim().slice(0, 80); if (!collection) return;
      const root = $(cell).closest('div._a6-g');
      root.find('a[href*="instagram.com/"]').each((_i, anchor) => {
        const url = normalizeInstagramUrl($(anchor).attr('href') ?? ''); if (!url) return;
        const set = collectionByUrl.get(url) ?? new Set<string>(); set.add(collection); collectionByUrl.set(url, set);
      });
    });
  }
  const results: ParsedImportItem[] = []; const seen = new Set<string>();
  $('a[href*="instagram.com/"]').each((_index, anchor) => {
    const url = normalizeInstagramUrl($(anchor).attr('href') ?? ''); if (!url || seen.has(url)) return;
    const record = $(anchor).parents('div._a6-g').toArray().find((parent) => $(parent).find('a[href*="instagram.com/"]').length === 1);
    const fields = new Map<string, string>();
    if (record) $(record).find('table tr').each((_i, row) => { const cells = $(row).children('td'); const label = $(cells[0]).text().trim(); const value = $(cells[1]).text().trim(); if (label && value) fields.set(label, value); });
    const caption = fields.get('Caption') ?? $(anchor).text().trim(); const ownerName = fields.get('Name') ?? ''; const ownerUsername = fields.get('Username') ?? '';
    const savedAt = record ? $(record).find('div._3-94._a6-o').first().text().trim() : '';
    const collections = [...(collectionByUrl.get(url) ?? new Set([/saved_collections/i.test(sourceFile) ? '' : 'Saved posts']))].filter(Boolean);
    seen.add(url); const id = url.match(/\/(?:p|reel|tv)\/([a-z\d_-]+)/i)?.[1] ?? null;
    results.push({ platform: 'instagram', url, sourceId: id, title: caption.slice(0, 240) || url, description: caption,
      collection: collections[0] ?? 'Saved posts', metadata: { sourceFile, ownerName, ownerUsername, savedAt, hashtags: hashtags(caption), collections } });
  });
  return results;
}

function xJsonRecords(value: unknown, sourceFile: string, found: ParsedImportItem[] = []): ParsedImportItem[] {
  if (Array.isArray(value)) { for (const child of value) xJsonRecords(child, sourceFile, found); return found; }
  if (!value || typeof value !== 'object') return found;
  const object = value as Record<string, unknown>;
  const preferred = object.tweet && typeof object.tweet === 'object' ? object.tweet as Record<string, unknown> : object;
  const strings = Object.values(preferred).filter((child): child is string => typeof child === 'string');
  const directUrl = [preferred.url, preferred.tweet_url, preferred.tweetUrl, preferred.link, preferred.permalink, ...strings].find((text): text is string => typeof text === 'string' && /https?:\\?\/\\?\/(?:mobile\.)?(?:twitter\.com|x\.com)\//i.test(text));
  const match = directUrl?.match(/https?:\\?\/\\?\/(?:mobile\.)?(?:twitter\.com|x\.com)\/[^\s"'<>\\]+/i)?.[0];
  const url = match ? normalizeXUrl(match) : null;
  const idRaw = preferred.tweet_id ?? preferred.tweetId ?? preferred.id_str ?? preferred.rest_id ?? preferred.id;
  const usernameRaw = preferred.screen_name ?? preferred.screenName ?? preferred.username ?? (preferred.user && typeof preferred.user === 'object' ? (preferred.user as Record<string, unknown>).screen_name : '');
  const idString = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : '';
  const username = typeof usernameRaw === 'string' ? usernameRaw.replace(/^@/, '').slice(0, 80) : '';
  const finalUrl = url ?? (/^\d+$/.test(idString) ? normalizeXUrl(`https://x.com/${username || 'i'}/status/${idString}`) : null);
  if (finalUrl) {
    const textRaw = preferred.full_text ?? preferred.fullText ?? preferred.text ?? preferred.caption ?? preferred.description ?? preferred.note;
    const text = typeof textRaw === 'string' ? textRaw.trim().slice(0, 1200) : '';
    const authorRaw = preferred.name ?? preferred.author ?? preferred.user_name ?? preferred.userName ?? (preferred.user && typeof preferred.user === 'object' ? (preferred.user as Record<string, unknown>).name : '');
    const author = typeof authorRaw === 'string' ? authorRaw.trim().slice(0, 120) : '';
    const createdRaw = preferred.created_at ?? preferred.createdAt ?? preferred.date ?? preferred.bookmarked_at ?? preferred.saved_at;
    const createdAt = typeof createdRaw === 'string' ? createdRaw.slice(0, 80) : '';
    const media = preferred.media && typeof preferred.media === 'object' ? preferred.media : preferred.extended_entities ?? preferred.entities;
    const mediaStrings = stringsFromJson(media).find((entry) => /^https?:\/\//i.test(entry));
    const sourceId = finalUrl.match(/status\/(\d+)/)?.[1] ?? (idString || null);
    const title = text.slice(0, 240) || `X bookmark ${sourceId ?? ''}`.trim();
    found.push({ platform: 'x', url: finalUrl, sourceId, title, description: text, collection: 'X bookmarks',
      metadata: { sourceFile, author, username, createdAt, mediaUrl: mediaStrings ?? '', hashtags: hashtags(text) } });
    return found;
  }
  for (const child of Object.values(object)) xJsonRecords(child, sourceFile, found);
  return found;
}

function recordsFromText(platform: ImportPlatform, name: string, bytes: Buffer, collection: string | null): ParsedImportItem[] {
  let text = decodeText(bytes).replace(/^\uFEFF/, '');
  if (platform === 'x') text = text.replace(/^\s*window\.YTD\.[^=]+?=\s*/s, '').replace(/;\s*$/, '');
  const candidates: Array<{ url: string; title?: string; description?: string }> = [];
  const extension = name.toLowerCase().split('.').at(-1);
  if (platform === 'instagram' && ['html', 'htm'].includes(extension ?? '')) return instagramHtmlRecords(text, name);
  if (platform === 'instagram' && extension === 'json') {
    try { return instagramJsonRecords(JSON.parse(text), name); }
    catch { throw new ImportParseError('malformed_json', 'The Instagram JSON export is malformed.'); }
  }
  if (platform === 'x' && ['json', 'js'].includes(extension ?? '')) {
    try {
      const records = xJsonRecords(JSON.parse(text), name);
      if (records.length || extension === 'json') return records;
    } catch { if (extension === 'json') throw new ImportParseError('malformed_json', 'The X JSON export is malformed.'); }
  }
  if (['html', 'htm'].includes(extension ?? '')) {
    const $ = load(text);
    $('a[href]').each((_index, element) => {
      const url = $(element).attr('href'); if (url) candidates.push({ url, title: $(element).text().trim() });
    });
    if (candidates.length === 0) for (const match of text.matchAll(URL_PATTERN)) candidates.push({ url: match[0] });
  } else if (extension === 'csv') {
    const rows = csvRows(text); const headers = (rows.shift() ?? []).map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const urlIndex = headers.findIndex((header) => ['url', 'link', 'tweeturl', 'pinurl', 'savedurl', 'posturl'].includes(header));
    for (const row of rows) {
      if (urlIndex >= 0 && row[urlIndex]) candidates.push({ url: row[urlIndex]!, title: row[headers.findIndex((header) => ['text', 'title', 'caption', 'tweettext'].includes(header))] });
      else for (const match of row.join(' ').matchAll(URL_PATTERN)) candidates.push({ url: match[0] });
    }
  } else {
    if (extension === 'json' || extension === 'js') {
      try { text = stringsFromJson(JSON.parse(text)).join('\n'); }
      catch { if (extension === 'json') throw new ImportParseError('malformed_json', 'The JSON export is malformed.'); }
    }
    for (const match of text.matchAll(URL_PATTERN)) candidates.push({ url: match[0] });
  }
  const normalize = platform === 'instagram' ? normalizeInstagramUrl : platform === 'pinterest' ? normalizePinterestUrl : normalizeXUrl;
  const output: ParsedImportItem[] = []; const seen = new Set<string>();
  for (const candidate of candidates) {
    const url = normalize(candidate.url.replace(/[),.;}\]]+$/g, ''));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const description = candidate.description ?? '';
    const id = platform === 'x' ? url.match(/status\/(\d+)/)?.[1] ?? null : platform === 'pinterest' ? url.match(/\/pin\/(\d+)/)?.[1] ?? null : url.match(/\/(?:p|reel|reels|tv)\/([a-z\d_-]+)/i)?.[1] ?? null;
    const tags = hashtags(`${candidate.title ?? ''} ${description}`);
    output.push({ platform, url, sourceId: id, title: candidate.title?.slice(0, 240) || new URL(url).hostname, description, collection, metadata: { sourceFile: name, hashtags: tags, collections: collection ? [collection] : [] } });
  }
  return output;
}

export function parsePlatformExports(files: ImportFile[]): ParsedImportItem[] {
  if (files.length < 1 || files.length > 20) throw new ImportParseError('invalid_file_count', 'Upload between 1 and 20 export files.');
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.bytes.length;
    if (file.bytes.length < 1 || file.bytes.length > 25 * 1024 * 1024) throw new ImportParseError('file_size_limit', 'Each export file must be between 1 byte and 25 MiB.');
  }
  if (totalBytes > 100 * 1024 * 1024) throw new ImportParseError('import_size_limit', 'The import exceeds the 100 MiB total limit.');
  const found: ParsedImportItem[] = []; let recognizedFiles = 0;
  for (const file of files) {
    const extension = file.name.toLowerCase().split('.').at(-1) ?? '';
    const members = extension === 'zip' ? zipEntries(file.bytes) : [{ name: file.name, bytes: file.bytes }];
    for (const member of members) {
      const directPlatform = platformForName(file.name) ?? (['json', 'csv', 'html', 'htm'].includes(extension) ? 'pinterest' : null);
      const platform = extension === 'zip' ? platformForName(member.name) : directPlatform;
      if (!platform) continue;
      const memberExtension = member.name.toLowerCase().split('.').at(-1) ?? '';
      const allowed = platform === 'instagram' ? ['html', 'htm', 'json'] : platform === 'pinterest' ? (extension === 'zip' ? ['json', 'csv', 'html', 'htm', 'txt'] : ['json', 'csv', 'html', 'htm']) : ['js', 'json', 'csv', 'txt'];
      if (!allowed.includes(memberExtension)) continue;
      recognizedFiles += 1;
      const collection = platform === 'pinterest' ? member.name.replaceAll('\\', '/').split('/').slice(-2, -1)[0] || null : null;
      const items = recordsFromText(platform, member.name, member.bytes, collection);
      found.push(...items);
    }
  }
  if (recognizedFiles === 0) throw new ImportParseError('unsupported_export_file', 'No supported Instagram, Pinterest, or X export file was found.');
  const unique = new Map<string, ParsedImportItem>();
  for (const item of found) {
    const previous = unique.get(item.url);
    if (!previous) unique.set(item.url, item);
    else unique.set(item.url, { ...previous, title: previous.title.length > 0 ? previous.title : item.title, collection: previous.collection ?? item.collection });
  }
  if (unique.size === 0) throw new ImportParseError('empty_export', 'The export contained no supported saved links.');
  return [...unique.values()];
}
