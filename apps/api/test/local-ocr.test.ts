import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalOcr, probeTesseract, type LocalOcrRunner } from '../src/ai/local-ocr.js';

test('local OCR invokes Tesseract with fixed arguments and bounded output', async () => {
  let invocation: { executable: string; args: string[]; maxBuffer: number; timeoutMs: number } | undefined;
  const runner: LocalOcrRunner = async (executable, args, options) => {
    invocation = { executable, args, maxBuffer: options.maxBuffer, timeoutMs: options.timeoutMs };
    return `${'x'.repeat(30_010)}\0`;
  };
  const ocr = createLocalOcr({ executable: 'C:\\Tools\\tesseract.exe', timeoutMs: 5_000, runner });
  const text = await ocr({ path: 'C:\\temp files\\image.png', mime: 'image/png', byteSize: 3, kind: 'image' });
  assert.deepEqual(invocation, {
    executable: 'C:\\Tools\\tesseract.exe',
    args: ['C:\\temp files\\image.png', 'stdout', '--psm', '6', '-l', 'eng'],
    maxBuffer: 128 * 1024,
    timeoutMs: 5_000,
  });
  assert.equal(text.length, 30_000);
});

test('local OCR rejects unsupported and oversized inputs before executing', async () => {
  let calls = 0;
  const ocr = createLocalOcr({ executable: 'tesseract', timeoutMs: 1_000, runner: async () => { calls += 1; return ''; } });
  await assert.rejects(ocr({ path: 'file', mime: 'image/svg+xml', byteSize: 3, kind: 'image' }), /local_ocr_invalid_image/);
  await assert.rejects(ocr({ path: 'file', mime: 'image/jpeg', byteSize: 5 * 1024 * 1024 + 1, kind: 'image' }), /local_ocr_invalid_image/);
  await assert.rejects(ocr({ path: 'file', mime: 'image/jpeg', byteSize: 3, kind: 'video' }), /local_ocr_invalid_image/);
  assert.equal(calls, 0);
});

test('local OCR honors an already-aborted owner lease', async () => {
  let calls = 0;
  const ocr = createLocalOcr({ executable: 'tesseract', timeoutMs: 1_000, runner: async () => { calls += 1; return ''; } });
  const controller = new AbortController();
  controller.abort(new Error('owner_lease_lost'));
  await assert.rejects(ocr({ path: 'file', mime: 'image/jpeg', byteSize: 3, kind: 'image' }, controller.signal), /owner_lease_lost/);
  assert.equal(calls, 0);
});

test('local OCR runtime probe only reports a Tesseract version', async () => {
  assert.equal(await probeTesseract('tesseract', async () => 'tesseract 5.3.0'), true);
  assert.equal(await probeTesseract('other', async () => 'not an OCR runtime'), false);
  assert.equal(await probeTesseract('missing', async () => { throw new Error('not found'); }), false);
});
