import type { ApiError } from './contracts.js';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers = new Headers(init.headers);
  if (!isForm && init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
    const error = new Error(payload.error?.message ?? 'Rembr could not complete that request. Try again.') as ApiError;
    error.status = response.status;
    error.code = payload.error?.code ?? 'request_failed';
    if (error.status === 401 || error.status === 403) window.dispatchEvent(new CustomEvent('rembr:auth-error', { detail: { status: error.status, code: error.code } }));
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiWithProgress<T>(path: string, body: FormData, signal: AbortSignal, onProgress: (progress: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => request.abort();
    if (signal.aborted) { reject(new DOMException('Upload canceled.', 'AbortError')); return; }
    request.open('PATCH', path);
    request.withCredentials = true;
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100));
    });
    request.addEventListener('load', () => {
      cleanup();
      let payload: { error?: { code?: string; message?: string } } = {};
      try { payload = JSON.parse(request.responseText) as typeof payload; } catch { /* A successful empty response is handled below. */ }
      if (request.status < 200 || request.status >= 300) {
        const error = new Error(payload.error?.message ?? 'Rembr could not complete that request. Try again.') as ApiError;
        error.status = request.status;
        error.code = payload.error?.code ?? 'request_failed';
        if (error.status === 401 || error.status === 403) window.dispatchEvent(new CustomEvent('rembr:auth-error', { detail: { status: error.status, code: error.code } }));
        reject(error);
        return;
      }
      onProgress(100);
      if (request.status === 204) resolve(undefined as T);
      else {
        try { resolve(JSON.parse(request.responseText) as T); }
        catch { reject(new Error('Rembr returned an invalid response. Try again.')); }
      }
    });
    request.addEventListener('error', () => { cleanup(); reject(new Error('The upload could not reach Rembr. Check your connection and try again.')); });
    request.addEventListener('abort', () => { cleanup(); reject(new DOMException('Upload canceled.', 'AbortError')); });
    signal.addEventListener('abort', abort, { once: true });
    request.send(body);
  });
}

export async function prepareVisualSearchImage(file: File): Promise<File> {
  const supported = ['image/png', 'image/jpeg', 'image/webp'];
  if (!supported.includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (file.size < 1 || file.size > 8 * 1024 * 1024) throw new Error('The selected image must be 8 MiB or smaller.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 30_000_000) {
      throw new Error('Choose an image with 30 megapixels or fewer.');
    }
    let width = Math.min(1000, bitmap.width);
    let height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
    if (height > 1000) { width = Math.max(1, Math.round(width * 1000 / height)); height = 1000; }
    const canvas = document.createElement('canvas');
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare this image.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', Math.max(0.55, 0.84 - attempt * 0.06)));
      if (blob && blob.size <= 700 * 1024) return new File([blob], 'visual-search.jpg', { type: 'image/jpeg' });
      width = Math.max(1, Math.round(width * 0.82)); height = Math.max(1, Math.round(height * 0.82));
    }
    throw new Error('Rembr could not reduce this image enough. Choose a smaller image.');
  } finally { bitmap.close(); }
}
