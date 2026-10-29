import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import ipaddr from 'ipaddr.js';
import { config } from '../config.js';

export class CaptureError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CaptureError';
  }
}

export interface ValidatedUrl {
  url: URL;
  address: string;
  family: 4 | 6;
}

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export async function validatePublicUrl(input: string): Promise<ValidatedUrl> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CaptureError('invalid_url', 'Enter a complete web address, including https://.');
  }
  url.hash = '';
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new CaptureError('unsupported_url', 'Only public HTTP and HTTPS pages can be saved.');
  }
  const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
  if ((url.protocol === 'https:' && port !== 443) || (url.protocol === 'http:' && port !== 80)) {
    throw new CaptureError('unsupported_url', 'Custom ports are not supported for saved pages.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new CaptureError('blocked_target', 'That address is private or unavailable for capture.');
  }

  let addresses: Array<{ address: string; family: number }>;
  if (isIP(host)) {
    addresses = [{ address: host, family: isIP(host) }];
  } else {
    try {
      addresses = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new CaptureError('dns_failed', 'The page address could not be resolved. Check the URL and try again.');
    }
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new CaptureError('blocked_target', 'That address is private or unavailable for capture.');
  }
  addresses.sort((left, right) => Number(right.family === 4) - Number(left.family === 4));
  const selected = addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new CaptureError('dns_failed', 'The page address could not be resolved. Check the URL and try again.');
  }
  return { url, address: selected.address, family: selected.family };
}

export interface ResponsePayload {
  statusCode: number;
  location: string | undefined;
  contentType: string;
  body: string;
}

function requestAtPinnedAddress(target: ValidatedUrl, maxBytes: number): Promise<ResponsePayload> {
  return new Promise((resolve, reject) => {
    const isHttps = target.url.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;
    const hostname = target.url.hostname.replace(/^\[|\]$/g, '');
    const request = requestFn(target.url, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        'accept-encoding': 'identity',
        'user-agent': 'RembrBot/0.1 (+user-requested page capture)',
      },
      lookup: (_host, options, callback) => {
        if (options.all) {
          callback(null, [{ address: target.address, family: target.family }]);
          return;
        }
        callback(null, target.address, target.family);
      },
      ...(isHttps && !isIP(hostname) ? { servername: hostname } : {}),
      timeout: 10_000,
      maxHeaderSize: 16_384,
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;
      const contentType = String(response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      const contentEncoding = String(response.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
      const contentLength = Number(response.headers['content-length'] ?? 0);
      if (contentEncoding !== 'identity') {
        response.resume();
        reject(new CaptureError('unsupported_content', 'Compressed page responses are not supported yet.'));
        return;
      }
      if (contentLength > maxBytes) {
        response.destroy();
        reject(new CaptureError('page_too_large', 'This page is larger than Rembr can process.'));
        return;
      }
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        resolve({ statusCode, location, contentType, body: '' });
        return;
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new CaptureError('page_unavailable', 'The page did not return a successful response.'));
        return;
      }
      if (!['text/html', 'application/xhtml+xml', 'text/plain'].includes(contentType)) {
        response.resume();
        reject(new CaptureError('unsupported_content', 'This page format is not supported yet.'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new CaptureError('page_too_large', 'This page is larger than Rembr can process.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ statusCode, location, contentType, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new CaptureError('page_timeout', 'The page took too long to respond.')));
    request.on('error', reject);
    request.end();
  });
}

export async function fetchPublicPage(
  input: string,
  options: {
    validateUrl?: typeof validatePublicUrl;
    requestPage?: (target: ValidatedUrl, maxBytes: number) => Promise<ResponsePayload>;
  } = {},
): Promise<{ finalUrl: string; contentType: string; html: string }> {
  const validateUrl = options.validateUrl ?? validatePublicUrl;
  const requestPage = options.requestPage ?? requestAtPinnedAddress;
  let current = input;
  for (let redirect = 0; redirect <= config.MAX_CAPTURE_REDIRECTS; redirect += 1) {
    const target = await validateUrl(current);
    const response = await requestPage(target, config.MAX_CAPTURE_BYTES);
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      if (redirect === config.MAX_CAPTURE_REDIRECTS) {
        throw new CaptureError('too_many_redirects', 'This page redirects too many times to save safely.');
      }
      try {
        current = new URL(response.location, target.url).toString();
      } catch {
        throw new CaptureError('invalid_redirect', 'This page sent an invalid redirect.');
      }
      continue;
    }
    return { finalUrl: target.url.toString(), contentType: response.contentType, html: response.body };
  }
  throw new CaptureError('too_many_redirects', 'This page redirects too many times to save safely.');
}

export interface MediaResponsePayload { statusCode: number; location: string | undefined; contentType: string; body: Buffer }
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
  'audio/wav', 'audio/webm', 'video/mp4', 'video/webm', 'video/ogg']);
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_MEDIA_BYTES = 25 * 1024 * 1024;
const TEMP_MEDIA_PREFIX = 'rembr-media-';
const TEMP_MEDIA_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function requestMediaAtPinnedAddress(target: ValidatedUrl, maxBytes: number): Promise<MediaResponsePayload> {
  return new Promise((resolve, reject) => {
    const isHttps = target.url.protocol === 'https:'; const requestFn = isHttps ? httpsRequest : httpRequest;
    const hostname = target.url.hostname.replace(/^\[|\]$/g, '');
    const request = requestFn(target.url, {
      method: 'GET', headers: { accept: 'image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm,video/ogg', 'accept-encoding': 'identity', 'user-agent': 'RembrBot/0.1 (+user-requested page capture)' },
      lookup: (_host, options, callback) => options.all ? callback(null, [{ address: target.address, family: target.family }]) : callback(null, target.address, target.family),
      ...(isHttps && !isIP(hostname) ? { servername: hostname } : {}), timeout: 10_000, maxHeaderSize: 16_384,
    }, (response) => {
      const statusCode = response.statusCode ?? 0; const location = response.headers.location;
      const contentType = String(response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      const contentEncoding = String(response.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
      const contentLength = Number(response.headers['content-length'] ?? 0);
      if (statusCode >= 300 && statusCode < 400 && location) { response.resume(); resolve({ statusCode, location, contentType, body: Buffer.alloc(0) }); return; }
      if (contentEncoding !== 'identity') { response.resume(); reject(new CaptureError('unsupported_media', 'Compressed media responses are not supported.')); return; }
      if (contentLength > maxBytes) { response.destroy(); reject(new CaptureError('media_too_large', 'The media file exceeds the download limit.')); return; }
      if (statusCode < 200 || statusCode >= 300) { response.resume(); reject(new CaptureError('media_unavailable', 'The media file could not be downloaded.')); return; }
      if (!MEDIA_TYPES.has(contentType)) { response.resume(); reject(new CaptureError('unsupported_media', 'This media format is not supported.')); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { response.destroy(new CaptureError('media_too_large', 'The media file exceeds the download limit.')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ statusCode, location, contentType, body: Buffer.concat(chunks, size) }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new CaptureError('media_timeout', 'The media download timed out.')));
    request.on('error', reject); request.end();
  });
}

export async function fetchPublicMedia(
  input: string,
  options: {
    validateUrl?: typeof validatePublicUrl;
    requestMedia?: (target: ValidatedUrl, maxBytes: number) => Promise<MediaResponsePayload>;
    maxBytes?: number;
  } = {},
): Promise<{ finalUrl: string; mime: string; bytes: Buffer }> {
  const validateUrl = options.validateUrl ?? validatePublicUrl; const requestMedia = options.requestMedia ?? requestMediaAtPinnedAddress;
  const maxBytes = Math.max(1, Math.min(options.maxBytes ?? MAX_MEDIA_BYTES, MAX_MEDIA_BYTES)); let current = input;
  for (let redirect = 0; redirect <= config.MAX_CAPTURE_REDIRECTS; redirect += 1) {
    const target = await validateUrl(current); const response = await requestMedia(target, maxBytes);
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      if (redirect === config.MAX_CAPTURE_REDIRECTS) throw new CaptureError('too_many_redirects', 'This media URL redirects too many times to download safely.');
      try { current = new URL(response.location, target.url).toString(); }
      catch { throw new CaptureError('invalid_redirect', 'This media URL sent an invalid redirect.'); }
      continue;
    }
    if (response.body.length < 1 || response.body.length > maxBytes) throw new CaptureError('media_too_large', 'The media file is empty or exceeds the download limit.');
    return { finalUrl: target.url.toString(), mime: response.contentType, bytes: response.body };
  }
  throw new CaptureError('too_many_redirects', 'This media URL redirects too many times to download safely.');
}

interface StreamingMediaResponse { statusCode: number; location: string | undefined; contentType: string; bytesWritten: number }

function streamMediaAtPinnedAddress(target: ValidatedUrl, maxBytes: number, destination: string): Promise<StreamingMediaResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = target.url.protocol === 'https:'; const requestFn = isHttps ? httpsRequest : httpRequest;
    const hostname = target.url.hostname.replace(/^\[|\]$/g, '');
    const request = requestFn(target.url, {
      method: 'GET', headers: { accept: 'image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm,video/ogg', 'accept-encoding': 'identity', 'user-agent': 'RembrBot/0.1 (+user-requested page capture)' },
      lookup: (_host, options, callback) => options.all ? callback(null, [{ address: target.address, family: target.family }]) : callback(null, target.address, target.family),
      ...(isHttps && !isIP(hostname) ? { servername: hostname } : {}), timeout: 15_000, maxHeaderSize: 16_384,
    }, (response) => {
      const statusCode = response.statusCode ?? 0; const location = response.headers.location;
      const contentType = String(response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      const contentEncoding = String(response.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
      const contentLength = Number(response.headers['content-length'] ?? 0);
      if (statusCode >= 300 && statusCode < 400 && location) { response.resume(); resolve({ statusCode, location, contentType, bytesWritten: 0 }); return; }
      if (contentEncoding !== 'identity') { response.resume(); reject(new CaptureError('unsupported_media', 'Compressed media responses are not supported.')); return; }
      if (contentLength > maxBytes) { response.destroy(); reject(new CaptureError('media_too_large', 'The media file exceeds the download limit.')); return; }
      if (statusCode < 200 || statusCode >= 300) { response.resume(); reject(new CaptureError('media_unavailable', 'The media file could not be downloaded.')); return; }
      if (!MEDIA_TYPES.has(contentType)) { response.resume(); reject(new CaptureError('unsupported_media', 'This media format is not supported.')); return; }
      let bytesWritten = 0;
      const sizeGuard = new Transform({ transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
        bytesWritten += chunk.length;
        if (bytesWritten > maxBytes) callback(new CaptureError('media_too_large', 'The media file exceeds the download limit.'));
        else callback(null, chunk);
      } });
      pipeline(response, sizeGuard, createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
        .then(() => bytesWritten > 0 ? resolve({ statusCode, location, contentType, bytesWritten }) : reject(new CaptureError('media_too_large', 'The media file is empty or exceeds the download limit.')))
        .catch(reject);
    });
    request.on('timeout', () => request.destroy(new CaptureError('media_timeout', 'The media download timed out.')));
    request.on('error', reject); request.end();
  });
}

export async function createPrivateMediaTempDirectory(): Promise<string> {
  return await mkdtemp(join(tmpdir(), TEMP_MEDIA_PREFIX));
}

export async function fetchPublicMediaToTemp(
  input: string,
  directory: string,
  options: { validateUrl?: typeof validatePublicUrl; maxBytes?: number } = {},
): Promise<{ finalUrl: string; mime: string; path: string; byteSize: number }> {
  const validateUrl = options.validateUrl ?? validatePublicUrl;
  const maxBytes = Math.max(1, Math.min(options.maxBytes ?? MAX_MEDIA_BYTES, MAX_VIDEO_MEDIA_BYTES));
  const path = join(directory, randomUUID()); let current = input;
  try {
    for (let redirect = 0; redirect <= config.MAX_CAPTURE_REDIRECTS; redirect += 1) {
      const target = await validateUrl(current); const response = await streamMediaAtPinnedAddress(target, maxBytes, path);
      if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
        if (redirect === config.MAX_CAPTURE_REDIRECTS) throw new CaptureError('too_many_redirects', 'This media URL redirects too many times to download safely.');
        try { current = new URL(response.location, target.url).toString(); }
        catch { throw new CaptureError('invalid_redirect', 'This media URL sent an invalid redirect.'); }
        continue;
      }
      return { finalUrl: target.url.toString(), mime: response.contentType, path, byteSize: response.bytesWritten };
    }
    throw new CaptureError('too_many_redirects', 'This media URL redirects too many times to download safely.');
  } catch (error) {
    await rm(path, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function removePrivateMediaTempDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}

export async function cleanupStalePrivateMediaTempDirectories(now = Date.now()): Promise<number> {
  const root = tmpdir(); let removed = 0;
  for (const name of await readdir(root).catch(() => [])) {
    if (!name.startsWith(TEMP_MEDIA_PREFIX)) continue;
    const path = join(root, name);
    try {
      const details = await stat(path);
      if (now - details.mtimeMs < TEMP_MEDIA_MAX_AGE_MS) continue;
      await rm(path, { recursive: true, force: true }); removed += 1;
    } catch { /* A concurrent cleanup or worker shutdown may remove it first. */ }
  }
  return removed;
}
