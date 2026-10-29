import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type QueryResult } from 'pg';
import { config } from '../config.js';

type QueryResultLike = Pick<QueryResult, 'rows' | 'rowCount'>;
type Backend = {
  query: (text: string, values?: unknown[]) => Promise<QueryResultLike>;
  connect?: () => Promise<Backend & { release?: () => void }>;
  end?: () => Promise<void>;
  close?: () => Promise<void>;
};

export interface DatabaseHandle {
  prepare(sql: string): Statement;
  transaction<T>(callback: () => T | Promise<T>): () => Promise<T>;
  close(): Promise<void>;
}

export interface Statement {
  get<T = Record<string, unknown>>(...parameters: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...parameters: unknown[]): Promise<T[]>;
  run(...parameters: unknown[]): Promise<{ changes: number }>;
}

function toPostgresPlaceholders(sql: string): string {
  let output = '';
  let parameter = 0;
  let quote: "'" | '"' | null = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]!;
    const next = sql[index + 1];
    if (lineComment) {
      output += character;
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += character;
      if (character === '*' && next === '/') {
        output += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (!quote && character === '-' && next === '-') {
      output += '--';
      index += 1;
      lineComment = true;
      continue;
    }
    if (!quote && character === '/' && next === '*') {
      output += '/*';
      index += 1;
      blockComment = true;
      continue;
    }
    if (quote) {
      output += character;
      if (character === quote && next === quote) {
        output += next;
        index += 1;
      } else if (character === quote && sql[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
      continue;
    }
    if (character === '?') {
      parameter += 1;
      output += `$${parameter}`;
    } else {
      output += character;
    }
  }
  return output;
}

class PostgresDatabase implements DatabaseHandle {
  private readonly transactionContext = new AsyncLocalStorage<Backend>();
  private savepoint = 0;

  constructor(private readonly backend: Backend) {}

  private async query(sql: string, parameters: unknown[] = []): Promise<QueryResultLike> {
    const queryable = this.transactionContext.getStore() ?? this.backend;
    return queryable.query(toPostgresPlaceholders(sql), parameters);
  }

  prepare(sql: string): Statement {
    return {
      get: async <T>(...parameters: unknown[]) => {
        const result = await this.query(sql, parameters);
        return result.rows[0] as T | undefined;
      },
      all: async <T>(...parameters: unknown[]) => {
        const result = await this.query(sql, parameters);
        return result.rows as T[];
      },
      run: async (...parameters: unknown[]) => {
        const result = await this.query(sql, parameters);
        return { changes: result.rowCount ?? 0 };
      },
    };
  }

  transaction<T>(callback: () => T | Promise<T>): () => Promise<T> {
    return async () => {
      const current = this.transactionContext.getStore();
      const client: Backend & { release?: () => void } = current ?? (this.backend.connect ? await this.backend.connect() : this.backend);
      const nested = current !== undefined;
      const savepoint = nested ? `rembr_sp_${++this.savepoint}` : null;
      await client.query(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN');
      try {
        const result = await this.transactionContext.run(client, callback);
        await client.query(nested ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
        return result;
      } catch (error) {
        await client.query(nested ? `ROLLBACK TO SAVEPOINT ${savepoint}` : 'ROLLBACK');
        throw error;
      } finally {
        if (!nested && 'release' in client && typeof client.release === 'function') client.release();
      }
    };
  }

  async close(): Promise<void> {
    if (this.backend.end) await this.backend.end();
    else if (this.backend.close) await this.backend.close();
  }
}

export async function createDatabase(connectionString = config.databaseUrl): Promise<DatabaseHandle> {
  if (!connectionString) throw new Error('DATABASE_URL is required to connect Rembr to Supabase Postgres.');

  // Supabase Postgres uses its own CA, which is not in Node's default trust store.
  // Keep certificate and hostname verification enabled with the published root CA.
  const databaseUrl = new URL(connectionString);
  for (const option of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
    databaseUrl.searchParams.delete(option);
  }
  const supabaseRootCertificate = readFileSync(
    resolve(config.projectRoot, 'apps/api/certs/prod-ca-2021.crt'),
    'utf8',
  );

  const pool = new Pool({
    connectionString: databaseUrl.toString(),
    ssl: { ca: supabaseRootCertificate, rejectUnauthorized: true },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'rembr-api',
  });
  const database = new PostgresDatabase(pool);
  try {
    await database.prepare('SELECT 1').get();
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

const migrationDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations');

export async function createTestDatabase(): Promise<DatabaseHandle> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const embedded = new PGlite({ extensions: { vector } });
  for (const migration of readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()) {
    await embedded.exec(readFileSync(resolve(migrationDirectory, migration), 'utf8'));
  }
  return new PostgresDatabase(embedded as unknown as Backend);
}
