import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { resolve } from 'node:path';
import { z } from 'zod';
import { config } from './config.js';
import { createSession, destroySession, requireUser } from './auth/sessions.js';
import { createAccountRouter, createProfileGate } from './account/routes.js';
import { createLibraryRouter } from './library/routes.js';
import { createOrganizationRouter } from './organization/routes.js';
import { createImportRouter } from './imports/routes.js';
import { LocalImportStorage, type ImportStorage } from './imports/storage.js';
import { createJobRouter } from './jobs/routes.js';
import { LocalAssetStorage, type AssetStorage } from './assets/storage.js';
import { LocalMediaStorage, type MediaStorage } from './media/storage.js';
import type { DatabaseHandle } from './db/database.js';
import { CaptureError, validatePublicUrl } from './items/safe-fetch.js';
import { createLibraryService } from './library/service.js';

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const registerSchema = z.object({ email: emailSchema, password: z.string().min(12).max(128) }).strict();
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const captureSchema = z.object({ url: z.string().trim().min(8).max(2048) }).strict();

function errorResponse(code: string, message: string, requestId?: string) {
  return { error: { code, message, ...(requestId ? { requestId } : {}) } };
}

export function createApp(database: DatabaseHandle, options: { validateUrl?: typeof validatePublicUrl; assetDirectory?: string; assetStorage?: AssetStorage; importDirectory?: string; importStorage?: ImportStorage; mediaDirectory?: string; mediaStorage?: MediaStorage } = {}) {
  const app = express();
  const assetStorage = options.assetStorage ?? new LocalAssetStorage(options.assetDirectory ?? config.assetDirectory);
  const importStorage = options.importStorage ?? new LocalImportStorage(options.importDirectory ?? config.importDirectory);
  const mediaStorage = options.mediaStorage ?? new LocalMediaStorage(options.mediaDirectory ?? config.mediaDirectory);
  const library = createLibraryService(database, assetStorage, mediaStorage);
  const validateUrl = options.validateUrl ?? validatePublicUrl;
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const origin = req.get('origin');
    if (origin && origin !== new URL(config.WEB_ORIGIN).origin) {
      res.status(403).json(errorResponse('origin_not_allowed', 'This request origin is not allowed.', req.requestId));
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/api/auth/register', authLimiter, async (req, res, next) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse('invalid_input', 'Use a valid email and a password with at least 12 characters.', req.requestId));
      return;
    }
    try {
      const userId = randomUUID();
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      await database.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(userId, parsed.data.email, passwordHash, new Date().toISOString());
      await createSession(database, userId, res);
      res.status(201).json({ user: { id: userId, email: parsed.data.email } });
    } catch (error) {
      if ((typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') || String(error).includes('users_email_key')) {
        res.status(409).json(errorResponse('account_exists', 'An account with this email already exists.', req.requestId));
        return;
      }
      next(error);
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse('invalid_input', 'Enter a valid email and password.', req.requestId));
      return;
    }
    try {
      const user = await database.prepare('SELECT id, email, password_hash, account_status FROM users WHERE email = ?')
        .get(parsed.data.email) as { id: string; email: string; password_hash: string; account_status: string } | undefined;
      const matches = user ? await bcrypt.compare(parsed.data.password, user.password_hash) : false;
      if (!user || !matches) {
        res.status(401).json(errorResponse('invalid_credentials', 'Email or password is incorrect.', req.requestId));
        return;
      }
      if (user.account_status !== 'active') {
        res.status(403).json(errorResponse('account_disabled', 'This account is disabled.', req.requestId));
        return;
      }
      await createSession(database, user.id, res);
      res.json({ user: { id: user.id, email: user.email } });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    await destroySession(database, req, res);
    res.status(204).end();
  });

  app.use('/api', createAccountRouter(database, assetStorage));

  const requireSignedIn = requireUser(database) as RequestHandler;
  const requireCompletedProfile = createProfileGate(database, assetStorage) as RequestHandler;
  const captureLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

  app.post('/api/items', requireSignedIn, requireCompletedProfile, captureLimiter, async (req, res, next) => {
    const parsed = captureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse('invalid_url', 'Enter a complete URL to a public web page.', req.requestId));
      return;
    }
    try {
      const validated = await validateUrl(parsed.data.url);
      validated.url.hash = '';
      const canonicalUrl = validated.url.toString();
      const result = await library.createPage(req.user!.id, parsed.data.url, canonicalUrl, validated.url.hostname, req.requestId);
      res.status(result.duplicate ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof CaptureError) {
        res.status(400).json(errorResponse(error.code, error.message, req.requestId));
        return;
      }
      next(error);
    }
  });
  app.use('/api', createLibraryRouter(database, assetStorage, mediaStorage));
  app.use('/api', createOrganizationRouter(database, assetStorage));
  app.use('/api', createImportRouter(database, assetStorage, importStorage));
  app.use('/api', createJobRouter(database, assetStorage));

  if (config.SERVE_WEB) {
    app.use(express.static(config.webBuildDirectory, { index: false, fallthrough: true }));
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path === '/api' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(resolve(config.webBuildDirectory, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((_req, res) => res.status(404).json(errorResponse('not_found', 'This route does not exist.', res.getHeader('X-Request-Id')?.toString())));

  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    const requestId = req.requestId;
    if (error instanceof multer.MulterError) {
      const isSize = error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FIELD_VALUE';
      res.status(isSize ? 413 : 400).json(errorResponse(isSize ? 'payload_too_large' : 'invalid_multipart', isSize ? 'The uploaded file or field exceeds the allowed size.' : 'The multipart upload is invalid or exceeds the allowed file count.', requestId));
      return;
    }
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
      res.status(413).json(errorResponse('payload_too_large', 'The uploaded part exceeds the 25 MiB limit.', requestId));
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json(errorResponse('invalid_json', 'The request body must be valid JSON.', requestId));
      return;
    }
    console.error('request_failed', { requestId, errorType: error instanceof Error ? error.name : 'unknown' });
    res.status(500).json(errorResponse('internal_error', 'Rembr could not complete this request. Try again.', requestId));
  };
  app.use(errors);
  return app;
}

export type RembrApp = ReturnType<typeof createApp>;
