export class SupabaseObjectStore {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceRoleKey: string,
    readonly bucket: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
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

  private async expectOk(response: Response, operation: string): Promise<void> {
    if (!response.ok) throw new Error(`supabase_storage_${operation}_${response.status}`);
  }

  async initialize(): Promise<void> {
    const lookup = await fetch(this.endpoint(`bucket/${encodeURIComponent(this.bucket)}`), {
      headers: this.headers(),
    });
    if (lookup.ok) return;

    // Supabase Storage can wrap a missing-bucket response as HTTP 400 while
    // preserving the actionable `NoSuchBucket` code in its JSON response.
    const error = await lookup.clone().json().catch(() => null) as { code?: unknown } | null;
    if (lookup.status !== 404 && error?.code !== 'NoSuchBucket') {
      throw new Error(`supabase_storage_bucket_check_${lookup.status}`);
    }

    const response = await fetch(this.endpoint('bucket'), {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
    });
    if (response.ok || response.status === 409) return;
    throw new Error(`supabase_storage_bucket_${response.status}`);
  }

  async write(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const response = await fetch(this.endpoint(`object/${encodeURIComponent(this.bucket)}/${encodeURIComponent(key)}`), {
      method: 'POST',
      headers: this.headers({ 'content-type': contentType, 'x-upsert': 'false' }),
      body: new Uint8Array(bytes),
    });
    if (response.ok) return;
    if (response.status === 409) {
      const existing = await this.read(key);
      if (existing.equals(bytes)) return;
      throw new Error('supabase_storage_object_conflict');
    }
    await this.expectOk(response, 'write');
  }

  async read(key: string): Promise<Buffer> {
    const response = await fetch(this.endpoint(`object/${encodeURIComponent(this.bucket)}/${encodeURIComponent(key)}`), {
      headers: this.headers(),
    });
    await this.expectOk(response, 'read');
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    await this.removeMany([key]);
  }

  async removeMany(keys: string[]): Promise<void> {
    for (let offset = 0; offset < keys.length; offset += 100) {
      const response = await fetch(this.endpoint(`object/${encodeURIComponent(this.bucket)}`), {
        method: 'DELETE',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ prefixes: keys.slice(offset, offset + 100) }),
      });
      await this.expectOk(response, 'remove');
    }
  }

  async listAll(): Promise<string[]> {
    const keys: string[] = [];
    const limit = 1000;
    for (let offset = 0; ; offset += limit) {
      const response = await fetch(this.endpoint(`object/list/${encodeURIComponent(this.bucket)}`), {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ prefix: '', limit, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      await this.expectOk(response, 'list');
      const rows = await response.json() as Array<{ name?: unknown }>;
      const page = rows.map((row) => row.name).filter((name): name is string => typeof name === 'string');
      keys.push(...page);
      if (page.length < limit) return keys;
    }
  }

  async removeUnknown(validKeys: Set<string>): Promise<void> {
    const unknown = (await this.listAll()).filter((key) => !validKeys.has(key));
    for (let offset = 0; offset < unknown.length; offset += 100) {
      await this.removeMany(unknown.slice(offset, offset + 100));
    }
  }
}
