import express from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { OwnerLifecycleError, withOwnerWorkLease } from '../account/owner-lifecycle.js';
import { lockActiveOwner } from '../account/owner-lifecycle.js';
import { recordAccountActivityEvent } from '../account/activity-events.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import { detectImageMime } from '../assets/storage.js';
import type { createLibraryService } from '../library/service.js';
import { createAiUsageRepository, AiBudgetExceededError, sparkCostMicroUsd } from './usage.js';
import { MetaApiError, MAX_OUTPUT_TOKENS, type ImageInput, type ModelTextResult } from './meta-client.js';
import {
  parseVisualSearchAnalysis,
  VISUAL_SEARCH_DISCLOSURE_VERSION,
  VISUAL_SEARCH_MAX_RESULTS,
  VISUAL_SEARCH_PROMPT,
  VISUAL_SEARCH_MAX_UPLOAD_BYTES,
} from './visual-search.js';

const updatePreferenceSchema = z.object({ enabled: z.boolean(), disclosureVersion: z.string().optional() }).strict();

export interface VisualSearchModel {
  countImageInputTokens(prompt: string, images: ImageInput[]): Promise<number[]>;
  analyzeImages(prompt: string, images: ImageInput[], signal?: AbortSignal): Promise<ModelTextResult[]>;
}

interface VisualSearchPreference {
  enabled: boolean;
  consentVersion: string | null;
  consentedAt: string | null;
  disabledAt: string | null;
  updatedAt: string | null;
  providerAvailable: boolean;
}

function fail(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

function createVisualSearchPreferenceRepository(database: DatabaseHandle) {
  return {
    async get(ownerId: string, providerAvailable: boolean): Promise<VisualSearchPreference> {
      const row = await database.prepare(`SELECT enabled,consent_version,consented_at,disabled_at,updated_at
        FROM ai_visual_search_preferences WHERE owner_id=?`).get(ownerId) as {
        enabled: boolean | number; consent_version: string | null; consented_at: string | null;
        disabled_at: string | null; updated_at: string;
      } | undefined;
      return {
        enabled: Boolean(row?.enabled && row.consent_version === VISUAL_SEARCH_DISCLOSURE_VERSION),
        consentVersion: row?.consent_version ?? null, consentedAt: row?.consented_at ?? null,
        disabledAt: row?.disabled_at ?? null, updatedAt: row?.updated_at ?? null, providerAvailable,
      };
    },
    async set(ownerId: string, enabled: boolean): Promise<void> {
      const now = new Date().toISOString();
      await database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new Error('account_inactive');
        await database.prepare(`INSERT INTO ai_visual_search_preferences
          (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled,
            consent_version=CASE WHEN excluded.enabled THEN excluded.consent_version ELSE ai_visual_search_preferences.consent_version END,
            consented_at=CASE WHEN excluded.enabled THEN excluded.consented_at ELSE ai_visual_search_preferences.consented_at END,
            disabled_at=CASE WHEN excluded.enabled THEN NULL ELSE excluded.disabled_at END,
            updated_at=excluded.updated_at`)
          .run(ownerId, enabled, enabled ? VISUAL_SEARCH_DISCLOSURE_VERSION : null,
            enabled ? now : null, enabled ? null : now, now);
      })();
    },
  };
}

export function createVisualSearchRouter(database: DatabaseHandle, assetStorage: AssetStorage, options: {
  library: ReturnType<typeof createLibraryService>;
  imageModel?: VisualSearchModel;
  providerAvailable: () => Promise<boolean>;
}) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, assetStorage);
  const preferences = createVisualSearchPreferenceRepository(database);
  const usage = createAiUsageRepository(database);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: VISUAL_SEARCH_MAX_UPLOAD_BYTES, files: 1, fields: 0 },
  });
  const visualSearchLimit = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });

  router.get('/ai/visual-search-preferences', signedIn, async (req, res) => {
    res.json({ preference: await preferences.get(req.user!.id, await options.providerAvailable()) });
  });

  router.put('/ai/visual-search-preferences', signedIn, async (req, res) => {
    const parsed = updatePreferenceSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_visual_search_preference', 'Choose whether to enable image search.', req.requestId);
    if (parsed.data.enabled && parsed.data.disclosureVersion !== VISUAL_SEARCH_DISCLOSURE_VERSION) {
      return fail(res, 400, 'visual_search_consent_required', 'Review and accept the current image-search disclosure before enabling it.', req.requestId);
    }
    await preferences.set(req.user!.id, parsed.data.enabled);
    return res.json({ preference: await preferences.get(req.user!.id, await options.providerAvailable()) });
  });

  router.post('/visual-search', signedIn, profile, visualSearchLimit, upload.single('image'), async (req, res) => {
    const ownerId = req.user!.id;
    const preference = await preferences.get(ownerId, await options.providerAvailable());
    if (!preference.enabled) return fail(res, 403, 'visual_search_consent_required', 'Enable the separate image-search disclosure in Settings before sending a selected image to Meta AI.', req.requestId);
    if (!req.file) return fail(res, 400, 'visual_search_image_required', 'Choose a PNG, JPEG, or WebP image to search your library.', req.requestId);
    const detectedMime = detectImageMime(req.file.buffer);
    if (!detectedMime || !['image/png', 'image/jpeg', 'image/webp'].includes(detectedMime) || detectedMime !== req.file.mimetype) {
      return fail(res, 400, 'invalid_visual_search_image', 'Use a valid PNG, JPEG, or WebP image.', req.requestId);
    }
    if (!preference.providerAvailable || !options.imageModel) {
      return fail(res, 503, 'visual_search_unavailable', 'Visual search is unavailable right now. Use text search or try again later.', req.requestId);
    }

    const images: ImageInput[] = [{ bytes: req.file.buffer, mime: detectedMime }];
    let reservation: Awaited<ReturnType<typeof usage.reserveSearch>> | undefined;
    let providerReturned = false;
    try {
      const tokenCounts = await options.imageModel.countImageInputTokens(VISUAL_SEARCH_PROMPT, images);
      if (tokenCounts.length !== 1 || !Number.isSafeInteger(tokenCounts[0]) || tokenCounts[0]! < 0) {
        return fail(res, 502, 'visual_search_invalid_response', 'Meta AI returned an invalid image-analysis response.', req.requestId);
      }
      reservation = await usage.reserveSearch({ ownerId, amountMicroUsd: sparkCostMicroUsd(tokenCounts[0]!, MAX_OUTPUT_TOKENS) });
      const currentPreference = await preferences.get(ownerId, false);
      if (!currentPreference.enabled) {
        await usage.releaseSearch(reservation);
        reservation = undefined;
        return fail(res, 403, 'visual_search_consent_required', 'Image-search consent was turned off. Enable it again before searching.', req.requestId);
      }

      const generated = await withOwnerWorkLease(database, ownerId, 'visual_search', (signal) => options.imageModel!.analyzeImages(VISUAL_SEARCH_PROMPT, images, signal));
      providerReturned = true;
      if (generated.length !== 1) {
        const actual = generated.reduce((sum, output) => sum + sparkCostMicroUsd(output.inputTokens, output.outputTokens), 0);
        if (!await usage.settleSearch(reservation, actual)) {
          reservation = undefined;
          return fail(res, 503, 'visual_search_usage_unsettled', 'AI usage could not be safely reconciled. Use text search and try image search later.', req.requestId);
        }
        reservation = undefined;
        return fail(res, 502, 'visual_search_invalid_response', 'Meta AI returned an invalid image-analysis response.', req.requestId);
      }
      const result = generated[0]!;
      const actualMicroUsd = sparkCostMicroUsd(result.inputTokens, result.outputTokens);
      if (!await usage.settleSearch(reservation, actualMicroUsd)) {
        reservation = undefined;
        return fail(res, 503, 'visual_search_usage_unsettled', 'AI usage could not be safely reconciled. Use text search and try image search later.', req.requestId);
      }
      reservation = undefined;

      const analysis = parseVisualSearchAnalysis(result.text);
      if (!analysis) return fail(res, 502, 'visual_search_invalid_response', 'Meta AI could not describe the selected image. Try a clearer image.', req.requestId);
      const searchResults = await options.library.list(ownerId, {
        search: analysis.query, sort: 'relevance', matchMode: 'terms', limit: VISUAL_SEARCH_MAX_RESULTS,
      });
      return res.json({
        query: analysis.query,
        visualDescription: analysis.visualDescription,
        results: searchResults.items,
        searchEventId: searchResults.searchEventId,
      });
    } catch (error) {
      await recordAccountActivityEvent(database, ownerId, 'search_failed').catch(() => undefined);
      if (reservation) {
        try {
          if (providerReturned || (error instanceof MetaApiError && error.outcomeUnknown)) await usage.holdSearch(reservation);
          else await usage.releaseSearch(reservation);
        } catch { /* Keep the reservation open if usage reconciliation itself fails. */ }
      }
      if (error instanceof OwnerLifecycleError && error.code === 'account_inactive') {
        return fail(res, 403, 'account_disabled', 'This account is disabled while deletion is being reviewed.', req.requestId);
      }
      if (error instanceof AiBudgetExceededError) return fail(res, 429, 'ai_budget_exceeded', 'The shared monthly AI budget is full. Try text search or try again next month.', req.requestId);
      if (error instanceof MetaApiError && error.outcomeUnknown) return fail(res, 503, 'ai_outcome_unknown', 'Meta response status is unknown. Check your library before retrying image search.', req.requestId);
      return fail(res, 503, 'visual_search_unavailable', 'Image search could not be completed right now. Use text search or try again later.', req.requestId);
    }
  });

  return router;
}
