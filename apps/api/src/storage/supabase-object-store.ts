import { OWNER_WORK_LEASE_TTL_MS } from '../account/owner-lifecycle.js';

export const SUPABASE_STORAGE_REQUEST_TIMEOUT_MS = 60_000;

export class SupabaseObjectStore {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceRoleKey: string,
    readonly bucket: string,
    private readonly timeoutMs = SUPABASE_STORAGE_REQUEST_TIMEOUT_MS,
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs >= OWNER_WORK_LEASE_TTL_MS) {
      throw new TypeError('Supabase Storage request timeout must be positive and shorter than the owner-work lease TTL.');
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(url: string, init: RequestInit, consume: (response: Response) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('Supabase Storage request timed out.', 'TimeoutError')), this.timeoutMs);
    const abortFromCaller = () => controller.abort(signal?.reason ?? new DOMException('Supabase Storage request aborted.', 'AbortError'));
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return await consume(response);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private headers(extra: Record<string, string> = {}): HeadersInit {
    return {
      apikey: this.serviceRoleKey,
      authorization: `Bearer ${this.serviceRoleKey}`,
      ...extra,
    };
  }

  private endpoint(path: string): string {
    return `${this.baseUrl}/storage/v1/${path}`;
  }

  private objectPath(key: string): string {
    const segments = key.split('/');
    if (segments.length === 0 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error('invalid_storage_object_key');
    }
    return segments.map((segment) => encodeURIComponent(segment)).join('/');
  }

  private async expectOk(response: Response, operation: string): Promise<void> {
    if (!response.ok) throw new Error(`supabase_storage_${operation}_${response.status}`);
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    const lookup = await this.request(this.endpoint(`bucket/${encodeURIComponent(this.bucket)}`), {
      headers: this.headers(),
    }, async (response) => ({
      ok: response.ok,
      status: response.status,
      missingBucket: response.status === 404 || ((await response.clone().json().catch(() => null)) as { code?: unknown } | null)?.code === 'NoSuchBucket',
    }), signal);
    if (lookup.ok) return;

    // Supabase Storage can wrap a missing-bucket response as HTTP 400 while
    // preserving the actionable `NoSuchBucket` code in its JSON response.
    if (!lookup.missingBucket) {
      throw new Error(`supabase_storage_bucket_check_${lookup.status}`);
    }

    const response = await this.request(this.endpoint('bucket'), {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
    }, async (result) => result, signal);
    if (response.ok || response.status === 409) return;
    throw new Error(`supabase_storage_bucket_${response.status}`);
  }

  async write(key: string, bytes: Buffer, contentType: string, signal?: AbortSignal): Promise<void> {
    const response = await this.request(this.endpoint(`object/${encodeURIComponent(this.bucket)}/${this.objectPath(key)}`), {
      method: 'POST',
      headers: this.headers({ 'content-type': contentType, 'x-upsert': 'false' }),
      body: new Uint8Array(bytes),
    }, async (result) => result, signal);
    if (response.ok) return;
    if (response.status === 409) {
      const existing = await this.read(key, signal);
      if (existing.equals(bytes)) return;
      throw new Error('supabase_storage_object_conflict');
    }
    await this.expectOk(response, 'write');
  }

  async read(key: string, signal?: AbortSignal): Promise<Buffer> {
    return this.request(this.endpoint(`object/${encodeURIComponent(this.bucket)}/${this.objectPath(key)}`), {
      headers: this.headers(),
    }, async (response) => {
      await this.expectOk(response, 'read');
      return Buffer.from(await response.arrayBuffer());
    }, signal);
  }

  async remove(key: string, signal?: AbortSignal): Promise<void> {
    await this.removeMany([key], signal);
  }

  async removeMany(keys: string[], signal?: AbortSignal): Promise<void> {
    for (let offset = 0; offset < keys.length; offset += 100) {
      const response = await this.request(this.endpoint(`object/${encodeURIComponent(this.bucket)}`), {
        method: 'DELETE',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ prefixes: keys.slice(offset, offset + 100) }),
      }, async (result) => result, signal);
      await this.expectOk(response, 'remove');
    }
  }

  async listAll(signal?: AbortSignal): Promise<string[]> {
    const keys: string[] = [];
    const limit = 1000;
    for (let offset = 0; ; offset += limit) {
      const rows = await this.request(this.endpoint(`object/list/${encodeURIComponent(this.bucket)}`), {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ prefix: '', limit, offset, sortBy: { column: 'name', order: 'asc' } }),
      }, async (response) => {
        await this.expectOk(response, 'list');
        return await response.json() as Array<{ name?: unknown }>;
      }, signal);
      const page = rows.map((row) => row.name).filter((name): name is string => typeof name === 'string');
      keys.push(...page);
      if (page.length < limit) return keys;
    }
  }

  async removeUnknown(validKeys: Set<string>, signal?: AbortSignal): Promise<void> {
    const unknown = (await this.listAll(signal)).filter((key) => !validKeys.has(key));
    for (let offset = 0; offset < unknown.length; offset += 100) {
      await this.removeMany(unknown.slice(offset, offset + 100), signal);
    }
  }
}
