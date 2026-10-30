import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createLocalAsr, probeWhisper, type LocalAsrRunner } from '../src/ai/local-asr.js';

function wav(): Buffer {
  const bytes = Buffer.alloc(44);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WAVE', 8, 'ascii');
  return bytes;
}

test('local ASR invokes Whisper with fixed arguments, bounds transcript text, and removes its output directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rembr-local-asr-test-'));
  const audioPath = join(root, 'audio-000.wav');
  const outputDirectory = join(root, 'output');
  await mkdir(outputDirectory);
  await writeFile(audioPath, wav());
  let argsSeen: string[] = [];
  let signalSeen: AbortSignal | undefined;
  const runner: LocalAsrRunner = async (_executable, args, options) => {
    argsSeen = args;
    signalSeen = options.signal;
    assert.equal(options.maxBuffer, 1024 * 1024);
    assert.equal(options.timeoutMs, 9_000);
    await writeFile(join(outputDirectory, 'audio-000.txt'), `${'hello '.repeat(2_000)}\0`);
    return '';
  };
  try {
    const asr = createLocalAsr({ executable: 'whisper', modelPath: join(root, 'model.pt'), timeoutMs: 9_000,
      runner, createTempDirectory: async () => outputDirectory });
    const controller = new AbortController();
    const transcript = await asr({ path: audioPath, mime: 'audio/wav', byteSize: 44, kind: 'wav', durationSeconds: 10 }, controller.signal);
    assert.equal(transcript.length, 10_000);
    assert.equal(transcript.includes('\0'), false);
    assert.deepEqual(argsSeen, [audioPath, '--model', join(root, 'model.pt'), '--output_format', 'txt', '--output_dir', outputDirectory, '--fp16', 'False']);
    assert.equal(signalSeen, controller.signal);
    await assert.rejects(readFile(outputDirectory));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local ASR validates private WAV inputs and requires a pre-provisioned model without downloading it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rembr-local-asr-probe-'));
  const modelPath = join(root, 'model.pt');
  await writeFile(modelPath, Buffer.from('model'));
  let probedArgs: string[] = [];
  const runner: LocalAsrRunner = async (_executable, args) => { probedArgs = args; return 'usage: whisper'; };
  try {
    assert.equal(await probeWhisper('whisper', modelPath, runner), true);
    assert.deepEqual(probedArgs, ['--help']);
    assert.equal(await probeWhisper('whisper', join(root, 'missing-model.pt'), runner), false);
    let called = false;
    const asr = createLocalAsr({ executable: 'whisper', modelPath, timeoutMs: 1_000,
      runner: async () => { called = true; return ''; }, createTempDirectory: async () => root });
    await assert.rejects(asr({ path: join(root, 'invalid.wav'), mime: 'audio/wav', byteSize: 2, kind: 'wav', durationSeconds: 1 }));
    assert.equal(called, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
