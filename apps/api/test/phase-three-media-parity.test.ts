import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractPage } from '../src/items/extract.js';
import { detectSupportedMediaMime } from '../src/media/storage.js';
import { MAX_ANALYSIS_AUDIO_SECONDS_PER_POST, MAX_ANALYSIS_IMAGE_BYTES_PER_POST, MAX_ANALYSIS_IMAGES_PER_POST, resolveTemporaryAnalysisMedia } from '../src/ai/temporary-media.js';

function wavBytes(durationSeconds = 1): Buffer {
  const dataLength = durationSeconds * 32_000;
  const bytes = Buffer.alloc(44 + dataLength);
  bytes.write('RIFF', 0, 'ascii'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8, 'ascii');
  bytes.write('fmt ', 12, 'ascii'); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24); bytes.writeUInt32LE(32_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii'); bytes.writeUInt32LE(dataLength, 40);
  return bytes;
}

test('page extraction collects explicit Open Graph and HTML audio/video sources', () => {
  const result = extractPage(`<meta property="og:video" content="/movie.mp4">
    <meta property="og:audio:secure_url" content="https://cdn.example.com/voice.mp3">
    <video><source src="/clip.webm" type="video/webm"></video>
    <audio src="/sound.ogg"></audio>`, 'https://example.com/article');
  assert.deepEqual(result.mediaUrls, [
    'https://example.com/movie.mp4', 'https://cdn.example.com/voice.mp3',
    'https://example.com/clip.webm', 'https://example.com/sound.ogg',
  ]);
  assert.deepEqual(result.audioUrls, ['https://cdn.example.com/voice.mp3']);
});

test('page extraction repairs misdecoded Instagram metadata and body text only for Instagram', () => {
  const broken = 'A\u00e2\u0080\u0099s look \u00f0\u009f\u0098\u0080';
  const instagram = extractPage('<meta property="og:title" content="' + broken + '">' +
    '<meta name="description" content="' + broken + '"><main>' + broken + '</main>', 'https://www.instagram.com/p/example/');
  const other = extractPage('<title>' + broken + '</title><main>' + broken + '</main>', 'https://example.com');
  assert.equal(instagram.title, 'A’s look 😀');
  assert.equal(instagram.description, 'A’s look 😀');
  assert.equal(instagram.text, 'A’s look 😀');
  assert.equal(other.title, broken);
  assert.equal(other.text, broken);
});

test('media signature detection accepts supported audio/video and rejects mismatched bytes', () => {
  const mp4 = Buffer.alloc(12); mp4.write('ftyp', 4, 'ascii');
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]);
  const ogg = Buffer.from('OggS\x00\x02', 'binary');
  const mp3 = Buffer.from('ID3\x04\x00\x00', 'binary');
  const wav = Buffer.alloc(12); wav.write('RIFF', 0, 'ascii'); wav.write('WAVE', 8, 'ascii');
  assert.equal(detectSupportedMediaMime(mp4, 'video/mp4'), 'video/mp4');
  assert.equal(detectSupportedMediaMime(webm, 'video/webm'), 'video/webm');
  assert.equal(detectSupportedMediaMime(ogg, 'video/ogg'), 'video/ogg');
  assert.equal(detectSupportedMediaMime(webm, 'audio/webm'), 'audio/webm');
  assert.equal(detectSupportedMediaMime(mp3, 'audio/mpeg'), 'audio/mpeg');
  assert.equal(detectSupportedMediaMime(wav, 'audio/wav'), 'audio/wav');
  assert.equal(detectSupportedMediaMime(Buffer.from('not media'), 'video/mp4'), null);
  assert.equal(detectSupportedMediaMime(mp4, 'application/octet-stream'), null);
});

test('temporary Instagram media discovery caps a carousel at 20 images and 100 MiB', async () => {
  const html = Array.from({ length: 24 }, (_value, index) => `<img src="https://cdn.example/${index}.jpg">`).join('');
  let requestedBytes = 0;
  const resolution = await resolveTemporaryAnalysisMedia('https://www.instagram.com/p/example/', {
    fetchPage: async () => ({ finalUrl: 'https://www.instagram.com/p/example/', contentType: 'text/html', html }),
    fetchMedia: async (url, directory, options) => {
      assert.ok(url.startsWith('https://cdn.example/'));
      assert.equal(options?.maxBytes, 5 * 1024 * 1024);
      requestedBytes += 5 * 1024 * 1024;
      const path = join(directory, `image-${requestedBytes}`);
      await writeFile(path, Buffer.from([0xff, 0xd8, 0xff]));
      return { finalUrl: url, mime: 'image/jpeg', path, byteSize: 5 * 1024 * 1024 };
    },
  });
  try {
    assert.equal(resolution.files.length, MAX_ANALYSIS_IMAGES_PER_POST);
    assert.equal(requestedBytes, MAX_ANALYSIS_IMAGE_BYTES_PER_POST);
    assert.equal(resolution.files.reduce((sum, file) => sum + file.byteSize, 0), MAX_ANALYSIS_IMAGE_BYTES_PER_POST);
  } finally { await resolution.cleanup(); }
});

test('temporary analysis rejects media whose bytes do not match the declared MIME type', async () => {
  const resolution = await resolveTemporaryAnalysisMedia('https://www.instagram.com/p/example/', {
    fetchPage: async () => ({ finalUrl: 'https://www.instagram.com/p/example/', contentType: 'text/html', html: '<img src="https://cdn.example/image.jpg">' }),
    fetchMedia: async (url, directory) => {
      const path = join(directory, 'not-an-image');
      await writeFile(path, 'this is not a jpeg');
      return { finalUrl: url, mime: 'image/jpeg', path, byteSize: 18 };
    },
  });
  try {
    assert.equal(resolution.files.length, 0);
    assert.equal(resolution.skippedCount, 1);
  } finally { await resolution.cleanup(); }
});

test('temporary analysis discovers one bounded standalone audio source and supplies capped WAV chunks', async () => {
  const requested: string[] = [];
  let maxBytes: number | undefined;
  const resolution = await resolveTemporaryAnalysisMedia('https://www.instagram.com/p/example/', {
    fetchPage: async () => ({ finalUrl: 'https://www.instagram.com/p/example/', contentType: 'text/html', html: `
      <meta property="og:audio:secure_url" content="https://cdn.example/voice.mp3">
      <audio src="https://cdn.example/alternate.mp3"></audio>` }),
    fetchMedia: async (url, directory, options) => {
      requested.push(url); maxBytes = options?.maxBytes;
      const path = join(directory, 'source-audio');
      const bytes = Buffer.from('ID3\x04\x00\x00', 'binary');
      await writeFile(path, bytes);
      return { finalUrl: url, mime: 'audio/mpeg', path, byteSize: bytes.length };
    },
    runFfmpeg: async (inputPath, outputPattern, maxDurationSeconds) => {
      assert.match(inputPath, /source-audio$/);
      assert.match(outputPattern, /rembr-direct-audio-%03d\.wav$/);
      assert.equal(maxDurationSeconds, MAX_ANALYSIS_AUDIO_SECONDS_PER_POST);
      const path = outputPattern.replace('%03d', '000');
      const bytes = wavBytes();
      await writeFile(path, bytes);
    },
  });
  try {
    assert.deepEqual(requested, ['https://cdn.example/voice.mp3']);
    assert.equal(maxBytes, 25 * 1024 * 1024);
    assert.equal(resolution.skippedCount, 0);
    assert.equal(resolution.files.length, 1);
    assert.equal(resolution.files[0]?.mime, 'audio/wav');
    assert.equal(resolution.files[0]?.kind, 'wav');
    assert.equal(resolution.files[0]?.durationSeconds, 1);
  } finally { await resolution.cleanup(); }
});

test('temporary analysis skips standalone audio with invalid signatures before invoking ffmpeg', async () => {
  let transcodeCalls = 0;
  const resolution = await resolveTemporaryAnalysisMedia('https://www.instagram.com/p/example/', {
    fetchPage: async () => ({ finalUrl: 'https://www.instagram.com/p/example/', contentType: 'text/html', html: '<audio src="https://cdn.example/not-audio.mp3"></audio>' }),
    fetchMedia: async (url, directory) => {
      const path = join(directory, 'not-audio');
      await writeFile(path, 'not audio bytes');
      return { finalUrl: url, mime: 'audio/mpeg', path, byteSize: 15 };
    },
    runFfmpeg: async () => { transcodeCalls += 1; },
  });
  try {
    assert.equal(resolution.files.length, 0);
    assert.equal(resolution.skippedCount, 1);
    assert.equal(transcodeCalls, 0);
  } finally { await resolution.cleanup(); }
});

test('temporary analysis records the skipped visual stage while transcribing validated WebM and Ogg video', async () => {
  const cases = [
    { mime: 'video/webm', suffix: 'webm', bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]) },
    { mime: 'video/ogg', suffix: 'ogg', bytes: Buffer.from('OggS\x00\x02', 'binary') },
  ];
  for (const video of cases) {
    let maxBytes: number | undefined;
    const resolution = await resolveTemporaryAnalysisMedia('https://www.instagram.com/p/example/', {
      fetchPage: async () => ({ finalUrl: 'https://www.instagram.com/p/example/', contentType: 'text/html', html: `<video src="https://cdn.example/clip.${video.suffix}"></video>` }),
      fetchMedia: async (url, directory, options) => {
        maxBytes = options?.maxBytes;
        const path = join(directory, `source-video-${video.suffix}`);
        await writeFile(path, video.bytes);
        return { finalUrl: url, mime: video.mime, path, byteSize: video.bytes.length };
      },
      runFfmpeg: async (inputPath, outputPattern, maxDurationSeconds) => {
        assert.match(inputPath, new RegExp(`source-video-${video.suffix}$`));
        assert.equal(maxDurationSeconds, MAX_ANALYSIS_AUDIO_SECONDS_PER_POST);
        await writeFile(outputPattern.replace('%03d', '000'), wavBytes());
      },
    });
    try {
      assert.equal(maxBytes, 25 * 1024 * 1024);
      assert.equal(resolution.skippedCount, 1);
      assert.equal(resolution.files.length, 1);
      assert.deepEqual(resolution.files.map(({ kind, mime }) => ({ kind, mime })), [{ kind: 'wav', mime: 'audio/wav' }]);
    } finally { await resolution.cleanup(); }
  }
});

test('temporary analysis rejects non-MP4 video with a bad signature before invoking ffmpeg', async () => {
  let transcodeCalls = 0;
  const resolution = await resolveTemporaryAnalysisMedia('https://www.instagram.com/p/example/', {
    fetchPage: async () => ({ finalUrl: 'https://www.instagram.com/p/example/', contentType: 'text/html', html: '<video src="https://cdn.example/not-video.webm"></video>' }),
    fetchMedia: async (url, directory) => {
      const path = join(directory, 'not-video-webm');
      await writeFile(path, 'not a webm file');
      return { finalUrl: url, mime: 'video/webm', path, byteSize: 15 };
    },
    runFfmpeg: async () => { transcodeCalls += 1; },
  });
  try {
    assert.equal(resolution.files.length, 0);
    assert.equal(resolution.skippedCount, 1);
    assert.equal(transcodeCalls, 0);
  } finally { await resolution.cleanup(); }
});

test('temporary analysis propagates cancellation through page, media, and ffmpeg work', async () => {
  const controller = new AbortController();
  let markFfmpegStarted!: () => void;
  let temporaryDirectory = '';
  const ffmpegStarted = new Promise<void>((resolve) => { markFfmpegStarted = resolve; });
  const abortReason = new Error('analysis_cancelled');
  const pending = resolveTemporaryAnalysisMedia('https://www.instagram.com/p/example/', {
    signal: controller.signal,
    fetchPage: async (_url, options) => {
      assert.equal(options?.signal, controller.signal);
      return { finalUrl: 'https://www.instagram.com/p/example/', contentType: 'text/html', html: '<video src="https://cdn.example/clip.mp4"></video>' };
    },
    fetchMedia: async (url, directory, options) => {
      assert.equal(options?.signal, controller.signal);
      temporaryDirectory = directory;
      const path = join(directory, 'source-video-mp4');
      const bytes = Buffer.alloc(12); bytes.write('ftyp', 4, 'ascii');
      await writeFile(path, bytes);
      return { finalUrl: url, mime: 'video/mp4', path, byteSize: bytes.length };
    },
    runFfmpeg: async (_inputPath, _outputPattern, _duration, signal) => {
      assert.equal(signal, controller.signal);
      markFfmpegStarted();
      await new Promise<void>((_resolve, reject) => {
        if (signal?.aborted) { reject(signal.reason); return; }
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
  });
  await ffmpegStarted;
  controller.abort(abortReason);
  await assert.rejects(pending, (error: unknown) => error === abortReason);
  await assert.rejects(access(temporaryDirectory));
});
