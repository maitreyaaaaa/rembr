import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: resolve(projectRoot, '.env') });

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  DATABASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  ASSET_DIRECTORY: z.string().default('./data/assets'),
  IMPORT_DIRECTORY: z.string().default('./data/imports'),
  MEDIA_DIRECTORY: z.string().default('./data/media'),
  MAX_CAPTURE_BYTES: z.coerce.number().int().min(64_000).max(5_000_000).default(2_097_152),
  MAX_CAPTURE_REDIRECTS: z.coerce.number().int().min(0).max(5).default(3),
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
}

export const config = {
  ...parsed.data,
  databaseUrl: parsed.data.DATABASE_URL,
  assetDirectory: resolve(projectRoot, parsed.data.ASSET_DIRECTORY),
  importDirectory: resolve(projectRoot, parsed.data.IMPORT_DIRECTORY),
  mediaDirectory: resolve(projectRoot, parsed.data.MEDIA_DIRECTORY),
  projectRoot,
  secureCookies: parsed.data.NODE_ENV === 'production',
};
