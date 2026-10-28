import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { detectImageMime, imageExtensionMatches, LocalAssetStorage } from '../assets/storage.js';
import { AccountServiceError, createAccountService } from './service.js';
import type { ProfileRow } from './repository.js';

const contentTypes = ['instagram', 'pinterest', 'web_pages_links', 'screenshots', 'documents_pdfs', 'voice_notes', 'notes', 'inspiration_ideas', 'videos_social_posts'] as const;
const referralSources = ['whatsapp_friend', 'instagram', 'youtube', 'tiktok', 'x_twitter', 'reddit', 'linkedin', 'google_search', 'product_hunt', 'school_college', 'other'] as const;
const profileSchema = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/).optional(), avatarUrl: z.string().trim().max(3000).optional() }).strict().superRefine((value, context) => {
  if (!value.avatarUrl) return;
  try {
    const url = new URL(value.avatarUrl);
    if (url.protocol !== 'https:' || url.username || url.password) context.addIssue({ code: 'custom', path: ['avatarUrl'], message: 'Avatar URL must be an HTTPS URL.' });
  } catch {
    context.addIssue({ code: 'custom', path: ['avatarUrl'], message: 'Avatar URL must be an HTTPS URL.' });
  }
});
const onboardingSchema = z.object({
  contentTypes: z.array(z.enum(contentTypes)).max(contentTypes.length).default([]),
  referralSource: z.union([z.enum(referralSources), z.literal('')]).default(''),
  skipped: z.boolean().default(false),
}).strict();

function error(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}
function publicProfile(userId: string, row: ProfileRow | undefined) {
  if (!row) return null;
  const avatarAssetId = row.avatarAssetId ? String(row.avatarAssetId) : null;
  return { userId, ...row, avatarAssetUrl: avatarAssetId ? `/api/assets/${avatarAssetId}` : null };
}

export function createAccountRouter(database: DatabaseHandle, storage: LocalAssetStorage) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const account = createAccountService(database, storage);
  const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024, files: 1, fields: 2, fieldSize: 4000 } }).single('avatar');

  router.get('/auth/session', signedIn, (req, res) => {
    const session = account.session(req.user!);
    res.json({
      ...session,
      profile: publicProfile(req.user!.id, session.profile),
    });
  });

  router.get('/profile', signedIn, (req, res) => {
    const row = account.getProfile(req.user!.id);
    res.json({ profile: publicProfile(req.user!.id, row), required: !row });
  });

  router.patch('/profile', signedIn, avatarUpload, async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    const avatarMime = req.file ? detectImageMime(req.file.buffer) : null;
    if (!parsed.success || (req.file && (req.file.size > 250 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(req.file.mimetype) || avatarMime !== req.file.mimetype || !avatarMime || !imageExtensionMatches(req.file.originalname, avatarMime)))) return error(res, 400, 'invalid_profile', 'Use a 3–24 character username with lowercase letters, numbers, or underscores, and a PNG, JPEG, WebP, or HTTPS avatar.', req.requestId);
    try {
      const row = await account.saveProfile(req.user!.id, parsed.data, req.file ? { buffer: req.file.buffer, mimetype: avatarMime! } : undefined);
      res.json({ profile: publicProfile(req.user!.id, row) });
    } catch (cause) {
      if (cause instanceof AccountServiceError && cause.code === 'username_taken') return error(res, 409, 'username_taken', cause.message, req.requestId);
      if (cause instanceof AccountServiceError) return error(res, 400, 'invalid_profile', cause.message, req.requestId);
      throw cause;
    }
  });

  router.get('/onboarding', signedIn, (req, res) => {
    res.json({ onboarding: account.getOnboarding(req.user!.id) });
  });

  router.put('/onboarding', signedIn, (req, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 400, 'invalid_onboarding', 'Choose valid onboarding options.', req.requestId);
    res.json({ onboarding: account.saveOnboarding(req.user!.id, parsed.data) });
  });

  return router;
}

export function createProfileGate(database: DatabaseHandle, storage: LocalAssetStorage) {
  const account = createAccountService(database, storage);
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) return error(res, 401, 'unauthorized', 'Sign in to continue.', req.requestId);
    if (!account.hasProfile(req.user.id)) return error(res, 428, 'PROFILE_INCOMPLETE', 'Complete your profile to continue.', req.requestId);
    next();
  };
}
