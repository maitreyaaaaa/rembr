import type { DatabaseHandle } from '../db/database.js';

export const AI_DISCLOSURE_VERSION = '2026-10-29-v2';

export interface AiPreference {
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
            WHERE owner_id=? AND status IN ('queued','paused')`).run(now, now, ownerId);
        }
      })();
    },
  };
}
