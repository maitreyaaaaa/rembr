import type { DatabaseHandle } from '../db/database.js';
import { AI_DISCLOSURE_VERSION, AI_SEARCH_DISCLOSURE_VERSION, SEMANTIC_DISCLOSURE_VERSION, VISUAL_SEARCH_DISCLOSURE_VERSION } from './disclosures.js';
import { consentedAtAfterAccountCreation } from './consent.js';
import { TERMS_VERSION } from './terms.js';

export async function recordTermsAcceptance(database: DatabaseHandle, userId: string, createdAt: string, now = new Date()) {
  const acceptedAt = now.toISOString();
  const consentedAt = consentedAtAfterAccountCreation(createdAt, now);
  await database.prepare('UPDATE users SET terms_version=?,terms_accepted_at=? WHERE id=?')
    .run(TERMS_VERSION, acceptedAt, userId);
  await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at)
    VALUES (?,TRUE,?,?,NULL,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=TRUE,consent_version=excluded.consent_version,
      consented_at=excluded.consented_at,disabled_at=NULL,updated_at=excluded.updated_at`)
    .run(userId, AI_DISCLOSURE_VERSION, consentedAt, acceptedAt);
  await database.prepare(`INSERT INTO ai_search_preferences (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at)
    VALUES (?,TRUE,?,?,NULL,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=TRUE,consent_version=excluded.consent_version,
      consented_at=excluded.consented_at,disabled_at=NULL,updated_at=excluded.updated_at`)
    .run(userId, AI_SEARCH_DISCLOSURE_VERSION, consentedAt, acceptedAt);
  await database.prepare(`INSERT INTO ai_visual_search_preferences (owner_id,enabled,consent_version,consented_at,disabled_at,updated_at)
    VALUES (?,TRUE,?,?,NULL,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=TRUE,consent_version=excluded.consent_version,
      consented_at=excluded.consented_at,disabled_at=NULL,updated_at=excluded.updated_at`)
    .run(userId, VISUAL_SEARCH_DISCLOSURE_VERSION, consentedAt, acceptedAt);
  await database.prepare(`INSERT INTO semantic_search_preferences (owner_id,enabled,disclosure_version,consented_at,disabled_at,updated_at)
    VALUES (?,TRUE,?,?,NULL,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=TRUE,disclosure_version=excluded.disclosure_version,
      consented_at=excluded.consented_at,disabled_at=NULL,updated_at=excluded.updated_at`)
    .run(userId, SEMANTIC_DISCLOSURE_VERSION, consentedAt, acceptedAt);
}

