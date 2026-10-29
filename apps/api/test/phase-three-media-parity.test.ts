import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
