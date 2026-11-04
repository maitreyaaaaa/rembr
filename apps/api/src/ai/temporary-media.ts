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
export const MAX_ANALYSIS_VIDEO_SECONDS = 180;
export const MAX_VIDEO_KEYFRAMES = 12;

export interface MediaCoverage {
  expectedVideo: boolean;
  pageImagesFound: number;
  pageImagesUsed: number;
  sourceVideoMime: string | null;
  normalizedVideoMime: string | null;
  videoDurationSeconds: number | null;
  videoTruncated: boolean;
  videoAnalyzed: boolean;
  sampledFramesSeconds: number[];
  audioTrackDetected: boolean;
  audioDurationSeconds: number;
  transcriptAvailable: boolean;
  warnings: string[];
}

export interface TemporaryAnalysisMediaFile {
  path: string;
  mime: string;
  byteSize: number;
  kind: 'image' | 'video' | 'wav';
  role?: 'page_image' | 'video' | 'video_frame' | 'video_audio';
  timestampSeconds?: number;
  durationSeconds?: number;
}

export interface TemporaryAnalysisMedia {
  files: TemporaryAnalysisMediaFile[];
  skippedCount: number;
  coverage?: MediaCoverage;
  cleanup(): Promise<void>;
}

const SUPPORTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SUPPORTED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v',
  'video/x-matroska', 'video/3gpp', 'video/3gpp2', 'application/octet-stream']);
const MAX_AUDIO_CHUNKS = 6;
const AUDIO_CHUNK_SECONDS = 600;
const MAX_VIDEO_AUDIO_SECONDS = MAX_AUDIO_CHUNKS * AUDIO_CHUNK_SECONDS;
const MAX_AUDIO_CHUNK_BYTES = 32 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 180_000;

type CommandResult = { stdout: string; stderr: string };
type CommandRunner = (command: string, args: string[], timeoutMs?: number) => Promise<CommandResult>;
type VideoProbe = { durationSeconds: number; audioTrackDetected: boolean };

function runCommand(command: string, args: string[], timeoutMs = COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const append = (current: string, chunk: Buffer) => (current + chunk.toString('utf8')).slice(-256_000);
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(code === null ? 'media_command_timeout' : 'media_command_failed'));
    });
  });
}

async function probeVideo(path: string, runner: CommandRunner = runCommand): Promise<VideoProbe> {
  const { stdout } = await runner(config.ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path,
  ], 20_000);
  const result = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
  const durationSeconds = Number(result.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('invalid_video_duration');
  const streams = Array.isArray(result.streams) ? result.streams : [];
  if (!streams.some((stream) => stream.codec_type === 'video')) throw new Error('video_stream_missing');
  return { durationSeconds, audioTrackDetected: streams.some((stream) => stream.codec_type === 'audio') };
}

async function extractAudioChunks(videoPath: string, directory: string, runner: CommandRunner = runCommand): Promise<Array<TemporaryAnalysisMediaFile & { role: 'video_audio'; durationSeconds: number }>> {
  const outputPattern = join(directory, 'rembr-audio-%03d.wav');
  await runner(config.ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath,
    '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-t', String(MAX_VIDEO_AUDIO_SECONDS),
    '-f', 'segment', '-segment_time', String(AUDIO_CHUNK_SECONDS), '-reset_timestamps', '1', '-segment_format', 'wav', outputPattern,
  ]);

  const names = (await readdir(directory)).filter((name) => /^rembr-audio-\d{3}\.wav$/.test(name)).sort().slice(0, MAX_AUDIO_CHUNKS);
  const files: Array<TemporaryAnalysisMediaFile & { role: 'video_audio'; durationSeconds: number }> = [];
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
        files.push({ path, mime: 'audio/wav', byteSize: details.size, kind: 'wav', role: 'video_audio', durationSeconds });
      }
    } finally { await handle.close(); }
  }
  return files;
}

async function signatureVideoMime(path: string, declaredMime: string): Promise<string | null> {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead >= 12 && header.toString('ascii', 4, 8) === 'ftyp') {
      if (declaredMime === 'application/octet-stream') {
        return header.toString('ascii', 8, 12).trim() === 'qt' ? 'video/quicktime' : 'video/mp4';
      }
      return declaredMime === 'video/quicktime' || declaredMime === 'video/x-m4v'
        || declaredMime === 'video/3gpp' || declaredMime === 'video/3gpp2' || declaredMime === 'video/mp4' ? declaredMime : null;
    }
    if (bytesRead >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
      if (declaredMime === 'application/octet-stream') return 'video/webm';
      return declaredMime === 'video/webm' || declaredMime === 'video/x-matroska' ? declaredMime : null;
    }
    if (bytesRead >= 4 && header.toString('ascii', 0, 4) === 'OggS' && declaredMime === 'video/ogg') return declaredMime;
    return null;
  } finally { await handle.close(); }
}

async function normalizeVideo(inputPath: string, directory: string, runner: CommandRunner): Promise<string> {
  const outputPath = join(directory, 'rembr-normalized.mp4');
  await runner(config.ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?', '-t', String(MAX_ANALYSIS_VIDEO_SECONDS),
    '-vf', 'scale=min(720\\,iw):-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outputPath,
  ]);
  const output = await stat(outputPath);
  if (output.size < 12 || output.size > MAX_VIDEO_MEDIA_BYTES) throw new Error('normalized_video_size_invalid');
  const mime = await signatureVideoMime(outputPath, 'video/mp4');
  if (mime !== 'video/mp4') throw new Error('normalized_video_invalid');
  return outputPath;
}

async function extractVideoFrames(videoPath: string, directory: string, durationSeconds: number, runner: CommandRunner): Promise<Array<TemporaryAnalysisMediaFile & { role: 'video_frame'; timestampSeconds: number }>> {
  const intervalSeconds = Math.max(0.5, durationSeconds / (MAX_VIDEO_KEYFRAMES - 1));
  const outputPattern = join(directory, 'rembr-frame-%03d.jpg');
  await runner(config.ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath,
    '-vf', `fps=1/${intervalSeconds.toFixed(3)},scale=min(720\\,iw):-2`, '-frames:v', String(MAX_VIDEO_KEYFRAMES), '-q:v', '3', outputPattern,
  ]);
  const names = (await readdir(directory)).filter((name) => /^rembr-frame-\d{3}\.jpg$/.test(name)).sort().slice(0, MAX_VIDEO_KEYFRAMES);
  const files: Array<TemporaryAnalysisMediaFile & { role: 'video_frame'; timestampSeconds: number }> = [];
  for (const [index, name] of names.entries()) {
    const path = join(directory, name);
    const details = await stat(path);
    if (details.size < 4 || details.size > MAX_MEDIA_BYTES) continue;
    const handle = await open(path, 'r');
    try {
      const header = Buffer.alloc(3);
      const { bytesRead } = await handle.read(header, 0, 3, 0);
      if (bytesRead < 3 || header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) continue;
    } finally { await handle.close(); }
    files.push({ path, mime: 'image/jpeg', byteSize: details.size, kind: 'image', role: 'video_frame', timestampSeconds: Number((index * intervalSeconds).toFixed(2)) });
  }
  return files;
}

/**
 * Finds public media with SSRF-safe downloads, avoids unrelated page images for video posts,
 * and normalizes supported video containers before private, bounded analysis.
 */
export async function resolveTemporaryAnalysisMedia(
  pageUrl: string,
  options: {
    fetchPage?: typeof fetchPublicPage;
    fetchMedia?: typeof fetchPublicMediaToTemp;
    runCommand?: CommandRunner;
    probe?: typeof probeVideo;
  } = {},
): Promise<TemporaryAnalysisMedia> {
  const fetchPage = options.fetchPage ?? fetchPublicPage;
  const fetchMedia = options.fetchMedia ?? fetchPublicMediaToTemp;
  const run = options.runCommand ?? runCommand;
  const probe = options.probe ?? ((path: string) => probeVideo(path, run));
  const directory = await createPrivateMediaTempDirectory();
  const files: TemporaryAnalysisMediaFile[] = [];
  const coverage: MediaCoverage = {
    expectedVideo: /instagram\.com\/reel\//i.test(pageUrl), pageImagesFound: 0, pageImagesUsed: 0,
    sourceVideoMime: null, normalizedVideoMime: null, videoDurationSeconds: null, videoTruncated: false,
    videoAnalyzed: false, sampledFramesSeconds: [], audioTrackDetected: false, audioDurationSeconds: 0,
    transcriptAvailable: false, warnings: [],
  };
  let skippedCount = 0;
  let imageBytes = 0;
  try {
    let page: Awaited<ReturnType<typeof fetchPublicPage>>;
    try { page = await fetchPage(pageUrl); }
    catch {
      coverage.warnings.push('source_page_unavailable');
      if (coverage.expectedVideo) coverage.warnings.push('video_unavailable');
      return { files, skippedCount: 1, coverage, cleanup: () => removePrivateMediaTempDirectory(directory) };
    }
    const extracted = extractPage(page.html, page.finalUrl);
    const videoUrls = extracted.videoUrls.slice(0, 1);
    coverage.expectedVideo ||= videoUrls.length > 0;
    coverage.pageImagesFound = extracted.imageUrls.length;
    const imageUrls = coverage.expectedVideo ? [] : extracted.imageUrls.slice(0, MAX_ANALYSIS_IMAGES_PER_POST);

    for (const mediaUrl of imageUrls) {
      try {
        const remaining = MAX_ANALYSIS_IMAGE_BYTES_PER_POST - imageBytes;
        if (remaining <= 0) { skippedCount += 1; continue; }
        const asset = await fetchMedia(mediaUrl, directory, { maxBytes: Math.min(MAX_MEDIA_BYTES, remaining) });
        if (!SUPPORTED_IMAGE_MIMES.has(asset.mime) || !await signatureImageMatches(asset.path, asset.mime)) {
          skippedCount += 1;
          continue;
        }
        imageBytes += asset.byteSize;
        files.push({ path: asset.path, mime: asset.mime, byteSize: asset.byteSize, kind: 'image', role: 'page_image' });
        coverage.pageImagesUsed += 1;
      } catch { skippedCount += 1; }
    }

    for (const mediaUrl of videoUrls) {
      try {
        const asset = await fetchMedia(mediaUrl, directory, { maxBytes: MAX_VIDEO_MEDIA_BYTES });
        if (!SUPPORTED_VIDEO_MIMES.has(asset.mime)) throw new Error('unsupported_video_type');
        const sourceMime = await signatureVideoMime(asset.path, asset.mime);
        if (!sourceMime) throw new Error('video_signature_mismatch');
        coverage.sourceVideoMime = sourceMime;
        const probed = await probe(asset.path);
        coverage.videoDurationSeconds = probed.durationSeconds;
        coverage.videoTruncated = probed.durationSeconds > MAX_ANALYSIS_VIDEO_SECONDS;
        coverage.audioTrackDetected = probed.audioTrackDetected;
        const normalizedPath = await normalizeVideo(asset.path, directory, run);
        const normalizedStat = await stat(normalizedPath);
        files.push({ path: normalizedPath, mime: 'video/mp4', byteSize: normalizedStat.size, kind: 'video', role: 'video' });
        coverage.normalizedVideoMime = 'video/mp4';
        try {
          const frames = await extractVideoFrames(normalizedPath, directory, Math.min(probed.durationSeconds, MAX_ANALYSIS_VIDEO_SECONDS), run);
          files.push(...frames);
          coverage.sampledFramesSeconds = frames.map((frame) => frame.timestampSeconds);
          if (!frames.length) { skippedCount += 1; coverage.warnings.push('keyframes_unavailable'); }
        } catch { skippedCount += 1; coverage.warnings.push('keyframes_unavailable'); }
        if (probed.audioTrackDetected) {
          try {
            const audioFiles = await extractAudioChunks(normalizedPath, directory, run);
            files.push(...audioFiles);
            coverage.audioDurationSeconds = audioFiles.reduce((sum, file) => sum + file.durationSeconds, 0);
            if (!audioFiles.length) { skippedCount += 1; coverage.warnings.push('audio_extraction_failed'); }
            if (audioFiles.length === MAX_AUDIO_CHUNKS && audioFiles.at(-1)!.durationSeconds > AUDIO_CHUNK_SECONDS - 1) {
              skippedCount += 1;
              coverage.warnings.push('audio_duration_limited');
            }
          } catch { skippedCount += 1; coverage.warnings.push('audio_extraction_failed'); }
        }
        if (coverage.videoTruncated) coverage.warnings.push('video_duration_limited');
      } catch {
        skippedCount += 1;
        coverage.warnings.push('video_unavailable');
      }
    }
    if (coverage.expectedVideo && !coverage.normalizedVideoMime && !coverage.warnings.includes('video_unavailable')) {
      coverage.warnings.push('video_unavailable');
    }
    return { files, skippedCount, coverage, cleanup: () => removePrivateMediaTempDirectory(directory) };
  } catch (error) {
    await removePrivateMediaTempDirectory(directory);
    throw error;
  }
}

async function signatureImageMatches(path: string, mime: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (mime === 'image/jpeg') return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (mime === 'image/png') return bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mime === 'image/webp') return bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
    if (mime === 'image/gif') return bytesRead >= 6 && ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6));
    return false;
  } finally { await handle.close(); }
}

/** Reads a single bounded file only when a provider request is ready to be sent. */
export async function readTemporaryAnalysisFile(file: TemporaryAnalysisMediaFile): Promise<Buffer> {
  const bytes = await readFile(file.path);
  if (bytes.byteLength !== file.byteSize) throw new Error('temporary_media_size_mismatch');
  return bytes;
}
