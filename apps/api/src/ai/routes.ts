import express from 'express';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { AI_DISCLOSURE_VERSION, createAiPreferenceRepository } from './preferences.js';

const updateSchema = z.object({ enabled: z.boolean(), disclosureVersion: z.string().optional() }).strict();

function fail(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createAiRouter(database: DatabaseHandle) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const preferences = createAiPreferenceRepository(database);
  const providerAvailable = async () => {
    const row = await database.prepare('SELECT meta_api_configured,last_heartbeat_at FROM ai_worker_status WHERE singleton=TRUE')
      .get() as { meta_api_configured: boolean | number; last_heartbeat_at: string } | undefined;
    const heartbeat = Date.parse(row?.last_heartbeat_at ?? '');
    return Boolean(row && row.meta_api_configured && Number.isFinite(heartbeat) && Date.now() - heartbeat <= 90_000);
  };

  router.get('/ai/preferences', signedIn, async (req, res) => {
    res.json({ preference: await preferences.get(req.user!.id, await providerAvailable()) });
  });

  router.put('/ai/preferences', signedIn, async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_ai_preference', 'Choose whether to enable Instagram media analysis.', req.requestId);
    if (parsed.data.enabled && parsed.data.disclosureVersion !== AI_DISCLOSURE_VERSION) {
      return fail(res, 400, 'ai_consent_required', 'Review and accept the current media-analysis disclosure before enabling it.', req.requestId);
    }
    await preferences.set(req.user!.id, parsed.data.enabled);
    return res.json({ preference: await preferences.get(req.user!.id, await providerAvailable()) });
  });

  router.get('/ai/items/:id', signedIn, async (req, res) => {
    const itemId = Array.isArray(req.params.id) ? req.params.id[0] ?? '' : req.params.id ?? '';
    const item = await database.prepare('SELECT id,source_platform FROM saved_items WHERE owner_id=? AND id=?')
      .get(req.user!.id, itemId) as { id: string; source_platform: string | null } | undefined;
    if (!item) return fail(res, 404, 'not_found', 'Saved item not found.', req.requestId);
    const job = await database.prepare(`SELECT status,pause_reason,error_code,updated_at
      FROM ai_analysis_jobs WHERE owner_id=? AND item_id=? ORDER BY generation DESC LIMIT 1`)
      .get(req.user!.id, itemId) as { status: string; pause_reason: string | null; error_code: string | null; updated_at: string } | undefined;
    const result = await database.prepare(`SELECT status,model,summary,visual_description,ocr_text,transcript,
        keywords_json,tags_json,image_count,image_bytes,video_count,max_video_bytes AS video_bytes,created_at
      FROM ai_analysis_results WHERE owner_id=? AND item_id=? ORDER BY generation DESC LIMIT 1`)
      .get(req.user!.id, itemId) as Record<string, unknown> | undefined;
    return res.json({
      status: job?.status ?? 'not_requested', pauseReason: job?.pause_reason ?? null,
      errorCode: job?.error_code ?? null, updatedAt: job?.updated_at ?? null,
      result: result ? {
        status: result.status, model: result.model, summary: result.summary,
        visualDescription: result.visual_description, ocrText: result.ocr_text, transcript: result.transcript,
        keywords: safeJsonArray(result.keywords_json), tags: safeJsonArray(result.tags_json),
        imageCount: result.image_count, imageBytes: result.image_bytes,
        videoCount: result.video_count, videoBytes: result.video_bytes, createdAt: result.created_at,
      } : null,
    });
  });

  return router;
}

function safeJsonArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch { return []; }
}
