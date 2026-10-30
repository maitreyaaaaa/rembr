import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from '../src/db/database.js';
import { createAiPreferenceRepository } from '../src/ai/preferences.js';
import { createAiSearchPreferenceRepository } from '../src/knowledge/ai-search-preferences.js';
import { createSavedItemSummaryRepository } from '../src/knowledge/summaries.js';
import { createLibraryCheckupRepository } from '../src/knowledge/checkup.js';
import { createLibraryLinkHealthRepository } from '../src/knowledge/link-health.js';
import { createSemanticEmbeddingRepository } from '../src/library/semantic-embedding-repository.js';
import { createSmartCollectionService } from '../src/smart-collections/service.js';

test('knowledge and preference writes reject an owner frozen after request authentication', async () => {
  const database = await createTestDatabase();
  const now = new Date('2026-10-30T10:00:00.000Z').toISOString();
  try {
    await database.prepare(`INSERT INTO users (id,email,password_hash,created_at)
      VALUES ('frozen-knowledge-owner','frozen-knowledge@example.test','x',?)`).run(now);
    await database.prepare(`INSERT INTO saved_items
      (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
      VALUES ('frozen-knowledge-item','frozen-knowledge-owner','https://example.com/frozen','https://example.com/frozen','Frozen','ready',?,?)`)
      .run(now, now);
    await database.prepare("UPDATE users SET account_status='disabled' WHERE id='frozen-knowledge-owner'").run();

    await assert.rejects(createAiPreferenceRepository(database).set('frozen-knowledge-owner', true), /account_inactive/);
    await assert.rejects(createAiSearchPreferenceRepository(database).set('frozen-knowledge-owner', true), /account_inactive/);
    await assert.rejects(createSavedItemSummaryRepository(database).save({
      ownerId: 'frozen-knowledge-owner', itemId: 'frozen-knowledge-item', model: 'test',
      context: { title: 'Frozen', description: '', sourceText: 'Source text' }, summary: 'Summary',
      inputTokens: 1, outputTokens: 1, billedMicroUsd: 1,
    }), /account_inactive/);
    await assert.rejects(createLibraryCheckupRepository(database).createReminder(
      'frozen-knowledge-owner', 'frozen-knowledge-item', 'week', '', new Date(now),
    ), /account_inactive/);
    await assert.rejects(createLibraryCheckupRepository(database).updateReminder(
      'frozen-knowledge-owner', 'missing-reminder', 'done', new Date(now),
    ), /account_inactive/);
    await assert.rejects(createLibraryLinkHealthRepository(database, async (url) => ({
      status: 'ok', sourceUrl: url, finalUrl: url, httpStatus: 200, errorCode: 'none', errorMessage: '', checkedAt: now,
    })).check('frozen-knowledge-owner', 1, new Date(now)), /account_inactive/);
    await assert.rejects(createSmartCollectionService(database).list('frozen-knowledge-owner'), /account_inactive/);
    await assert.rejects(createSmartCollectionService(database).update('frozen-knowledge-owner', 'missing-collection', { hidden: true }), /account_inactive/);
    await assert.rejects(createSmartCollectionService(database).setItemOverride(
      'frozen-knowledge-owner', 'missing-collection', 'frozen-knowledge-item', 'include',
    ), /account_inactive/);
    await assert.rejects(createSemanticEmbeddingRepository(database).upsertOwnerEmbedding({
      ownerId: 'frozen-knowledge-owner', itemId: 'frozen-knowledge-item', contentHash: 'a'.repeat(64),
      model: 'test', vector: Array(1_536).fill(0),
    }), /account_inactive/);

    for (const table of [
      'ai_analysis_preferences', 'ai_search_preferences', 'ai_saved_item_summaries', 'library_reminders',
      'link_health_checks', 'smart_collections', 'semantic_item_embeddings', 'visual_item_embeddings', 'visual_embedding_jobs',
    ]) {
      const count = await database.prepare(`SELECT count(*) AS count FROM ${table} WHERE owner_id=?`)
        .get('frozen-knowledge-owner') as { count: number };
      assert.equal(Number(count.count), 0, `${table} must not accept writes after freeze`);
    }
  } finally {
    await database.close();
  }
});
