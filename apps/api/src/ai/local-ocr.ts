import { execFile } from 'node:child_process';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_OCR_OUTPUT_BYTES = 128 * 1024;
const MAX_OCR_TEXT_LENGTH = 30_000;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface LocalOcrImage {
  path: string;
  mime: string;
  byteSize: number;
  kind: string;
}

export type LocalOcrRunner = (executable: string, args: string[], options: {
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
      encoding: 'utf8',
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer,
      killSignal: 'SIGKILL',
      windowsHide: true,
      signal: options.signal,
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export async function probeTesseract(executable: string, runner: LocalOcrRunner = runExecutable): Promise<boolean> {
  try {
    const version = await runner(executable, ['--version'], { timeoutMs: 5_000, maxBuffer: 4_096 });
    return /^tesseract\s+\d/i.test(version.trim());
  } catch {
    return false;
  }
}

export function createLocalOcr(options: {
  executable: string;
  timeoutMs: number;
  runner?: LocalOcrRunner;
}) {
  const runner = options.runner ?? runExecutable;
  return async (image: LocalOcrImage, signal?: AbortSignal): Promise<string> => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('OCR cancelled.', 'AbortError');
    if (image.kind !== 'image' || !IMAGE_MIMES.has(image.mime)
      || !Number.isSafeInteger(image.byteSize) || image.byteSize < 1 || image.byteSize > MAX_IMAGE_BYTES) {
      throw new Error('local_ocr_invalid_image');
    }
    const text = await runner(options.executable, [image.path, 'stdout', '--psm', '6', '-l', 'eng'], {
      timeoutMs: options.timeoutMs,
      maxBuffer: MAX_OCR_OUTPUT_BYTES,
      signal,
    });
    return text.replace(/\0/g, '').trim().slice(0, MAX_OCR_TEXT_LENGTH);
  };
}
