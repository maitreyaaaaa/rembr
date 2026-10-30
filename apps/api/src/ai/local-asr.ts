import { execFile } from 'node:child_process';
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, parse } from 'node:path';

const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 601;
const MAX_TRANSCRIPT_BYTES = 256 * 1024;
const MAX_TRANSCRIPT_LENGTH = 10_000;
const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;

export interface LocalAsrAudio {
  path: string;
  mime: string;
  byteSize: number;
  kind: string;
  durationSeconds?: number;
}

export type LocalAsrRunner = (executable: string, args: string[], options: {
  timeoutMs: number;
  maxBuffer: number;
  signal?: AbortSignal;
}) => Promise<string>;

function runExecutable(executable: string, args: string[], options: {
  timeoutMs: number;
  maxBuffer: number;
  signal?: AbortSignal;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      encoding: 'utf8', timeout: options.timeoutMs, maxBuffer: options.maxBuffer,
      killSignal: 'SIGKILL', windowsHide: true, signal: options.signal,
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export async function probeWhisper(executable: string, modelPath: string,
  runner: LocalAsrRunner = runExecutable): Promise<boolean> {
  try {
    const model = await stat(modelPath);
    if (!model.isFile() || model.size < 1) return false;
    const help = await runner(executable, ['--help'], { timeoutMs: 10_000, maxBuffer: 64 * 1024 });
    return /whisper/i.test(help);
  } catch {
    return false;
  }
}

export function createLocalAsr(options: {
  executable: string;
  modelPath: string;
  timeoutMs: number;
  runner?: LocalAsrRunner;
  createTempDirectory?: () => Promise<string>;
}) {
  const runner = options.runner ?? runExecutable;
  const createTempDirectory = options.createTempDirectory ?? (() => mkdtemp(join(tmpdir(), 'rembr-asr-')));
  return async (audio: LocalAsrAudio, signal?: AbortSignal): Promise<string> => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Transcription cancelled.', 'AbortError');
    if (audio.kind !== 'wav' || audio.mime !== 'audio/wav'
      || !Number.isSafeInteger(audio.byteSize) || audio.byteSize < 44 || audio.byteSize > MAX_AUDIO_BYTES
      || !Number.isFinite(audio.durationSeconds) || audio.durationSeconds! <= 0 || audio.durationSeconds! > MAX_AUDIO_SECONDS
      || !audio.path || !basename(audio.path).match(/^[a-zA-Z0-9_.-]+\.wav$/i)) {
      throw new Error('local_asr_invalid_audio');
    }

    const audioFile = await open(audio.path, 'r');
    try {
      const details = await audioFile.stat();
      const header = Buffer.alloc(12);
      const { bytesRead } = await audioFile.read(header, 0, header.length, 0);
      if (!details.isFile() || details.size !== audio.byteSize || bytesRead < 12
        || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('local_asr_invalid_audio');
      }
    } finally {
      await audioFile.close();
    }

    const outputDirectory = await createTempDirectory();
    try {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Transcription cancelled.', 'AbortError');
      await runner(options.executable, [audio.path, '--model', options.modelPath,
        '--output_format', 'txt', '--output_dir', outputDirectory, '--fp16', 'False'], {
        timeoutMs: options.timeoutMs, maxBuffer: MAX_PROCESS_OUTPUT_BYTES, signal,
      });
      if (signal?.aborted) throw signal.reason ?? new DOMException('Transcription cancelled.', 'AbortError');
      const outputPath = join(outputDirectory, `${parse(audio.path).name}.txt`);
      const outputStat = await stat(outputPath).catch(() => undefined);
      if (!outputStat?.isFile() || outputStat.size > MAX_TRANSCRIPT_BYTES) throw new Error('local_asr_invalid_output');
      const transcript = await readFile(outputPath, 'utf8');
      return transcript.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSCRIPT_LENGTH);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  };
}
