import type { DatabaseHandle } from '../db/database.js';
import { consentedAtAfterAccountCreation } from '../auth/consent.js';
import { AI_SEARCH_DISCLOSURE_VERSION } from '../auth/disclosures.js';

export { AI_SEARCH_DISCLOSURE_VERSION };

export function createAiSearchPreferenceRepository(database: DatabaseHandle) {
  return {
    async get(ownerId: string, providerAvailable: boolean) {
      const row = await database.prepare(`SELECT p.enabled,p.consent_version,p.consented_at,p.disabled_at,p.updated_at,u.created_at
        FROM ai_search_preferences p JOIN users u ON u.id=p.owner_id WHERE p.owner_id=?`).get(ownerId) as {
        enabled: boolean | number; consent_version: string | null; consented_at: string | null;
        disabled_at: string | null; updated_at: string; created_at: string;
      } | undefined;
      return { enabled: Boolean(row?.enabled && row.consent_version === AI_SEARCH_DISCLOSURE_VERSION && row.consented_at && row.consented_at > row.created_at), consentVersion: row?.consent_version ?? null,
        consentedAt: row?.consented_at ?? null, disabledAt: row?.disabled_at ?? null,
        updatedAt: row?.updated_at ?? null, providerAvailable };
    },
    async set(ownerId: string, enabled: boolean) {
      const now = new Date().toISOString();
      const account = await database.prepare('SELECT created_at FROM users WHERE id=?').get(ownerId) as { created_at: string } | undefined;
      const consentedAt = enabled && account ? consentedAtAfterAccountCreation(account.created_at) : null;
      await database.prepare(`INSERT INTO ai_search_preferences
        (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT (owner_id) DO UPDATE SET enabled=excluded.enabled,
          consent_version=CASE WHEN excluded.enabled THEN excluded.consent_version ELSE ai_search_preferences.consent_version END,
          consented_at=CASE WHEN excluded.enabled THEN excluded.consented_at ELSE ai_search_preferences.consented_at END,
          disabled_at=CASE WHEN excluded.enabled THEN NULL ELSE excluded.disabled_at END,
          updated_at=excluded.updated_at`)
        .run(ownerId, enabled, enabled ? AI_SEARCH_DISCLOSURE_VERSION : null, consentedAt, enabled ? null : now, now);
    },
  };
}
