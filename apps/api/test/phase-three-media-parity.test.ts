import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { extractPage } from '../src/items/extract.js';
import { detectSupportedMediaMime } from '../src/media/storage.js';
import { MAX_ANALYSIS_IMAGE_BYTES_PER_POST, MAX_ANALYSIS_IMAGES_PER_POST, resolveTemporaryAnalysisMedia } from '../src/ai/temporary-media.js';

test('page extraction collects explicit Open Graph and HTML audio/video sources', () => {
  const result = extractPage(`<meta property="og:video" content="/movie.mp4">
    <meta property="og:audio:secure_url" content="https://cdn.example.com/voice.mp3">
    <video><source src="/clip.webm" type="video/webm"></video>
    <audio src="/sound.ogg"></audio>`, 'https://example.com/article');
  assert.deepEqual(result.mediaUrls, [
    'https://example.com/movie.mp4', 'https://cdn.example.com/voice.mp3',
    'https://example.com/clip.webm', 'https://example.com/sound.ogg',
  ]);
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
  const mp3 = Buffer.from('ID3\x04\x00\x00', 'binary');
  const wav = Buffer.alloc(12); wav.write('RIFF', 0, 'ascii'); wav.write('WAVE', 8, 'ascii');
  assert.equal(detectSupportedMediaMime(mp4, 'video/mp4'), 'video/mp4');
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

test('temporary Reel analysis excludes unrelated page images when its video cannot be found', async () => {
  const resolution = await resolveTemporaryAnalysisMedia('https://www.instagram.com/reel/example/', {
    fetchPage: async () => ({ finalUrl: 'https://www.instagram.com/reel/example/', contentType: 'text/html',
      html: '<img src="https://cdn.example/recommended.jpg"><meta property="og:title" content="A saved reel">' }),
    fetchMedia: async () => { throw new Error('there should be no page-image download for a Reel'); },
  });
  try {
    assert.equal(resolution.files.length, 0);
    assert.equal(resolution.coverage?.expectedVideo, true);
    assert.equal(resolution.coverage?.pageImagesFound, 1);
    assert.equal(resolution.coverage?.pageImagesUsed, 0);
    assert.ok(resolution.coverage?.warnings.includes('video_unavailable'));
  } finally { await resolution.cleanup(); }
});

test('temporary Reel analysis normalizes WebM and emits timestamped frames', async () => {
  const resolution = await resolveTemporaryAnalysisMedia('https://www.instagram.com/reel/example/', {
    fetchPage: async () => ({ finalUrl: 'https://www.instagram.com/reel/example/', contentType: 'text/html',
      html: '<video><source src="https://cdn.example/clip.webm" type="video/webm"></video><img src="https://cdn.example/other.jpg">' }),
    fetchMedia: async (url, directory) => {
      assert.equal(url, 'https://cdn.example/clip.webm');
      const path = join(directory, 'source.webm');
      await writeFile(path, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]));
      return { finalUrl: url, mime: 'video/webm', path, byteSize: 5 };
    },
    probe: async () => ({ durationSeconds: 5, audioTrackDetected: false }),
    runCommand: async (_command, args) => {
      const output = args.at(-1)!;
      if (output.endsWith('.mp4')) {
        const header = Buffer.alloc(12); header.write('ftyp', 4, 'ascii');
        await writeFile(output, header);
      } else if (output.includes('rembr-frame-%03d.jpg')) {
        const directory = dirname(output);
        await mkdir(directory, { recursive: true });
        for (let index = 1; index <= 3; index += 1) {
          await writeFile(join(directory, `rembr-frame-${String(index).padStart(3, '0')}.jpg`), Buffer.from([0xff, 0xd8, 0xff, index]));
        }
      }
      return { stdout: '', stderr: '' };
    },
  });
  try {
    const frames = resolution.files.filter((file) => file.role === 'video_frame');
    assert.equal(resolution.coverage?.sourceVideoMime, 'video/webm');
    assert.equal(resolution.coverage?.normalizedVideoMime, 'video/mp4');
    assert.equal(resolution.coverage?.pageImagesFound, 1);
    assert.equal(resolution.coverage?.pageImagesUsed, 0);
    assert.equal(resolution.files.find((file) => file.role === 'video')?.mime, 'video/mp4');
    assert.deepEqual(frames.map((frame) => frame.timestampSeconds), [0, 0.5, 1]);
    assert.equal(resolution.coverage?.sampledFramesSeconds.length, 3);
  } finally { await resolution.cleanup(); }
});
