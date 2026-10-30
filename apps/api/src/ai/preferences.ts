import type { DatabaseHandle } from '../db/database.js';
import { lockActiveOwner } from '../account/owner-lifecycle.js';

export const AI_DISCLOSURE_VERSION = '2026-10-29-v2';
export const LOCAL_OCR_DISCLOSURE_VERSION = '2026-10-30-v1';

export interface AiPreference {
  enabled: boolean;
  consentVersion: string | null;
  consentedAt: string | null;
  disabledAt: string | null;
  updatedAt: string | null;
  providerAvailable: boolean;
}

export interface LocalOcrPreference {
  enabled: boolean;
  consentVersion: string | null;
  consentedAt: string | null;
  disabledAt: string | null;
  updatedAt: string | null;
  providerAvailable: boolean;
}

export function createAiPreferenceRepository(database: DatabaseHandle) {
  return {
    async get(ownerId: string, providerAvailable: boolean): Promise<AiPreference> {
      const row = await database.prepare(`SELECT enabled,consent_version,consented_at,disabled_at,updated_at
        FROM ai_analysis_preferences WHERE owner_id=?`).get(ownerId) as {
        enabled: boolean | number; consent_version: string | null; consented_at: string | null;
        disabled_at: string | null; updated_at: string;
      } | undefined;
      return {
        enabled: Boolean(row?.enabled && row.consent_version === AI_DISCLOSURE_VERSION), consentVersion: row?.consent_version ?? null,
        consentedAt: row?.consented_at ?? null, disabledAt: row?.disabled_at ?? null,
        updatedAt: row?.updated_at ?? null, providerAvailable,
      };
    },

    async set(ownerId: string, enabled: boolean): Promise<void> {
      const now = new Date().toISOString();
      await database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new Error('account_inactive');
        await database.prepare(`INSERT INTO ai_analysis_preferences
          (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT (owner_id) DO UPDATE SET enabled=excluded.enabled,
            consent_version=CASE WHEN excluded.enabled THEN excluded.consent_version ELSE ai_analysis_preferences.consent_version END,
            consented_at=CASE WHEN excluded.enabled THEN excluded.consented_at ELSE ai_analysis_preferences.consented_at END,
            disabled_at=CASE WHEN excluded.enabled THEN NULL ELSE excluded.disabled_at END,
            updated_at=excluded.updated_at`)
          .run(ownerId, enabled, enabled ? AI_DISCLOSURE_VERSION : null, enabled ? now : null, enabled ? null : now, now);
        if (!enabled) {
          await database.prepare(`UPDATE ai_analysis_jobs SET status='cancelled',pause_reason='consent_disabled',
            error_code='consent_disabled',updated_at=?,completed_at=?
            WHERE owner_id=? AND status IN ('queued','paused') AND NOT EXISTS (
              SELECT 1 FROM ai_analysis_preferences p WHERE p.owner_id=ai_analysis_jobs.owner_id AND p.local_ocr_enabled=TRUE
                AND p.local_ocr_consent_version=?)`).run(now, now, ownerId, LOCAL_OCR_DISCLOSURE_VERSION);
        }
      })();
    },

    async getLocalOcr(ownerId: string, providerAvailable: boolean): Promise<LocalOcrPreference> {
      const row = await database.prepare(`SELECT local_ocr_enabled,local_ocr_consent_version,local_ocr_consented_at,
          local_ocr_disabled_at,updated_at FROM ai_analysis_preferences WHERE owner_id=?`).get(ownerId) as {
        local_ocr_enabled: boolean | number; local_ocr_consent_version: string | null;
        local_ocr_consented_at: string | null; local_ocr_disabled_at: string | null; updated_at: string;
      } | undefined;
      return {
        enabled: Boolean(row?.local_ocr_enabled && row.local_ocr_consent_version === LOCAL_OCR_DISCLOSURE_VERSION),
        consentVersion: row?.local_ocr_consent_version ?? null, consentedAt: row?.local_ocr_consented_at ?? null,
        disabledAt: row?.local_ocr_disabled_at ?? null, updatedAt: row?.updated_at ?? null, providerAvailable,
      };
    },

    async setLocalOcr(ownerId: string, enabled: boolean): Promise<void> {
      const now = new Date().toISOString();
      await database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new Error('account_inactive');
        await database.prepare(`INSERT INTO ai_analysis_preferences
          (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at,
           local_ocr_enabled,local_ocr_consent_version,local_ocr_consented_at,local_ocr_disabled_at)
          VALUES (?,FALSE,NULL,NULL,NULL,?,?,?,?,?)
          ON CONFLICT (owner_id) DO UPDATE SET local_ocr_enabled=excluded.local_ocr_enabled,
            local_ocr_consent_version=CASE WHEN excluded.local_ocr_enabled THEN excluded.local_ocr_consent_version ELSE ai_analysis_preferences.local_ocr_consent_version END,
            local_ocr_consented_at=CASE WHEN excluded.local_ocr_enabled THEN excluded.local_ocr_consented_at ELSE ai_analysis_preferences.local_ocr_consented_at END,
            local_ocr_disabled_at=CASE WHEN excluded.local_ocr_enabled THEN NULL ELSE excluded.local_ocr_disabled_at END,
            updated_at=excluded.updated_at`)
          .run(ownerId, now, enabled, enabled ? LOCAL_OCR_DISCLOSURE_VERSION : null, enabled ? now : null, enabled ? null : now);
        if (!enabled) {
          await database.prepare(`UPDATE ai_analysis_jobs SET status='cancelled',pause_reason='consent_disabled',
            error_code='consent_disabled',updated_at=?,completed_at=?
            WHERE owner_id=? AND status IN ('queued','paused') AND NOT EXISTS (
              SELECT 1 FROM ai_analysis_preferences p WHERE p.owner_id=ai_analysis_jobs.owner_id AND p.enabled=TRUE
                AND p.consent_version=?)`).run(now, now, ownerId, AI_DISCLOSURE_VERSION);
        }
      })();
    },
  };
}
