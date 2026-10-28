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
const URL_PATTERN = /https?:\\?\/\\?\/(?:www\.)?(?:instagram\.com|pinterest\.[a-z.]+|pin\.it|x\.com|twitter\.com)\/[^\s"'<>\\]+/gi;

function normalizeInstagramUrl(value: string): string | null {
  try {
    const url = new URL(value.replaceAll('\\/', '/'));
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return null;
    if (!/^\/(?:p|reel|tv)\/[a-z\d_-]+\/?$/i.test(url.pathname)) return null;
    url.hostname = 'www.instagram.com'; url.search = ''; url.hash = '';
    return url.toString();
  } catch { return null; }
}

function normalizePinterestUrl(value: string): string | null {
  try {
    const url = new URL(value.replaceAll('\\/', '/'));
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
    const url = new URL(value.replaceAll('\\/', '/'));
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^mobile\./, '');
    if (!['x.com', 'twitter.com'].includes(host)) return null;
    const match = url.pathname.match(/^\/(?:[a-z\d_]+|i)\/status\/(\d+)/i);
    return match ? `https://x.com/i/status/${match[1]}` : null;
  } catch { return null; }
}

function platformForName(name: string): ImportPlatform | null {
  const path = name.replaceAll('\\', '/').toLowerCase();
  if (/(?:saved_posts|saved_collections)/.test(path)) return 'instagram';
  if (/bookmark/.test(path)) return 'x';
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
function zipEntries(archive: Buffer): ZipEntry[] {
  if (archive.length > MAX_ARCHIVE_BYTES) throw new ImportParseError('archive_too_large', 'The expanded archive exceeds the 100 MiB limit.');
  let eocd = -1;
  for (let offset = Math.max(0, archive.length - 65_557); offset <= archive.length - 22; offset += 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) eocd = offset;
  }
  if (eocd < 0) throw new ImportParseError('invalid_archive', 'This ZIP archive is incomplete or invalid.');
  if (archive.readUInt16LE(eocd + 4) !== 0 || archive.readUInt16LE(eocd + 6) !== 0) throw new ImportParseError('unsupported_archive', 'Multi-disk ZIP archives are not supported.');
  const count = archive.readUInt16LE(eocd + 10); const directorySize = archive.readUInt32LE(eocd + 12); const directoryOffset = archive.readUInt32LE(eocd + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new ImportParseError('unsupported_archive', 'ZIP64 archives are not supported.');
  if (count > MAX_ARCHIVE_ENTRIES || directoryOffset + directorySize > eocd) throw new ImportParseError('archive_limits_exceeded', 'The archive exceeds the 5,000-entry limit or has an invalid directory.');
  const result: ZipEntry[] = []; let cursor = directoryOffset; let expanded = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50) throw new ImportParseError('invalid_archive', 'This ZIP archive has a malformed directory.');
    const flags = archive.readUInt16LE(cursor + 8); const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20); const expandedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28); const extraLength = archive.readUInt16LE(cursor + 30); const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42); const name = decodeText(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) !== 0) throw new ImportParseError('encrypted_archive', 'Password-protected ZIP archives are not supported.');
    if (name.endsWith('/')) continue;
    if (name.startsWith('/') || name.split(/[\\/]/).some((part) => part === '..')) throw new ImportParseError('invalid_archive_path', 'The archive contains an unsafe file path.');
    expanded += expandedSize;
    if (expanded > MAX_ARCHIVE_BYTES) throw new ImportParseError('archive_too_large', 'The expanded archive exceeds the 100 MiB limit.');
    if (expandedSize > MAX_ARCHIVE_BYTES || localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new ImportParseError('invalid_archive', 'This ZIP archive has an invalid file entry.');
    const localNameLength = archive.readUInt16LE(localOffset + 26); const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength; const end = start + compressedSize;
    if (end > archive.length) throw new ImportParseError('invalid_archive', 'This ZIP archive has a truncated file entry.');
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
    result.push({ name, bytes });
  }
  return result;
}

function stringsFromJson(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') result.push(value);
  else if (Array.isArray(value)) for (const child of value) stringsFromJson(child, result);
  else if (value && typeof value === 'object') for (const child of Object.values(value)) stringsFromJson(child, result);
  return result;
}

function recordsFromText(platform: ImportPlatform, name: string, bytes: Buffer, collection: string | null): ParsedImportItem[] {
  let text = decodeText(bytes).replace(/^\uFEFF/, '');
  if (platform === 'x') text = text.replace(/^\s*window\.YTD\.[^=]+?=\s*/s, '').replace(/;\s*$/, '');
  const candidates: Array<{ url: string; title?: string; description?: string }> = [];
  const extension = name.toLowerCase().split('.').at(-1);
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
    const id = platform === 'x' ? url.match(/status\/(\d+)/)?.[1] ?? null : platform === 'pinterest' ? url.match(/\/pin\/(\d+)/)?.[1] ?? null : url.match(/\/(?:p|reel|tv)\/([a-z\d_-]+)/i)?.[1] ?? null;
    output.push({ platform, url, sourceId: id, title: candidate.title?.slice(0, 240) || new URL(url).hostname, description: candidate.description ?? '', collection, metadata: { sourceFile: name } });
  }
  return output;
}

export function parsePlatformExports(files: ImportFile[]): ParsedImportItem[] {
  const found: ParsedImportItem[] = []; const direct = new Map<ImportPlatform, number>();
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
      const collection = platform === 'pinterest' ? member.name.replaceAll('\\', '/').split('/').slice(-2, -1)[0] || null : null;
      const items = recordsFromText(platform, member.name, member.bytes, collection);
      if (extension !== 'zip') direct.set(platform, (direct.get(platform) ?? 0) + items.length);
      found.push(...items);
    }
  }
  const unique = new Map<string, ParsedImportItem>();
  for (const item of found) {
    const previous = unique.get(item.url);
    if (!previous) unique.set(item.url, item);
    else unique.set(item.url, { ...previous, title: previous.title.length > 0 ? previous.title : item.title, collection: previous.collection ?? item.collection });
  }
  return [...unique.values()];
}
