import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTestDatabase } from '../src/db/database.js';
import { AiBudgetExceededError, createAiUsageRepository, MONTHLY_AI_CAP_MICROUSD, sparkCostMicroUsd, utcMonthStart, voiceCostMicroUsd } from '../src/ai/usage.js';
import { AI_DISCLOSURE_VERSION, LOCAL_OCR_DISCLOSURE_VERSION, createAiPreferenceRepository } from '../src/ai/preferences.js';
import { MetaApiError } from '../src/ai/meta-client.js';
import { processNextAiJob, resolveAiMediaWithOwnerLease, type AiJob, type AiMediaLeaseRunner, type AiModelClient } from '../src/ai/worker.js';

async function seedImport(database: Awaited<ReturnType<typeof createTestDatabase>>, importId: string, jobId: string, now: string) {
  await database.prepare(`INSERT INTO users (id,email,password_hash,created_at) VALUES ('budget-user','budget@example.test','x',?) ON CONFLICT(id) DO NOTHING`).run(now);
  await database.prepare(`INSERT INTO imports (id,owner_id,request_id,source,status,created_at,updated_at)
    VALUES (?,'budget-user',?,'instagram','queued',?,?)`).run(importId, importId, now, now);
  await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
    VALUES (?,'budget-user',?,?, 'example','queued',?,?)`).run(`item-${importId}`, `https://instagram.com/p/${importId}/`, `https://instagram.com/p/${importId}/`, now, now);
  await database.prepare(`INSERT INTO ai_analysis_jobs (id,owner_id,import_id,item_id,status,available_at,created_at,updated_at)
    VALUES (?,'budget-user',?,?,'queued',?,?,?)`).run(jobId, importId, `item-${importId}`, now, now, now);
}

test('AI media temp files are cleaned when an owner lease is lost just after resolution', async () => {
  const database = await createTestDatabase();
  let cleanupCalls = 0;
  const job: AiJob = {
    id: 'lease-loss-job', owner_id: 'owner', import_id: 'lease-loss-import', item_id: 'lease-loss-item', generation: 1,
    attempts: 1, original_url: 'https://www.instagram.com/p/example/', title: null, description: null, text_content: null, lease_token: 'token',
  };
  const loseLease: AiMediaLeaseRunner = async (_database, _ownerId, operation) => {
    await operation(new AbortController().signal);
    throw new Error('work_lease_lost');
  };
  try {
    await assert.rejects(resolveAiMediaWithOwnerLease(database, 'owner', job, async () => ({
      files: [], cleanup: async () => { cleanupCalls += 1; },
    }), loseLease), /work_lease_lost/);
    assert.equal(cleanupCalls, 1);
  } finally { await database.close(); }
});

test('AI usage prices Spark tokens and Voice seconds in integer microdollars', () => {
  assert.equal(sparkCostMicroUsd(100, 10), 168);
  assert.equal(voiceCostMicroUsd(3600), 180_000);
  assert.equal(utcMonthStart(new Date('2026-12-31T23:59:59.000Z')), '2026-12-01');
});

test('older media-analysis consent does not authorize entity extraction or queued jobs', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'old-consent-import', 'old-consent-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,updated_at)
      VALUES ('budget-user',TRUE,'2026-10-29-v1',?,?)`).run(now.toISOString(), now.toISOString());
    const preference = await createAiPreferenceRepository(database).get('budget-user', true);
    assert.equal(preference.enabled, false);
    const unusedClient = new Proxy({}, { get() { throw new Error('stale_consent_must_not_call_provider'); } }) as never;
    assert.equal(await processNextAiJob(database, unusedClient, async () => ({ files: [], cleanup: async () => undefined }), true, now), null);
    const job = await database.prepare("SELECT status FROM ai_analysis_jobs WHERE id='old-consent-job'").get() as { status: string };
    assert.equal(job.status, 'queued');
    await createAiPreferenceRepository(database).set('budget-user', true);
    const refreshed = await createAiPreferenceRepository(database).get('budget-user', true);
    assert.equal(refreshed.enabled, true);
    assert.equal(refreshed.consentVersion, AI_DISCLOSURE_VERSION);
  } finally { await database.close(); }
});

test('AI worker and usage reservations skip a disabled owner', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'disabled-ai-import', 'disabled-ai-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,updated_at)
      VALUES ('budget-user',TRUE,?,?,?)`).run(AI_DISCLOSURE_VERSION, now.toISOString(), now.toISOString());
    await database.prepare("UPDATE users SET account_status='disabled' WHERE id='budget-user'").run();
    const unusedClient = new Proxy({}, { get() { throw new Error('provider_must_not_be_called'); } }) as never;
    assert.equal(await processNextAiJob(database, unusedClient, async () => { throw new Error('resolver_must_not_be_called'); }, true, now), null);
    const status = await database.prepare("SELECT status FROM ai_analysis_jobs WHERE id='disabled-ai-job'").get() as { status: string };
    assert.equal(status.status, 'queued');
    const usage = createAiUsageRepository(database);
    await assert.rejects(usage.reserveSearch({ ownerId: 'budget-user', amountMicroUsd: 100, now }), /account_inactive/);
    await assert.rejects(usage.reserve({ ownerId: 'budget-user', importId: 'disabled-ai-import', jobId: 'disabled-ai-job', attemptNumber: 1, amountMicroUsd: 100, now }), /account_inactive/);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM ai_usage_reservations').get() as { count: number }).count, 0);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM ai_search_usage_reservations').get() as { count: number }).count, 0);
  } finally { await database.close(); }
});

test('an expired processing lease with an open reservation is paused for uncertain usage instead of retried', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'crash-import', 'crash-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,updated_at)
      VALUES ('budget-user',TRUE,?,?,?)`).run(AI_DISCLOSURE_VERSION, now.toISOString(), now.toISOString());
    await database.prepare(`UPDATE ai_analysis_jobs SET status='processing',attempts=1,lease_token='expired-token',lease_expires_at=? WHERE id='crash-job'`)
      .run('2026-10-29T09:00:00.000Z');
    const usage = createAiUsageRepository(database);
    const reservation = await usage.reserve({ ownerId: 'budget-user', importId: 'crash-import', jobId: 'crash-job', attemptNumber: 101, amountMicroUsd: 500_000, now });
    const unusedClient = new Proxy({}, { get() { throw new Error('provider_must_not_be_called'); } }) as never;
    assert.equal(await processNextAiJob(database, unusedClient, async () => ({ files: [], cleanup: async () => undefined }), true,
      new Date('2026-10-29T10:00:01.000Z')), null);
    const job = await database.prepare("SELECT status,pause_reason FROM ai_analysis_jobs WHERE id='crash-job'").get() as { status: string; pause_reason: string };
    const held = await database.prepare('SELECT status FROM ai_usage_reservations WHERE id=?').get(reservation.id) as { status: string };
    assert.deepEqual(job, { status: 'paused', pause_reason: 'uncertain_usage' });
    assert.equal(held.status, 'held');
  } finally { await database.close(); }
});

test('reservations atomically protect the import cap and settle actual spend', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'budget-import', 'budget-job', now.toISOString());
    const usage = createAiUsageRepository(database);
    const first = await usage.reserve({ ownerId: 'budget-user', importId: 'budget-import', jobId: 'budget-job', attemptNumber: 1, amountMicroUsd: 12_000_000, now });
    const second = await usage.reserve({ ownerId: 'budget-user', importId: 'budget-import', jobId: 'budget-job', attemptNumber: 2, amountMicroUsd: 8_000_000, now });
    await assert.rejects(usage.reserve({ ownerId: 'budget-user', importId: 'budget-import', jobId: 'budget-job', attemptNumber: 3, amountMicroUsd: 1, now }),
      (error: unknown) => error instanceof AiBudgetExceededError && error.scope === 'import_budget');
    assert.equal(await usage.settle(first, 100_000, now.toISOString()), true);
    assert.equal(await usage.release(second, now.toISOString()), true);
    const totals = await database.prepare(`SELECT spent_microusd,reserved_microusd FROM ai_import_usage WHERE owner_id='budget-user' AND import_id='budget-import'`).get() as { spent_microusd: string; reserved_microusd: string };
    assert.equal(Number(totals.spent_microusd), 100_000);
    assert.equal(Number(totals.reserved_microusd), 0);
    const reservations = await database.prepare(`SELECT status FROM ai_usage_reservations ORDER BY reserved_microusd`).all() as Array<{ status: string }>;
    assert.deepEqual(reservations.map((row) => row.status).sort(), ['released', 'settled']);
  } finally { await database.close(); }
});

test('grounded-answer reservations share the monthly AI cap and retain uncertain or over-budget usage', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'search-budget-import', 'search-budget-job', now.toISOString());
    const usage = createAiUsageRepository(database);
    const searchReservation = await usage.reserveSearch({ ownerId: 'budget-user', amountMicroUsd: MONTHLY_AI_CAP_MICROUSD - 100, now });
    await assert.rejects(usage.reserve({ ownerId: 'budget-user', importId: 'search-budget-import', jobId: 'search-budget-job', attemptNumber: 1, amountMicroUsd: 101, now }),
      (error: unknown) => error instanceof AiBudgetExceededError && error.scope === 'monthly_budget');
    assert.equal(await usage.settleSearch(searchReservation, 1_000, now.toISOString()), true);
    const overage = await usage.reserveSearch({ ownerId: 'budget-user', amountMicroUsd: 5_000, now });
    assert.equal(await usage.settleSearch(overage, 6_000, now.toISOString()), false);
    const month = await database.prepare(`SELECT spent_microusd,reserved_microusd FROM ai_monthly_usage WHERE month_start=?`).get(utcMonthStart(now)) as { spent_microusd: string; reserved_microusd: string };
    assert.equal(Number(month.spent_microusd), 1_000);
    assert.equal(Number(month.reserved_microusd), 5_000);
    const ledger = await database.prepare('SELECT status FROM ai_search_usage_reservations ORDER BY created_at,id').all() as Array<{ status: string }>;
    assert.deepEqual(ledger.map((row) => row.status).sort(), ['held', 'settled']);
  } finally { await database.close(); }
});

test('a failed shared-month reservation rolls back the import hold; uncertain holds remain reserved', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    for (const letter of ['a', 'b', 'c', 'd', 'e', 'f']) await seedImport(database, `budget-import-${letter}`, `budget-job-${letter}`, now.toISOString());
    const usage = createAiUsageRepository(database);
    const held = await usage.reserve({ ownerId: 'budget-user', importId: 'budget-import-a', jobId: 'budget-job-a', attemptNumber: 1, amountMicroUsd: 20_000_000, now });
    for (const letter of ['b', 'c', 'd', 'e']) {
      await usage.reserve({ ownerId: 'budget-user', importId: `budget-import-${letter}`, jobId: `budget-job-${letter}`, attemptNumber: 1, amountMicroUsd: 20_000_000, now });
    }
    await assert.rejects(usage.reserve({ ownerId: 'budget-user', importId: 'budget-import-f', jobId: 'budget-job-f', attemptNumber: 1, amountMicroUsd: 1, now }),
      (error: unknown) => error instanceof AiBudgetExceededError && error.scope === 'monthly_budget');
    await usage.hold(held);
    const importF = await database.prepare(`SELECT reserved_microusd FROM ai_import_usage WHERE import_id='budget-import-f'`).get() as { reserved_microusd: string } | undefined;
    assert.equal(Number(importF?.reserved_microusd ?? 0), 0);
    const month = await database.prepare(`SELECT reserved_microusd FROM ai_monthly_usage WHERE month_start=?`).get(utcMonthStart(now)) as { reserved_microusd: string };
    assert.equal(Number(month.reserved_microusd), 100_000_000);
    const state = await database.prepare(`SELECT status FROM ai_usage_reservations WHERE id=?`).get(held.id) as { status: string };
    assert.equal(state.status, 'held');
  } finally { await database.close(); }
});

test('AI worker writes a partial result when public media is unavailable and always runs temp cleanup', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'partial-import', 'partial-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,updated_at)
      VALUES ('budget-user',TRUE,?,'2026-10-29T00:00:00.000Z',?)`).run(AI_DISCLOSURE_VERSION, now.toISOString());
    await database.prepare(`UPDATE ai_analysis_jobs SET status='paused',pause_reason='provider_unavailable' WHERE id='partial-job'`).run();
    let cleaned = false;
    const unusedClient = new Proxy({}, { get: () => async () => { throw new Error('provider must not be called'); } }) as AiModelClient;
    assert.equal(await processNextAiJob(database, unusedClient, async () => ({ files: [], cleanup: async () => { cleaned = true; } }), false, now), null);
    const jobId = await processNextAiJob(database, unusedClient, async () => ({ files: [], cleanup: async () => { cleaned = true; } }), true, now);
    assert.equal(jobId, 'partial-job');
    assert.equal(cleaned, true);
    const job = await database.prepare(`SELECT status FROM ai_analysis_jobs WHERE id='partial-job'`).get() as { status: string };
    assert.equal(job.status, 'partial');
    const result = await database.prepare(`SELECT status,model,summary FROM ai_analysis_results WHERE item_id='item-partial-import'`).get() as { status: string; model: string; summary: string };
    assert.deepEqual(result, { status: 'partial', model: 'none', summary: '' });
  } finally { await database.close(); }
});

test('local OCR runs with its own consent when Meta is unavailable and records no paid usage', async () => {
  const database = await createTestDatabase();
  const root = await mkdtemp(join(tmpdir(), 'rembr-local-ocr-'));
  try {
    const now = new Date('2026-10-30T10:00:00.000Z');
    await seedImport(database, 'local-ocr-import', 'local-ocr-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences
      (owner_id,enabled,consent_version,consented_at,updated_at,local_ocr_enabled,local_ocr_consent_version,local_ocr_consented_at)
      VALUES ('budget-user',FALSE,NULL,NULL,?,TRUE,?,?)`).run(now.toISOString(), LOCAL_OCR_DISCLOSURE_VERSION, now.toISOString());
    const path = join(root, 'photo with spaces.jpg');
    await writeFile(path, Buffer.from([0xff, 0xd8, 0xff]));
    const unusedMetaClient = new Proxy({}, { get: () => async () => { throw new Error('Meta must not be called'); } }) as AiModelClient;
    let cleaned = false; let localCalls = 0;
    const jobId = await processNextAiJob(database, unusedMetaClient,
      async () => ({ files: [{ path, mime: 'image/jpeg', byteSize: 3, kind: 'image' }], cleanup: async () => { cleaned = true; await rm(path, { force: true }); } }),
      false, now, async (image, signal) => {
        localCalls += 1;
        assert.equal(image.path, path);
        assert.ok(signal);
        assert.equal((await database.prepare('SELECT count(*) AS count FROM account_owner_work_leases WHERE owner_id=? AND expires_at>?')
          .get('budget-user', new Date().toISOString()) as { count: number }).count, 1);
        return '  Hello from the image.  ';
      });
    assert.equal(jobId, 'local-ocr-job');
    assert.equal(cleaned, true);
    assert.equal(localCalls, 1);
    const result = await database.prepare(`SELECT status,model,ocr_text,input_tokens,output_tokens,billed_microusd,image_count
      FROM ai_analysis_results WHERE item_id='item-local-ocr-import'`).get() as {
        status: string; model: string; ocr_text: string; input_tokens: number; output_tokens: number; billed_microusd: string; image_count: number;
      };
    assert.equal(result.status, 'completed');
    assert.equal(result.model, 'tesseract-local-ocr');
    assert.equal(result.ocr_text, 'Hello from the image.');
    assert.equal(result.input_tokens, 0);
    assert.equal(result.output_tokens, 0);
    assert.equal(Number(result.billed_microusd), 0);
    assert.equal(result.image_count, 1);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM ai_usage_reservations WHERE job_id=?').get('local-ocr-job') as { count: number }).count, 0);
  } finally { await database.close(); await rm(root, { recursive: true, force: true }); }
});

test('AI worker reserves before analysis, settles actual usage, and persists structured output', async () => {
  const database = await createTestDatabase();
  const root = await mkdtemp(join(tmpdir(), 'rembr-ai-worker-'));
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'media-import', 'media-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,updated_at)
      VALUES ('budget-user',TRUE,?,'2026-10-29T00:00:00.000Z',?)`).run(AI_DISCLOSURE_VERSION, now.toISOString());
    const path = join(root, 'photo.jpg');
    await writeFile(path, Buffer.from([0xff, 0xd8, 0xff]));
    const calls: string[] = [];
    const client: AiModelClient = {
      countTextInputTokens: async () => 12,
      analyzeText: async () => ({ text: '{"summary":"A sunset.","visual_description":"Orange sky over water.","keywords":["sunset"],"tags":["travel"],"brands":["Acme"],"tools":["Figma"],"people":["Ada Lovelace"],"repositories":["rembr/core"]}', inputTokens: 12, outputTokens: 20 }),
      countImageInputTokens: async (_prompt, _images, signal) => {
        calls.push('count-images');
        assert.ok(signal);
        assert.equal((await database.prepare('SELECT count(*) AS count FROM account_owner_work_leases WHERE owner_id=? AND expires_at>?')
          .get('budget-user', now.toISOString()) as { count: number }).count, 1);
        return [100];
      },
      countVideoInputTokens: async () => 100,
      analyzeImages: async () => { calls.push('images'); return [{ text: '{"summary":"A sunset.","visual_description":"Orange sky over water.","ocr_text":"","keywords":["sunset","orange sky"],"tags":["travel"],"brands":["Acme","Acme Labs"],"tools":["Figma"],"people":["ADA LOVELACE"],"repositories":["rembr/core"]}', inputTokens: 100, outputTokens: 20 }]; },
      analyzeVideo: async () => ({ text: '', inputTokens: 0, outputTokens: 0 }),
      transcribeWav: async () => ({ transcript: '', audioDurationMs: 0, sessionId: 'x' }),
    };
    const jobId = await processNextAiJob(database, client, async (_job, signal) => {
      calls.push('resolver');
      assert.ok(signal);
      assert.equal((await database.prepare('SELECT count(*) AS count FROM account_owner_work_leases WHERE owner_id=? AND expires_at>?')
        .get('budget-user', now.toISOString()) as { count: number }).count, 1);
      return { files: [{ path, mime: 'image/jpeg', byteSize: 3, kind: 'image' }], cleanup: async () => { calls.push('cleanup'); await rm(path, { force: true }); } };
    }, true, now);
    assert.equal(jobId, 'media-job');
    assert.deepEqual(calls, ['resolver', 'count-images', 'images', 'cleanup']);
    const result = await database.prepare(`SELECT summary,visual_description,keywords_json,tags_json,brands_json,tools_json,people_json,repositories_json,billed_microusd,status FROM ai_analysis_results WHERE item_id='item-media-import'`).get() as {
      summary: string; visual_description: string; keywords_json: string; tags_json: string; brands_json: string; tools_json: string; people_json: string; repositories_json: string; billed_microusd: string; status: string;
    };
    assert.equal(result.summary, 'A sunset.');
    assert.equal(result.visual_description, 'Orange sky over water.');
    assert.deepEqual(JSON.parse(result.keywords_json), ['sunset', 'orange sky']);
    assert.deepEqual(JSON.parse(result.tags_json), ['travel']);
    assert.deepEqual(JSON.parse(result.brands_json), ['Acme', 'Acme Labs']);
    assert.deepEqual(JSON.parse(result.tools_json), ['Figma']);
    assert.deepEqual(JSON.parse(result.people_json).map((label: string) => label.toLowerCase()), ['ada lovelace']);
    assert.deepEqual(JSON.parse(result.repositories_json), ['rembr/core']);
    assert.equal(Number(result.billed_microusd), 210);
    assert.equal(result.status, 'completed');
    const usage = await database.prepare(`SELECT spent_microusd,reserved_microusd FROM ai_import_usage WHERE import_id='media-import'`).get() as { spent_microusd: string; reserved_microusd: string };
    assert.equal(Number(usage.spent_microusd), 210);
    assert.equal(Number(usage.reserved_microusd), 0);
  } finally { await database.close(); await rm(root, { recursive: true, force: true }); }
});

test('known Meta rate limits are queued for a bounded retry without double spending', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'retry-import', 'retry-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,updated_at)
      VALUES ('budget-user',TRUE,?,?,?)`).run(AI_DISCLOSURE_VERSION, now.toISOString(), now.toISOString());
    const client = {
      countTextInputTokens: async () => { throw new MetaApiError('rate_limited', 'rate limit', { status: 429, retryable: true, outcomeUnknown: false }); },
    } as AiModelClient;
    const result = await processNextAiJob(database, client, async () => ({ files: [], cleanup: async () => undefined }), true, now);
    assert.equal(result, 'retry-job');
    const job = await database.prepare("SELECT status,error_code,attempts,available_at FROM ai_analysis_jobs WHERE id='retry-job'").get() as { status: string; error_code: string; attempts: number; available_at: string };
    assert.equal(job.status, 'queued');
    assert.equal(job.error_code, 'rate_limited');
    assert.equal(job.attempts, 1);
    assert.ok(Date.parse(job.available_at) > now.getTime());
    assert.equal((await database.prepare('SELECT count(*) AS count FROM ai_usage_reservations WHERE job_id=?').get('retry-job') as { count: number }).count, 0);
  } finally { await database.close(); }
});
