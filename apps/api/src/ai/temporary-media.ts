import { open, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createPrivateMediaTempDirectory, fetchPublicMediaToTemp, MAX_MEDIA_BYTES,
  MAX_VIDEO_MEDIA_BYTES, removePrivateMediaTempDirectory } from '../items/safe-fetch.js';
import { extractPage } from '../items/extract.js';
import { fetchPublicPage } from '../items/safe-fetch.js';
import { config } from '../config.js';

export const MAX_ANALYSIS_IMAGES_PER_POST = 20;
export const MAX_ANALYSIS_IMAGE_BYTES_PER_POST = 100 * 1024 * 1024;

export interface TemporaryAnalysisMediaFile {
  path: string;
  mime: string;
  byteSize: number;
  kind: 'image' | 'video' | 'wav';
  durationSeconds?: number;
}

export interface TemporaryAnalysisMedia {
  files: TemporaryAnalysisMediaFile[];
  skippedCount: number;
  cleanup(): Promise<void>;
}

const SUPPORTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SUPPORTED_AUDIO_MIMES = new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']);
const MAX_AUDIO_CHUNKS = 6;
const AUDIO_CHUNK_SECONDS = 600;
export const MAX_ANALYSIS_AUDIO_SECONDS_PER_POST = MAX_AUDIO_CHUNKS * AUDIO_CHUNK_SECONDS;
const MAX_AUDIO_CHUNK_BYTES = 32 * 1024 * 1024;

type FfmpegRunner = (inputPath: string, outputPattern: string, maxDurationSeconds: number) => Promise<void>;

const runFfmpeg: FfmpegRunner = async (inputPath, outputPattern, maxDurationSeconds) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.ffmpegPath, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
      '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-t', String(maxDurationSeconds),
      '-f', 'segment', '-segment_time', String(AUDIO_CHUNK_SECONDS), '-reset_timestamps', '1', '-segment_format', 'wav', outputPattern,
    ], { stdio: 'ignore', windowsHide: true });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.once('error', () => { clearTimeout(timeout); reject(new Error('ffmpeg_unavailable')); });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(); else reject(new Error('ffmpeg_failed'));
    });
  });
};

async function extractAudioChunks(inputPath: string, directory: string, outputPrefix: string, maxDurationSeconds: number,
  run: FfmpegRunner = runFfmpeg): Promise<Array<TemporaryAnalysisMediaFile & { kind: 'wav'; durationSeconds: number }>> {
  if (maxDurationSeconds <= 0) return [];
  const outputPattern = join(directory, `${outputPrefix}-%03d.wav`);
  await run(inputPath, outputPattern, maxDurationSeconds);
  const names = (await readdir(directory)).filter((name) => name.startsWith(`${outputPrefix}-`) && /^\d{3}\.wav$/.test(name.slice(outputPrefix.length + 1)))
    .sort().slice(0, Math.min(MAX_AUDIO_CHUNKS, Math.ceil(maxDurationSeconds / AUDIO_CHUNK_SECONDS)));
  const files: Array<TemporaryAnalysisMediaFile & { kind: 'wav'; durationSeconds: number }> = [];
  for (const name of names) {
    const path = join(directory, name);
    const details = await stat(path);
    if (details.size < 44 || details.size > MAX_AUDIO_CHUNK_BYTES) continue;
    const handle = await open(path, 'r');
    try {
      const header = Buffer.alloc(44);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (bytesRead < 44 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') continue;
      const byteRate = header.readUInt32LE(28);
      const durationSeconds = byteRate > 0 ? (details.size - 44) / byteRate : 0;
      if (durationSeconds > 0 && durationSeconds <= AUDIO_CHUNK_SECONDS + 1) {
        files.push({ path, mime: 'audio/wav', byteSize: details.size, kind: 'wav', durationSeconds });
      }
    } finally { await handle.close(); }
  }
  return files;
}

async function signatureMatches(path: string, mime: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (mime === 'image/jpeg') return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (mime === 'image/png') return bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mime === 'image/webp') return bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
    if (mime === 'image/gif') return bytesRead >= 6 && ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6));
    if (mime === 'video/mp4') return bytesRead >= 12 && header.toString('ascii', 4, 8) === 'ftyp';
    if (mime === 'video/webm') return bytesRead >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (mime === 'video/ogg') return bytesRead >= 4 && header.toString('ascii', 0, 4) === 'OggS';
    if (mime === 'audio/mpeg') return bytesRead >= 3 && (header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 0xff && (header[1]! & 0xe0) === 0xe0));
    if (mime === 'audio/mp4') return bytesRead >= 12 && header.toString('ascii', 4, 8) === 'ftyp';
    if (mime === 'audio/webm') return bytesRead >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (mime === 'audio/wav') return bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE';
    if (mime === 'audio/ogg') return bytesRead >= 4 && header.toString('ascii', 0, 4) === 'OggS';
    return false;
  } finally { await handle.close(); }
}

/**
 * Finds only media exposed by a publicly readable page, downloads it into a private
 * worker temp directory, and never creates a durable media-artifact record.
 */
export async function resolveTemporaryAnalysisMedia(
  pageUrl: string,
  options: {
    fetchPage?: typeof fetchPublicPage;
    fetchMedia?: typeof fetchPublicMediaToTemp;
    runFfmpeg?: FfmpegRunner;
  } = {},
): Promise<TemporaryAnalysisMedia> {
  const fetchPage = options.fetchPage ?? fetchPublicPage;
  const fetchMedia = options.fetchMedia ?? fetchPublicMediaToTemp;
  const page = await fetchPage(pageUrl);
  const extracted = extractPage(page.html, page.finalUrl);
  const directory = await createPrivateMediaTempDirectory();
  const files: TemporaryAnalysisMediaFile[] = [];
  let imageBytes = 0;
  let analyzedAudioSeconds = 0;
  let skippedCount = 0;
  try {
    for (const mediaUrl of extracted.imageUrls.slice(0, MAX_ANALYSIS_IMAGES_PER_POST)) {
      try {
        const remaining = MAX_ANALYSIS_IMAGE_BYTES_PER_POST - imageBytes;
        if (remaining <= 0) { skippedCount += 1; continue; }
        const asset = await fetchMedia(mediaUrl, directory, { maxBytes: Math.min(MAX_MEDIA_BYTES, remaining) });
        if (!SUPPORTED_IMAGE_MIMES.has(asset.mime) || !await signatureMatches(asset.path, asset.mime)) { skippedCount += 1; continue; }
        imageBytes += asset.byteSize;
        files.push({ path: asset.path, mime: asset.mime, byteSize: asset.byteSize, kind: 'image' });
      } catch { skippedCount += 1; }
    }
    for (const mediaUrl of extracted.videoUrls.slice(0, 1)) {
      try {
        const asset = await fetchMedia(mediaUrl, directory, { maxBytes: MAX_VIDEO_MEDIA_BYTES });
        if (!['video/mp4', 'video/webm', 'video/ogg'].includes(asset.mime) || !await signatureMatches(asset.path, asset.mime)) { skippedCount += 1; continue; }
        // The visual provider contract accepts validated MP4 only. Other formats
        // stay local and are used solely as bounded ffmpeg input for transcription.
        if (asset.mime === 'video/mp4') files.push({ path: asset.path, mime: asset.mime, byteSize: asset.byteSize, kind: 'video' });
        else skippedCount += 1; // Visual analysis is skipped, even when audio transcription succeeds.
        try {
          const audioFiles = await extractAudioChunks(asset.path, directory, 'rembr-video-audio', MAX_ANALYSIS_AUDIO_SECONDS_PER_POST, options.runFfmpeg);
          files.push(...audioFiles);
          analyzedAudioSeconds += audioFiles.reduce((total, file) => total + file.durationSeconds, 0);
          if (audioFiles.length === MAX_AUDIO_CHUNKS && audioFiles.at(-1)!.durationSeconds > AUDIO_CHUNK_SECONDS - 1) skippedCount += 1;
          if (!audioFiles.length) skippedCount += 1;
        } catch { skippedCount += 1; } // Keep visual video analysis even when worker audio extraction is unavailable.
      } catch { skippedCount += 1; }
    }
    for (const mediaUrl of extracted.audioUrls.slice(0, 1)) {
      try {
        const remainingAudioSeconds = MAX_ANALYSIS_AUDIO_SECONDS_PER_POST - analyzedAudioSeconds;
        if (remainingAudioSeconds <= 0) { skippedCount += 1; continue; }
        const asset = await fetchMedia(mediaUrl, directory, { maxBytes: MAX_VIDEO_MEDIA_BYTES });
        if (!SUPPORTED_AUDIO_MIMES.has(asset.mime) || !await signatureMatches(asset.path, asset.mime)) { skippedCount += 1; continue; }
        try {
          const audioFiles = await extractAudioChunks(asset.path, directory, 'rembr-direct-audio', remainingAudioSeconds, options.runFfmpeg);
          files.push(...audioFiles);
          analyzedAudioSeconds += audioFiles.reduce((total, file) => total + file.durationSeconds, 0);
          if (audioFiles.length === MAX_AUDIO_CHUNKS && audioFiles.at(-1)!.durationSeconds > AUDIO_CHUNK_SECONDS - 1) skippedCount += 1;
          if (!audioFiles.length) skippedCount += 1;
        } catch { skippedCount += 1; }
      } catch { skippedCount += 1; }
    }
    return { files, skippedCount, cleanup: () => removePrivateMediaTempDirectory(directory) };
  } catch (error) {
    await removePrivateMediaTempDirectory(directory);
    throw error;
  }
}

/** Reads a single bounded file only when a provider request is ready to be sent. */
export async function readTemporaryAnalysisFile(file: TemporaryAnalysisMediaFile): Promise<Buffer> {
  const bytes = await readFile(file.path);
  if (bytes.byteLength !== file.byteSize) throw new Error('temporary_media_size_mismatch');
  return bytes;
}
