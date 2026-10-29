import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { lockActiveOwner, OwnerLifecycleError, withOwnerWorkLease } from '../account/owner-lifecycle.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import { AiBudgetExceededError, createAiUsageRepository } from '../ai/usage.js';
import type { EmbeddingProvider } from './semantic-embeddings.js';
import { OpenRouterEmbeddingError } from './openrouter-embedding-provider.js';
import { createSemanticEmbeddingService } from './semantic-embeddings.js';
import { createSemanticEmbeddingRepository } from './semantic-embedding-repository.js';
import { buildSemanticDocumentText, hashSemanticDocumentText } from './semantic-source.js';
import type { createLibraryService } from './service.js';

export const SEMANTIC_DISCLOSURE_VERSION = '2026-10-30-v1';
const INDEX_BATCH_SIZE = 4;
const EMBEDDING_RESERVATION_MICROUSD = 200;
const EMBEDDING_MICROUSD_PER_TOKEN = 0.02;

type LibraryService = ReturnType<typeof createLibraryService>;
type SemanticPreference = {
  enabled: boolean;
  consentVersion: string | null;
  consentedAt: string | null;
  disabledAt: string | null;
  updatedAt: string | null;
  providerAvailable: boolean;
  indexedItems: number;
  eligibleItems: number;
};

function fail(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createSemanticSearchRouter(input: {
  database: DatabaseHandle;
  assetStorage: AssetStorage;
  library: LibraryService;
  provider?: EmbeddingProvider;
}) {
  const { database, assetStorage, library, provider } = input;
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, assetStorage);
  const repository = createSemanticEmbeddingRepository(database);
  const usage = createAiUsageRepository(database);
  const embeddingRateLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  const searchRateLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });

  const preference = async (ownerId: string): Promise<SemanticPreference> => {
    const row = await database.prepare(`SELECT enabled,disclosure_version,consented_at,disabled_at,updated_at
      FROM semantic_search_preferences WHERE owner_id=?`).get(ownerId) as {
      enabled: boolean | number; disclosure_version: string | null; consented_at: string | null;
      disabled_at: string | null; updated_at: string;
    } | undefined;
    const enabled = Boolean(row?.enabled && row.disclosure_version === SEMANTIC_DISCLOSURE_VERSION);
    const counts = await database.prepare(`SELECT
        (SELECT COUNT(DISTINCT item_id)::integer FROM semantic_item_embeddings WHERE owner_id=? AND model=?) AS indexed_items,
        (SELECT COUNT(*)::integer FROM saved_items WHERE owner_id=? AND status IN ('ready','partial')) AS eligible_items`)
      .get(ownerId, provider?.model ?? '', ownerId) as { indexed_items: number; eligible_items: number };
    return {
      enabled,
      consentVersion: row?.disclosure_version ?? null,
      consentedAt: row?.consented_at ?? null,
      disabledAt: row?.disabled_at ?? null,
      updatedAt: row?.updated_at ?? null,
      providerAvailable: Boolean(provider),
      indexedItems: Number(counts.indexed_items ?? 0),
      eligibleItems: Number(counts.eligible_items ?? 0),
    };
  };

  const serviceFor = (ownerId: string) => provider ? createSemanticEmbeddingService({ provider: {
    model: provider.model,
    dimensions: provider.dimensions,
    async embed(text, purpose) {
      const consent = await database.prepare(`SELECT enabled,disclosure_version FROM semantic_search_preferences WHERE owner_id=?`)
        .get(ownerId) as { enabled: boolean | number; disclosure_version: string | null } | undefined;
      if (!consent?.enabled || consent.disclosure_version !== SEMANTIC_DISCLOSURE_VERSION) {
        throw new Error('semantic_consent_revoked');
      }
      const reservation = await usage.reserveSearch({ ownerId, amountMicroUsd: EMBEDDING_RESERVATION_MICROUSD });
      try {
        const result = await withOwnerWorkLease(database, ownerId, 'semantic_embedding', (signal) => provider.embed(text, purpose, signal));
        const stillConsented = await database.prepare(`SELECT enabled,disclosure_version FROM semantic_search_preferences WHERE owner_id=?`)
          .get(ownerId) as { enabled: boolean | number; disclosure_version: string | null } | undefined;
        if (!stillConsented?.enabled || stillConsented.disclosure_version !== SEMANTIC_DISCLOSURE_VERSION) {
          await usage.holdSearch(reservation);
          throw new Error('semantic_consent_revoked');
        }
        if (result.inputTokens === undefined) {
          await usage.holdSearch(reservation);
          return result;
        }
        const actualMicroUsd = Math.ceil(result.inputTokens * EMBEDDING_MICROUSD_PER_TOKEN);
        if (!await usage.settleSearch(reservation, actualMicroUsd)) {
          throw new Error('semantic_embedding_usage_not_settled');
        }
        return result;
      } catch (cause) {
        if (cause instanceof OwnerLifecycleError) {
          await usage.releaseSearch(reservation).catch(() => undefined);
        } else if (cause instanceof OpenRouterEmbeddingError && !cause.outcomeUnknown) {
          await usage.releaseSearch(reservation).catch(() => undefined);
        } else {
          // The provider may have accepted and billed a timed-out or malformed request.
          await usage.holdSearch(reservation).catch(() => undefined);
        }
        throw cause;
      }
    },
  }, repository }) : null;

  router.get('/semantic/preferences', signedIn, async (req, res) => {
    return res.json({ preference: await preference(req.user!.id) });
  });

  router.put('/semantic/preferences', signedIn, async (req, res) => {
    const parsed = z.object({ enabled: z.boolean(), disclosureVersion: z.string().max(80).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_semantic_preference', 'Choose whether to enable semantic search.', req.requestId);
    if (parsed.data.enabled && parsed.data.disclosureVersion !== SEMANTIC_DISCLOSURE_VERSION) {
      return fail(res, 400, 'semantic_consent_required', 'Review and accept the current semantic-search disclosure before enabling it.', req.requestId);
    }
    const ownerId = req.user!.id;
    const now = new Date().toISOString();
    await database.transaction(async () => {
      if (!await lockActiveOwner(database, ownerId)) throw new Error('account_inactive');
      await database.prepare(`INSERT INTO semantic_search_preferences
        (owner_id,enabled,disclosure_version,consented_at,disabled_at,updated_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled,
          disclosure_version=CASE WHEN excluded.enabled THEN excluded.disclosure_version ELSE semantic_search_preferences.disclosure_version END,
          consented_at=CASE WHEN excluded.enabled THEN excluded.consented_at ELSE semantic_search_preferences.consented_at END,
          disabled_at=CASE WHEN excluded.enabled THEN NULL ELSE excluded.disabled_at END,
          updated_at=excluded.updated_at`)
        .run(ownerId, parsed.data.enabled, parsed.data.enabled ? SEMANTIC_DISCLOSURE_VERSION : null,
          parsed.data.enabled ? now : null, parsed.data.enabled ? null : now, now);
      if (!parsed.data.enabled) await database.prepare('DELETE FROM semantic_item_embeddings WHERE owner_id=?').run(ownerId);
    })();
    return res.json({ preference: await preference(ownerId) });
  });

  router.post('/semantic/index', signedIn, profile, embeddingRateLimit, async (req, res) => {
    const parsed = z.object({ afterId: z.string().max(160).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_semantic_index_cursor', 'Restart semantic indexing from the beginning.', req.requestId);
    const ownerId = req.user!.id;
    const current = await preference(ownerId);
    if (!current.enabled) return fail(res, 403, 'semantic_consent_required', 'Enable semantic search consent before indexing saved text.', req.requestId);
    const service = serviceFor(ownerId);
    if (!provider || !service) return fail(res, 503, 'semantic_provider_unavailable', 'Semantic search is not configured. Keyword search remains available.', req.requestId);
    const rows = await database.prepare(`SELECT saved_items.id AS "itemId",
        COALESCE(saved_items.title_override,saved_items.title) AS title,
        COALESCE(saved_items.description_override,saved_items.description) AS description,
        notes.body AS "noteBody", extracted_artifacts.text_content AS "extractedText"
      FROM saved_items
      LEFT JOIN notes ON notes.owner_id=saved_items.owner_id AND notes.item_id=saved_items.id
      LEFT JOIN extracted_artifacts ON extracted_artifacts.owner_id=saved_items.owner_id AND extracted_artifacts.item_id=saved_items.id
      WHERE saved_items.owner_id=? AND saved_items.status IN ('ready','partial') AND saved_items.id>?
      ORDER BY saved_items.id ASC LIMIT ?`).all(ownerId, parsed.data.afterId ?? '', INDEX_BATCH_SIZE) as Array<{
        itemId: string; title: string; description: string | null; noteBody: string | null; extractedText: string | null;
      }>;
    const documents = [];
    for (const row of rows) {
      const text = buildSemanticDocumentText(row);
      if (!text) continue;
      const contentHash = hashSemanticDocumentText(text);
      const existing = await database.prepare(`SELECT 1 FROM semantic_item_embeddings
        WHERE owner_id=? AND item_id=? AND model=? AND content_hash=?`).get(ownerId, row.itemId, provider.model, contentHash);
      if (!existing) documents.push({ itemId: row.itemId, contentHash, text });
    }
    try {
      const indexed = documents.length ? await service.indexDocuments(ownerId, documents) : 0;
      if (!(await preference(ownerId)).enabled) {
        await database.prepare('DELETE FROM semantic_item_embeddings WHERE owner_id=?').run(ownerId);
        return fail(res, 403, 'semantic_consent_required', 'Semantic-search consent was turned off. No new vectors were kept.', req.requestId);
      }
      return res.json({ indexed, scanned: rows.length, nextAfterId: rows.at(-1)?.itemId ?? null, hasMore: rows.length === INDEX_BATCH_SIZE });
    } catch (cause) {
      if (!(await preference(ownerId)).enabled) {
        await database.prepare('DELETE FROM semantic_item_embeddings WHERE owner_id=?').run(ownerId);
        return fail(res, 403, 'semantic_consent_required', 'Semantic-search consent was turned off. No new vectors were kept.', req.requestId);
      }
      if (cause instanceof OwnerLifecycleError && cause.code === 'account_inactive') {
        return fail(res, 403, 'account_disabled', 'This account is disabled while deletion is being reviewed.', req.requestId);
      }
      if (cause instanceof AiBudgetExceededError) return fail(res, 429, 'ai_budget_exceeded', 'The shared monthly AI budget is full. Semantic indexing paused; keyword search remains available.', req.requestId);
      console.warn('semantic_index_failed', { requestId: req.requestId, errorType: cause instanceof Error ? cause.name : 'unknown' });
      return fail(res, 502, 'semantic_index_unavailable', 'Semantic indexing could not be completed. Your saved items remain available through keyword search.', req.requestId);
    }
  });

  router.get('/semantic/search', signedIn, profile, searchRateLimit, async (req, res) => {
    const parsed = z.object({
      q: z.string().trim().min(1).max(120),
      type: z.enum(['page','note']).optional(),
      status: z.enum(['queued','processing','retry_wait','cancel_requested','cancelled','paused','partial','ready','failed']).optional(),
      tagId: z.string().optional(), collectionId: z.string().optional(),
    }).safeParse(req.query);
    if (!parsed.success) return fail(res, 400, 'invalid_semantic_query', 'Enter a valid search query.', req.requestId);
    const ownerId = req.user!.id;
    const lexicalQuery = { search: parsed.data.q, type: parsed.data.type, status: parsed.data.status,
      tagId: parsed.data.tagId, collectionId: parsed.data.collectionId, sort: 'relevance' as const, matchMode: 'terms' as const, limit: 25 };
    const fallback = async (reason: string) => ({ ...(await library.list(ownerId, lexicalQuery)), mode: 'keyword_fallback', fallbackReason: reason });
    const current = await preference(ownerId);
    if (!current.enabled) return res.json(await fallback('consent_required'));
    const service = serviceFor(ownerId);
    if (!provider || !service) return res.json(await fallback('provider_unavailable'));
    if (current.indexedItems === 0) return res.json(await fallback('index_empty'));
    try {
      const [semantic, lexical] = await Promise.all([
        service.search(ownerId, parsed.data.q, { limit: 50, minimumSimilarity: 0.2 }),
        library.list(ownerId, lexicalQuery),
      ]);
      const rankedIds = new Map<string, number>();
      semantic.forEach((result, index) => rankedIds.set(result.itemId, (rankedIds.get(result.itemId) ?? 0) + 1.1 / (60 + index + 1)));
      lexical.items.forEach((item, index) => rankedIds.set(item.id, (rankedIds.get(item.id) ?? 0) + 1 / (60 + index + 1)));
      const ranked = [...rankedIds].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
      const candidates = await library.getMany(ownerId, ranked);
      const filtered = candidates.filter((item) =>
        (!parsed.data.type || item.kind === parsed.data.type)
        && (!parsed.data.status || item.status === parsed.data.status)
        && (!parsed.data.tagId || (item.tags as Array<{ id: string }>).some((tag) => tag.id === parsed.data.tagId))
        && (!parsed.data.collectionId || (item.collections as Array<{ id: string }>).some((collection) => collection.id === parsed.data.collectionId)));
      const items = filtered.slice(0, 25);
      const searchEventId = await recordSearchEvent(database, ownerId, parsed.data.q, items.map((item) => item.id));
      return res.json({ items, nextCursor: null, hasMore: false, searchEventId, mode: 'semantic_hybrid', fallbackReason: items.length ? null : 'no_matching_results' });
    } catch (cause) {
      if (cause instanceof OwnerLifecycleError && cause.code === 'account_inactive') {
        return fail(res, 403, 'account_disabled', 'This account is disabled while deletion is being reviewed.', req.requestId);
      }
      if (cause instanceof AiBudgetExceededError) return res.json(await fallback('budget_exhausted'));
      console.warn('semantic_search_failed', { requestId: req.requestId, errorType: cause instanceof Error ? cause.name : 'unknown' });
      return res.json(await fallback('provider_error'));
    }
  });

  return router;
}

async function recordSearchEvent(database: DatabaseHandle, ownerId: string, query: string, itemIds: string[]): Promise<string | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    await database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new Error('account_inactive');
      const retentionCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      await database.prepare('DELETE FROM search_events WHERE owner_id=? AND created_at<?').run(ownerId, retentionCutoff);
      await database.prepare(`INSERT INTO search_events (id,owner_id,query_hash,query_length,filters_json,result_count,created_at)
        VALUES (?,?,?,?,?,?,?)`).run(id, ownerId, createHash('sha256').update(query.trim().toLowerCase()).digest('hex'),
        query.trim().length, JSON.stringify({ mode: 'semantic_hybrid' }), itemIds.length, now);
      for (const [index, itemId] of itemIds.entries()) {
        await database.prepare(`INSERT INTO search_event_results (owner_id,event_id,item_id,result_rank,created_at)
          VALUES (?,?,?,?,?)`).run(ownerId, id, itemId, index + 1, now);
      }
    })();
    return id;
  } catch (cause) {
    console.warn('semantic_search_event_store_failed', { errorType: cause instanceof Error ? cause.name : 'unknown' });
    return null;
  }
}
