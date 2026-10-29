import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTestDatabase } from '../src/db/database.js';
import { AiBudgetExceededError, createAiUsageRepository, MONTHLY_AI_CAP_MICROUSD, sparkCostMicroUsd, utcMonthStart, voiceCostMicroUsd } from '../src/ai/usage.js';
import { MetaApiError } from '../src/ai/meta-client.js';
import { processNextAiJob, type AiModelClient } from '../src/ai/worker.js';

async function seedImport(database: Awaited<ReturnType<typeof createTestDatabase>>, importId: string, jobId: string, now: string) {
  await database.prepare(`INSERT INTO users (id,email,password_hash,created_at) VALUES ('budget-user','budget@example.test','x',?) ON CONFLICT(id) DO NOTHING`).run(now);
  await database.prepare(`INSERT INTO imports (id,owner_id,request_id,source,status,created_at,updated_at)
    VALUES (?,'budget-user',?,'instagram','queued',?,?)`).run(importId, importId, now, now);
  await database.prepare(`INSERT INTO saved_items (id,owner_id,original_url,canonical_url,title,status,created_at,updated_at)
    VALUES (?,'budget-user',?,?, 'example','queued',?,?)`).run(`item-${importId}`, `https://instagram.com/p/${importId}/`, `https://instagram.com/p/${importId}/`, now, now);
  await database.prepare(`INSERT INTO ai_analysis_jobs (id,owner_id,import_id,item_id,status,available_at,created_at,updated_at)
    VALUES (?,'budget-user',?,?,'queued',?,?,?)`).run(jobId, importId, `item-${importId}`, now, now, now);
}

test('AI usage prices Spark tokens and Voice seconds in integer microdollars', () => {
  assert.equal(sparkCostMicroUsd(100, 10), 168);
  assert.equal(voiceCostMicroUsd(3600), 180_000);
  assert.equal(utcMonthStart(new Date('2026-12-31T23:59:59.000Z')), '2026-12-01');
});

test('an expired processing lease with an open reservation is paused for uncertain usage instead of retried', async () => {
  const database = await createTestDatabase();
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'crash-import', 'crash-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,updated_at)
      VALUES ('budget-user',TRUE,'2026-10-29-v1',?,?)`).run(now.toISOString(), now.toISOString());
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
      VALUES ('budget-user',TRUE,'test','2026-10-29T00:00:00.000Z',?)`).run(now.toISOString());
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

test('AI worker reserves before analysis, settles actual usage, and persists structured output', async () => {
  const database = await createTestDatabase();
  const root = await mkdtemp(join(tmpdir(), 'rembr-ai-worker-'));
  try {
    const now = new Date('2026-10-29T10:00:00.000Z');
    await seedImport(database, 'media-import', 'media-job', now.toISOString());
    await database.prepare(`INSERT INTO ai_analysis_preferences (owner_id,enabled,consent_version,consented_at,updated_at)
      VALUES ('budget-user',TRUE,'test','2026-10-29T00:00:00.000Z',?)`).run(now.toISOString());
    const path = join(root, 'photo.jpg');
    await writeFile(path, Buffer.from([0xff, 0xd8, 0xff]));
    const calls: string[] = [];
    const client: AiModelClient = {
      countTextInputTokens: async () => 12,
      analyzeText: async () => ({ text: '{"summary":"A sunset.","visual_description":"Orange sky over water.","keywords":["sunset"],"tags":["travel"]}', inputTokens: 12, outputTokens: 20 }),
      countImageInputTokens: async () => [100],
      countVideoInputTokens: async () => 100,
      analyzeImages: async () => { calls.push('images'); return [{ text: '{"summary":"A sunset.","visual_description":"Orange sky over water.","ocr_text":"","keywords":["sunset","orange sky"],"tags":["travel"]}', inputTokens: 100, outputTokens: 20 }]; },
      analyzeVideo: async () => ({ text: '', inputTokens: 0, outputTokens: 0 }),
      transcribeWav: async () => ({ transcript: '', audioDurationMs: 0, sessionId: 'x' }),
    };
    const jobId = await processNextAiJob(database, client, async () => ({
      files: [{ path, mime: 'image/jpeg', byteSize: 3, kind: 'image' }], cleanup: async () => { calls.push('cleanup'); await rm(path, { force: true }); },
    }), true, now);
    assert.equal(jobId, 'media-job');
    assert.deepEqual(calls, ['images', 'cleanup']);
    const result = await database.prepare(`SELECT summary,visual_description,keywords_json,tags_json,billed_microusd,status FROM ai_analysis_results WHERE item_id='item-media-import'`).get() as {
      summary: string; visual_description: string; keywords_json: string; tags_json: string; billed_microusd: string; status: string;
    };
    assert.equal(result.summary, 'A sunset.');
    assert.equal(result.visual_description, 'Orange sky over water.');
    assert.deepEqual(JSON.parse(result.keywords_json), ['sunset', 'orange sky']);
    assert.deepEqual(JSON.parse(result.tags_json), ['travel']);
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
      VALUES ('budget-user',TRUE,'test',?,?)`).run(now.toISOString(), now.toISOString());
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
