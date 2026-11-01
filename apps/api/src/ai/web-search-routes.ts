import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import type { DatabaseHandle } from '../db/database.js';
import { AiBudgetExceededError, createAiUsageRepository } from './usage.js';
import { OpenRouterWebSearchError, WEB_SEARCH_RESERVATION_MICROUSD, type OpenRouterWebSearchModel } from './openrouter-web-search.js';

const querySchema = z.object({ query: z.string().trim().min(2).max(120) }).strict();

function fail(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createWebSearchRouter(database: DatabaseHandle, assetStorage: AssetStorage, model?: OpenRouterWebSearchModel) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, assetStorage);
  const usage = createAiUsageRepository(database);
  const searchLimit = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });

  router.post('/web-search', signedIn, profile, searchLimit, async (req, res) => {
    const parsed = querySchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_web_search_query', 'Enter a search query between 2 and 120 characters.', req.requestId);
    if (!model) return fail(res, 503, 'web_search_unavailable', 'Live web search is not configured right now. Saved search is still available.', req.requestId);

    let reservation: Awaited<ReturnType<typeof usage.reserveSearch>> | undefined;
    let providerReturned = false;
    try {
      reservation = await usage.reserveSearch({ ownerId: req.user!.id, amountMicroUsd: WEB_SEARCH_RESERVATION_MICROUSD });
      const result = await model.search(parsed.data.query);
      providerReturned = true;
      if (!await usage.settleSearch(reservation, result.actualCostMicroUsd)) {
        reservation = undefined;
        return fail(res, 503, 'web_search_usage_unsettled', 'Search usage could not be reconciled safely. Try again later.', req.requestId);
      }
      reservation = undefined;
      return res.json({ summary: result.summary, citations: result.citations });
    } catch (cause) {
      if (reservation) {
        try {
          if (providerReturned || (cause instanceof OpenRouterWebSearchError && cause.outcomeUnknown)) await usage.holdSearch(reservation);
          else await usage.releaseSearch(reservation);
        } catch { /* Keep the reservation if reconciliation is unavailable. */ }
      }
      if (cause instanceof AiBudgetExceededError) return fail(res, 429, 'ai_budget_exceeded', 'The shared monthly AI budget is full. Saved search is still available.', req.requestId);
      if (cause instanceof OpenRouterWebSearchError && !cause.outcomeUnknown) return fail(res, 503, 'web_search_unavailable', cause.message, req.requestId);
      return fail(res, 503, 'web_search_failed', 'Live web search could not be completed. Saved search is still available.', req.requestId);
    }
  });

  return router;
}
