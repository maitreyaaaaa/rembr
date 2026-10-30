import { execFile } from 'node:child_process';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_DIMENSIONS = 2048;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface LocalVisualImage {
  path: string;
  mime: string;
  byteSize: number;
}

export interface LocalVisualEmbedding {
  model: string;
  embedding: number[];
}

export type LocalVisualRunner = (executable: string, args: string[], options: {
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
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

export function normalizeVisualEmbedding(value: unknown, maxDimensions = MAX_DIMENSIONS): number[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxDimensions) return null;
  const vector = value.map((entry) => typeof entry === 'number' ? entry : Number(entry));
  if (vector.some((entry) => !Number.isFinite(entry)) || vector.every((entry) => entry === 0)) return null;
  return vector;
}

export function parseLocalVisualEmbedding(output: string, model: string): LocalVisualEmbedding | null {
  if (Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(output); } catch { return null; }
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const embedding = normalizeVisualEmbedding(Array.isArray(value) ? value : object?.embedding ?? object?.visualEmbedding ?? object?.visual_embedding ?? object?.imageEmbedding ?? object?.image_embedding);
  if (!embedding) return null;
  const reportedModel = object && typeof object.model === 'string' ? object.model.trim().slice(0, 120) : '';
  return { model: reportedModel || model, embedding };
}

export async function probeVisualEmbedding(executable: string, runner: LocalVisualRunner = runExecutable): Promise<boolean> {
  try {
    const output = await runner(executable, ['--version'], { timeoutMs: 5_000, maxBuffer: 4_096 });
    return output.trim().length > 0;
  } catch { return false; }
}

export function createLocalVisualEmbedding(options: {
  executable: string;
  model: string;
  timeoutMs: number;
  runner?: LocalVisualRunner;
}) {
  const runner = options.runner ?? runExecutable;
  const model = options.model.trim().slice(0, 120) || 'local-ml-visual';
  return async (image: LocalVisualImage, signal?: AbortSignal): Promise<LocalVisualEmbedding> => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Visual embedding cancelled.', 'AbortError');
    if (!image.path || !IMAGE_MIMES.has(image.mime) || !Number.isSafeInteger(image.byteSize)
      || image.byteSize < 1 || image.byteSize > MAX_IMAGE_BYTES) throw new Error('local_visual_invalid_image');
    const output = await runner(options.executable, [image.path], {
      timeoutMs: options.timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, signal,
    });
    if (signal?.aborted) throw signal.reason ?? new DOMException('Visual embedding cancelled.', 'AbortError');
    const parsed = parseLocalVisualEmbedding(output, model);
    if (!parsed) throw new Error('local_visual_invalid_output');
    if (parsed.model !== model) throw new Error('local_visual_model_mismatch');
    return parsed;
  };
}
