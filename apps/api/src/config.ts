import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const configDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = [resolve(configDirectory, '../../..'), resolve(configDirectory, '../..')]
  .find((candidate) => existsSync(resolve(candidate, 'supabase/migrations')))
  ?? process.cwd();
dotenv.config({ path: resolve(projectRoot, '.env') });

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(Number(process.env.PORT ?? 4000)),
  WEB_ORIGIN: z.string().url().default(process.env.RENDER_EXTERNAL_URL ?? 'http://127.0.0.1:5173'),
  SERVE_WEB: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  STORAGE_BACKEND: z.enum(['local', 'supabase']).default('local'),
  DATABASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  SUPABASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  META_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  AI_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  OPENROUTER_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  SUPABASE_ASSET_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/).default('rembr-assets'),
  SUPABASE_IMPORT_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/).default('rembr-imports'),
  SUPABASE_MEDIA_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/).default('rembr-media'),
  WEB_BUILD_DIRECTORY: z.string().default('apps/web/dist'),
  ASSET_DIRECTORY: z.string().default('./data/assets'),
  IMPORT_DIRECTORY: z.string().default('./data/imports'),
  MEDIA_DIRECTORY: z.string().default('./data/media'),
  MAX_CAPTURE_BYTES: z.coerce.number().int().min(64_000).max(5_000_000).default(2_097_152),
  MAX_CAPTURE_REDIRECTS: z.coerce.number().int().min(0).max(5).default(3),
}).superRefine((value, context) => {
  if (value.STORAGE_BACKEND === 'supabase') {
    if (!value.SUPABASE_URL) context.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'Required when STORAGE_BACKEND=supabase.' });
    if (!value.SUPABASE_SERVICE_ROLE_KEY) context.addIssue({ code: 'custom', path: ['SUPABASE_SERVICE_ROLE_KEY'], message: 'Required when STORAGE_BACKEND=supabase.' });
  }
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
}

export const config = {
  ...parsed.data,
  databaseUrl: parsed.data.DATABASE_URL,
  ffmpegPath: parsed.data.FFMPEG_PATH,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  openRouterApiKey: parsed.data.OPENROUTER_API_KEY,
  assetDirectory: resolve(projectRoot, parsed.data.ASSET_DIRECTORY),
  importDirectory: resolve(projectRoot, parsed.data.IMPORT_DIRECTORY),
  mediaDirectory: resolve(projectRoot, parsed.data.MEDIA_DIRECTORY),
  webBuildDirectory: resolve(projectRoot, parsed.data.WEB_BUILD_DIRECTORY),
  projectRoot,
  secureCookies: parsed.data.NODE_ENV === 'production',
};
