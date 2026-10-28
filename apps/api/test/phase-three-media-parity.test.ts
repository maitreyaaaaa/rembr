import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractPage } from '../src/items/extract.js';
import { detectSupportedMediaMime } from '../src/media/storage.js';

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
