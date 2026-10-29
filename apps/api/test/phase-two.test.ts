import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createTestDatabase } from '../src/db/database.js';
import { recoverAssets } from '../src/assets/recovery.js';
import { LocalAssetStorage } from '../src/assets/storage.js';

const origin = 'http://127.0.0.1:5173';
const password = 'correct-horse-battery-staple';

async function withApi(run: (baseUrl: string, database: Awaited<ReturnType<typeof createTestDatabase>>, assetsPath: string) => Promise<void>) {
  const database = await createTestDatabase();
  const assetsPath = await mkdtemp(join(tmpdir(), 'rembr-phase2-assets-'));
  const app = createApp(database, { validateUrl: async (input) => ({ url: new URL(input), address: '93.184.216.34', family: 4 }), assetDirectory: assetsPath });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`, database, assetsPath); }
  finally {
    server.closeAllConnections();
    server.close();
    await database.close();
    await rm(assetsPath, { recursive: true, force: true });
  }
}

async function register(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 201);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
  return { cookie, user: await response.json() as { user: { id: string; email: string } } };
}

async function profile(baseUrl: string, cookie: string, username: string) {
  return fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
}

async function createPage(baseUrl: string, cookie: string, url: string) {
  return fetch(`${baseUrl}/api/items`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
}

test('Phase 2 profile gate, onboarding skip, and disabled-account checks are enforced server-side', async () => {
  await withApi(async (baseUrl, database) => {
    const account = await register(baseUrl, 'gate@example.test');
    const gated = await fetch(`${baseUrl}/api/items`, { headers: { Cookie: account.cookie } });
    assert.equal(gated.status, 428);
    assert.equal((await gated.json() as { error: { code: string } }).error.code, 'PROFILE_INCOMPLETE');
    assert.equal((await profile(baseUrl, account.cookie, 'gate_user')).status, 200);
    const skipped = await fetch(`${baseUrl}/api/onboarding`, { method: 'PUT', headers: { Cookie: account.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ skipped: true, contentTypes: [], referralSource: '' }) });
    assert.equal(skipped.status, 200);
    assert.ok((await skipped.json() as { onboarding: { skippedAt: string } }).onboarding.skippedAt);
    await database.prepare("UPDATE users SET account_status='disabled' WHERE id=?").run(account.user.user.id);
    const disabled = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: account.cookie } });
    assert.equal(disabled.status, 403);
    assert.equal((await disabled.json() as { error: { code: string } }).error.code, 'account_disabled');
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'gate@example.test', password }) });
    assert.equal(login.status, 403);
  });
});

test('profile usernames are unique after normalization and owner scoped', async () => {
  await withApi(async (baseUrl) => {
    const first = await register(baseUrl, 'first-profile@example.test');
    const second = await register(baseUrl, 'second-profile@example.test');
    assert.equal((await profile(baseUrl, first.cookie, 'Unique_Name')).status, 200);
    const duplicate = await profile(baseUrl, second.cookie, 'unique_name');
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json() as { error: { code: string } }).error.code, 'username_taken');
  });
});

test('profile avatar upload is private, extension checked, and explicitly clearable', async () => {
  await withApi(async (baseUrl, database) => {
    const account = await register(baseUrl, 'avatar-owner@example.test');
    const form = new FormData(); form.set('username', 'avatar_owner');
    form.append('avatar', new Blob([Buffer.from([137,80,78,71,13,10,26,10,0,0])], { type: 'image/png' }), 'avatar.png');
    const upload = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { Cookie: account.cookie, Origin: origin }, body: form });
    assert.equal(upload.status, 200);
    const profileBody = await upload.json() as { profile: { avatarAssetId: string; avatarAssetUrl: string } };
    assert.ok(profileBody.profile.avatarAssetId);
    assert.equal((await fetch(`${baseUrl}${profileBody.profile.avatarAssetUrl}`, { headers: { Cookie: account.cookie } })).status, 200);
    const clear = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { Cookie: account.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'avatar_owner', avatarUrl: '' }) });
    assert.equal(clear.status, 200);
    assert.equal((await clear.json() as { profile: { avatarAssetId: string | null } }).profile.avatarAssetId, null);
    assert.equal((await database.prepare('SELECT count(*) AS c FROM asset_objects').get() as { c: number }).c, 0);
  });
});

test('item list filters, keyset pagination, metadata overrides and organization membership stay owner scoped', async () => {
  await withApi(async (baseUrl, database) => {
    const first = await register(baseUrl, 'library-owner@example.test');
    const second = await register(baseUrl, 'library-other@example.test');
    await profile(baseUrl, first.cookie, 'library_owner');
    await profile(baseUrl, second.cookie, 'library_other');
    const firstCreate = await createPage(baseUrl, first.cookie, 'https://example.com/alpha');
    const firstItem = (await firstCreate.json() as { item: { id: string } }).item;
    const secondCreate = await createPage(baseUrl, first.cookie, 'https://example.com/beta');
    const secondItem = (await secondCreate.json() as { item: { id: string } }).item;
    const list = await fetch(`${baseUrl}/api/items?search=example&sort=title_asc&limit=1`, { headers: { Cookie: first.cookie } });
    assert.equal(list.status, 200);
    const page = await list.json() as { items: Array<{ id: string }>; nextCursor: string; hasMore: boolean };
    assert.equal(page.items.length, 1);
    assert.equal(page.hasMore, true);
    const next = await fetch(`${baseUrl}/api/items?search=example&sort=title_asc&limit=1&cursor=${encodeURIComponent(page.nextCursor)}`, { headers: { Cookie: first.cookie } });
    assert.equal((await next.json() as { items: unknown[] }).items.length, 1);
    const badCursor = await fetch(`${baseUrl}/api/items?search=other&sort=title_asc&limit=1&cursor=${encodeURIComponent(page.nextCursor)}`, { headers: { Cookie: first.cookie } });
    assert.equal(badCursor.status, 400);
    for (const sort of ['created_desc', 'created_asc', 'title_desc']) {
      const sorted = await fetch(`${baseUrl}/api/items?sort=${sort}&limit=1`, { headers: { Cookie: first.cookie } });
      const firstPage = await sorted.json() as { nextCursor: string; hasMore: boolean };
      assert.equal(firstPage.hasMore, true);
      const secondPage = await fetch(`${baseUrl}/api/items?sort=${sort}&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`, { headers: { Cookie: first.cookie } });
      assert.equal((await secondPage.json() as { items: unknown[] }).items.length, 1);
    }
    const edit = await fetch(`${baseUrl}/api/items/${firstItem.id}`, { method: 'PATCH', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ titleOverride: 'My headline', descriptionOverride: 'My note' }) });
    assert.equal(edit.status, 200);
    const edited = (await edit.json() as { item: { title: string; description: string; text: string } }).item;
    assert.equal(edited.title, 'My headline');
    assert.equal(edited.description, 'My note');
    assert.equal(edited.text, '');
    await fetch(`${baseUrl}/api/items/${firstItem.id}`, { method: 'PATCH', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ titleOverride: 'Design inspiration', descriptionOverride: 'A reliable system for teams' }) });
    const termSearch = await fetch(`${baseUrl}/api/items?search=design%20system&matchMode=terms&sort=relevance`, { headers: { Cookie: first.cookie } });
    const termSearchBody = await termSearch.json() as { items: Array<{ id: string }>; searchEventId: string };
    assert.deepEqual(termSearchBody.items.map((item) => item.id), [firstItem.id]);
    assert.ok(termSearchBody.searchEventId);
    const phraseSearch = await fetch(`${baseUrl}/api/items?search=design%20system&matchMode=phrase&sort=relevance`, { headers: { Cookie: first.cookie } });
    assert.deepEqual((await phraseSearch.json() as { items: unknown[] }).items, []);
    const feedback = await fetch(`${baseUrl}/api/search/feedback`, { method: 'POST', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ searchEventId: termSearchBody.searchEventId, itemId: firstItem.id, rating: 'helpful' }) });
    assert.equal(feedback.status, 201);
    const foreignFeedback = await fetch(`${baseUrl}/api/search/feedback`, { method: 'POST', headers: { Cookie: second.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ searchEventId: termSearchBody.searchEventId, itemId: firstItem.id, rating: 'helpful' }) });
    assert.equal(foreignFeedback.status, 404);
    const evidence = await fetch(`${baseUrl}/api/knowledge/answer`, { method: 'POST', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'reliable system' }) });
    const evidenceBody = await evidence.json() as { citations: Array<{ id: string; snippet: string }>; resultIds: string[]; mode: string };
    assert.equal(evidence.status, 200);
    assert.equal(evidenceBody.mode, 'lexical-excerpts');
    assert.deepEqual(evidenceBody.resultIds, [firstItem.id]);
    assert.match(evidenceBody.citations[0]!.snippet, /reliable system/);
    await fetch(`${baseUrl}/api/items/${secondItem.id}`, { method: 'PATCH', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ descriptionOverride: 'Audit evidence for privacy controls' }) });
    const conceptSearch = await fetch(`${baseUrl}/api/items?search=security&sort=relevance`, { headers: { Cookie: first.cookie } });
    assert.deepEqual((await conceptSearch.json() as { items: Array<{ id: string }> }).items.map((item) => item.id), [secondItem.id]);
    const foreign = await fetch(`${baseUrl}/api/items/${firstItem.id}`, { headers: { Cookie: second.cookie } });
    assert.equal(foreign.status, 404);
    const foreignSearch = await fetch(`${baseUrl}/api/items?search=example.com`, { headers: { Cookie: second.cookie } });
    assert.deepEqual((await foreignSearch.json() as { items: unknown[] }).items, []);
    const tagResponse = await fetch(`${baseUrl}/api/tags`, { method: 'POST', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '  Research  ' }) });
    const tag = (await tagResponse.json() as { tag: { id: string } }).tag;
    assert.equal(tagResponse.status, 201);
    assert.equal((await fetch(`${baseUrl}/api/tags/${tag.id}`, { method: 'PATCH', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Fieldwork' }) })).status, 200);
    const membership = `${baseUrl}/api/items/${firstItem.id}/tags/${tag.id}`;
    assert.equal((await fetch(membership, { method: 'PUT', headers: { Cookie: first.cookie } })).status, 204);
    assert.equal((await fetch(membership, { method: 'PUT', headers: { Cookie: first.cookie } })).status, 204);
    assert.equal((await fetch(membership, { method: 'PUT', headers: { Cookie: second.cookie } })).status, 404);
    const collectionResponse = await fetch(`${baseUrl}/api/collections`, { method: 'POST', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Reading' }) });
    const collection = (await collectionResponse.json() as { collection: { id: string } }).collection;
    assert.equal((await fetch(`${baseUrl}/api/collections/${collection.id}`, { headers: { Cookie: second.cookie } })).status, 404);
    const attach = `${baseUrl}/api/collections/${collection.id}/items/${firstItem.id}`;
    assert.equal((await fetch(attach, { method: 'PUT', headers: { Cookie: first.cookie } })).status, 204);
    assert.equal((await fetch(attach, { method: 'PUT', headers: { Cookie: first.cookie } })).status, 204);
    const privateJob = await database.prepare('SELECT id FROM processing_jobs WHERE item_id=?').get(firstItem.id) as { id: string };
    assert.equal((await fetch(`${baseUrl}/api/jobs/${privateJob.id}`, { headers: { Cookie: second.cookie } })).status, 404);
    const filtered = await fetch(`${baseUrl}/api/items?collectionId=${collection.id}`, { headers: { Cookie: first.cookie } });
    assert.equal((await filtered.json() as { items: Array<{ id: string }> }).items[0]?.id, firstItem.id);
    assert.equal((await fetch(`${baseUrl}/api/collections/${collection.id}`, { method: 'PATCH', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Read later', description: 'Curated' }) })).status, 200);
    assert.equal((await fetch(attach, { method: 'DELETE', headers: { Cookie: first.cookie } })).status, 204);
    assert.equal((await fetch(`${baseUrl}/api/tags/${tag.id}`, { method: 'DELETE', headers: { Cookie: first.cookie } })).status, 204);
    assert.equal((await fetch(`${baseUrl}/api/collections/${collection.id}`, { method: 'DELETE', headers: { Cookie: first.cookie } })).status, 204);
  });
});

test('Phase 4 synthetic retrieval fixture reports graded ranking metrics through the API', async () => {
  await withApi(async (baseUrl) => {
    const owner = await register(baseUrl, 'retrieval-eval@example.test');
    await profile(baseUrl, owner.cookie, 'retrieval_eval');
    const fixtures = [
      { key: 'F1', url: 'https://fixture.test/f1', title: 'Design system', description: '', grade: 3 },
      { key: 'F2', url: 'https://fixture.test/f2', title: 'Design system checklist', description: '', grade: 3 },
      { key: 'F3', url: 'https://fixture.test/f3', title: 'UI guidance', description: 'Design system for product teams', grade: 2 },
      { key: 'F4', url: 'https://fixture.test/design-system', title: 'Component library', description: '', grade: 1 },
      { key: 'F6', url: 'https://fixture.test/f6', title: 'Design cues', description: 'System mapping', grade: 2 },
    ];
    const ids: Record<string, string> = {};
    for (const fixture of fixtures) {
      const created = await createPage(baseUrl, owner.cookie, fixture.url);
      assert.equal(created.status, 202);
      const { item } = await created.json() as { item: { id: string } };
      ids[fixture.key] = item.id;
      const updated = await fetch(`${baseUrl}/api/items/${item.id}`, {
        method: 'PATCH', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleOverride: fixture.title, descriptionOverride: fixture.description }),
      });
      assert.equal(updated.status, 200);
    }
    const noteForm = new FormData(); noteForm.set('title', 'Sprint notes'); noteForm.set('body', 'Design system migration notes');
    const note = await fetch(`${baseUrl}/api/notes`, { method: 'POST', headers: { Cookie: owner.cookie }, body: noteForm });
    assert.equal(note.status, 201);
    ids.F5 = (await note.json() as { item: { id: string } }).item.id;
    const grades = new Map(fixtures.map(({ key, grade }) => [ids[key]!, grade]));
    grades.set(ids.F5, 2);

    const response = await fetch(`${baseUrl}/api/items?search=design%20system&matchMode=terms&sort=relevance`, { headers: { Cookie: owner.cookie } });
    assert.equal(response.status, 200);
    const ranked = (await response.json() as { items: Array<{ id: string }> }).items.map(({ id }) => id);
    const rankedGrades = ranked.map((id) => grades.get(id) ?? 0);
    const dcg = (values: number[]) => values.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
    const idealGrades = [...grades.values()].sort((a, b) => b - a);
    const ndcg = dcg(rankedGrades) / dcg(idealGrades);
    const firstRelevantRank = rankedGrades.findIndex((grade) => grade > 0) + 1;
    const reciprocalRank = firstRelevantRank ? 1 / firstRelevantRank : 0;

    assert.deepEqual(ranked, [ids.F1, ids.F2, ids.F3, ids.F6, ids.F5, ids.F4]);
    assert.equal(reciprocalRank, 1);
    assert.equal(ndcg, 1);
  });
});

test('Smart Collections support owner-scoped renames and manual membership corrections', async () => {
  await withApi(async (baseUrl) => {
    const owner = await register(baseUrl, 'smart-owner@example.test');
    const other = await register(baseUrl, 'smart-other@example.test');
    await profile(baseUrl, owner.cookie, 'smart_owner');
    await profile(baseUrl, other.cookie, 'smart_other');
    const ids: string[] = [];
    for (const [index, description] of ['A Figma dashboard design system.', 'A second dashboard and interface design system.', 'Unrelated reading list.'].entries()) {
      const created = await createPage(baseUrl, owner.cookie, `https://smart-fixture.test/${index}`);
      const { item } = await created.json() as { item: { id: string } };
      ids.push(item.id);
      assert.equal((await fetch(`${baseUrl}/api/items/${item.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ titleOverride: `Fixture ${index}`, descriptionOverride: description }) })).status, 200);
    }

    const list = await fetch(`${baseUrl}/api/smart-collections`, { headers: { Cookie: owner.cookie } });
    assert.equal(list.status, 200);
    const collections = (await list.json() as { collections: Array<{ id: string; slug: string; name: string }> }).collections;
    const uiGroup = collections.find(({ slug }) => slug === 'ui-inspiration');
    assert.ok(uiGroup);
    const rename = await fetch(`${baseUrl}/api/smart-collections/${uiGroup.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Interface references' }) });
    assert.equal(rename.status, 200);
    assert.equal((await rename.json() as { collection: { name: string } }).collection.name, 'Interface references');

    const include = await fetch(`${baseUrl}/api/smart-collections/${uiGroup.id}/items/${ids[2]}/override`, { method: 'PUT', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'include' }) });
    assert.equal(include.status, 200);
    let grouped = await fetch(`${baseUrl}/api/smart-collections/${uiGroup.id}/items?limit=100`, { headers: { Cookie: owner.cookie } });
    assert.ok((await grouped.json() as { items: Array<{ id: string }> }).items.some(({ id }) => id === ids[2]));

    const exclude = await fetch(`${baseUrl}/api/smart-collections/${uiGroup.id}/items/${ids[0]}/override`, { method: 'PUT', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'exclude' }) });
    assert.equal(exclude.status, 200);
    grouped = await fetch(`${baseUrl}/api/smart-collections/${uiGroup.id}/items?limit=100`, { headers: { Cookie: owner.cookie } });
    assert.equal((await grouped.json() as { items: Array<{ id: string }> }).items.some(({ id }) => id === ids[0]), false);

    const foreign = await fetch(`${baseUrl}/api/smart-collections/${uiGroup.id}/items`, { headers: { Cookie: other.cookie } });
    assert.equal(foreign.status, 404);
  });
});

test('Smart Collections rules use existing summary, visual, OCR, and transcript artifacts', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'smart-analysis@example.test');
    await profile(baseUrl, owner.cookie, 'smart_analysis');
    const now = new Date().toISOString();
    const analysisFields = ['summary', 'visual_description', 'ocr_text', 'transcript'] as const;

    for (const [index, targetField] of analysisFields.entries()) {
      const created = await createPage(baseUrl, owner.cookie, `https://analysis-fixture.test/${index}`);
      const { item } = await created.json() as { item: { id: string } };
      assert.equal((await fetch(`${baseUrl}/api/items/${item.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ titleOverride: `Saved reference ${index}`, descriptionOverride: `Unrelated description ${index}` }) })).status, 200);
      const importId = `smart-analysis-import-${index}`;
      const jobId = `smart-analysis-job-${index}`;
      await database.prepare(`INSERT INTO imports (id,owner_id,request_id,source,status,created_at,updated_at) VALUES (?,?,?,'instagram','queued',?,?)`).run(importId, owner.user.user.id, importId, now, now);
      await database.prepare(`INSERT INTO ai_analysis_jobs (id,owner_id,import_id,item_id,status,available_at,created_at,updated_at) VALUES (?,?,?,?,'queued',?,?,?)`).run(jobId, owner.user.user.id, importId, item.id, now, now, now);
      const analysis: Record<typeof analysisFields[number], string> = { summary: '', visual_description: '', ocr_text: '', transcript: '' };
      analysis[targetField] = 'Figma design system dashboard';
      await database.prepare(`INSERT INTO ai_analysis_results
        (id,owner_id,item_id,generation,status,model,summary,visual_description,ocr_text,transcript,keywords_json,tags_json,
         image_count,image_bytes,video_count,max_video_bytes,audio_seconds,input_tokens,output_tokens,billed_microusd,created_at)
        VALUES (?,?,?,1,'completed','fixture',?,?,?,?, '[]','[]',0,0,0,0,0,0,0,0,?)`)
        .run(`smart-analysis-result-${index}`, owner.user.user.id, item.id, analysis.summary, analysis.visual_description, analysis.ocr_text, analysis.transcript, now);
    }

    const response = await fetch(`${baseUrl}/api/smart-collections`, { headers: { Cookie: owner.cookie } });
    assert.equal(response.status, 200);
    const collections = (await response.json() as { collections: Array<{ slug: string; itemCount: number }> }).collections;
    assert.equal(collections.find(({ slug }) => slug === 'ui-inspiration')?.itemCount, analysisFields.length);
  });
});

test('notes accept bounded image assets, enforce owner reads, and cascade with their item', async () => {
  await withApi(async (baseUrl, database) => {
    const owner = await register(baseUrl, 'note-owner@example.test');
    const other = await register(baseUrl, 'note-other@example.test');
    await profile(baseUrl, owner.cookie, 'note_owner');
    await profile(baseUrl, other.cookie, 'note_other');
    const form = new FormData();
    form.set('title', 'Field note');
    form.set('body', 'A saved thought.');
    form.set('links', JSON.stringify(['https://example.com/reference#part']));
    form.append('images', new Blob([Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])], { type: 'image/png' }), 'image.png');
    const create = await fetch(`${baseUrl}/api/notes`, { method: 'POST', headers: { Cookie: owner.cookie }, body: form });
    assert.equal(create.status, 201);
    const note = (await create.json() as { item: { id: string; note: { body: string; links: string[]; assets: Array<{ id: string; url: string }> } } }).item;
    assert.equal(note.note.body, 'A saved thought.');
    assert.deepEqual(note.note.links, ['https://example.com/reference']);
    assert.equal(note.note.assets.length, 1);
    const assetRead = await fetch(`${baseUrl}${note.note.assets[0]!.url}`, { headers: { Cookie: owner.cookie } });
    assert.equal(assetRead.status, 200);
    assert.equal(assetRead.headers.get('content-type'), 'image/png');
    const foreignRead = await fetch(`${baseUrl}${note.note.assets[0]!.url}`, { headers: { Cookie: other.cookie } });
    assert.equal(foreignRead.status, 404);
    const update = new FormData(); update.set('title', 'Renamed field note'); update.set('body', 'Edited thought.'); update.set('links', '[]');
    const patch = await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: update });
    assert.equal(patch.status, 200);
    const updatedItem = (await patch.json() as { item: { title: string; note: { body: string; assets: Array<{ id: string }> } } }).item;
    const updatedNote = updatedItem.note;
    assert.equal(updatedItem.title, 'Renamed field note');
    assert.equal(updatedNote.body, 'Edited thought.');
    assert.equal(updatedNote.assets.length, 1);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM note_assets WHERE item_id=?').get(note.id) as { count: number }).count, 1);
    const invalidLink = new FormData(); invalidLink.set('body', 'Private link check'); invalidLink.set('links', JSON.stringify(['http://[::1]/private']));
    assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: invalidLink })).status, 400);
    for (const privateIpv6 of ['http://[fe80::1]/local', 'http://[fd00::1]/local']) {
      const privateLink = new FormData(); privateLink.set('body', 'Private link check'); privateLink.set('links', JSON.stringify([privateIpv6]));
      assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: privateLink })).status, 400);
    }
    const publicLink = new FormData(); publicLink.set('body', 'Public IPv6 link'); publicLink.set('links', JSON.stringify(['https://[2606:4700:4700::1111]/reference']));
    assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: publicLink })).status, 200);
    const tooLongBody = new FormData(); tooLongBody.set('body', 'x'.repeat(20_001)); tooLongBody.set('links', '[]');
    assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: tooLongBody })).status, 400);
    const tooManyLinks = new FormData(); tooManyLinks.set('body', 'Link limit check');
    tooManyLinks.set('links', JSON.stringify(Array.from({ length: 21 }, (_, index) => `https://example.com/${index}`)));
    assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: tooManyLinks })).status, 400);
    const badExtension = new FormData(); badExtension.set('body', 'Extension check'); badExtension.set('links', '[]');
    badExtension.append('images', new Blob([Buffer.from([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'mismatch.jpg');
    assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: badExtension })).status, 400);
    const oversized = new FormData(); oversized.set('body', 'Size check'); oversized.set('links', '[]');
    oversized.append('images', new Blob([Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(5 * 1024 * 1024)])], { type: 'image/png' }), 'large.png');
    assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: oversized })).status, 413);
    const tooMany = new FormData(); tooMany.set('body', 'Count check'); tooMany.set('links', '[]');
    for (let index=0; index<6; index+=1) tooMany.append('images', new Blob([Buffer.from([137,80,78,71,13,10,26,10])], { type: 'image/png' }), `image${index}.png`);
    assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}`, { method: 'PATCH', headers: { Cookie: owner.cookie }, body: tooMany })).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/notes/${note.id}/assets/${updatedNote.assets[0]!.id}`, { method: 'DELETE', headers: { Cookie: owner.cookie } })).status, 204);
    const afterImageRemoval = await fetch(`${baseUrl}/api/items/${note.id}`, { headers: { Cookie: owner.cookie } });
    assert.equal((await afterImageRemoval.json() as { item: { note: { assets: unknown[] } } }).item.note.assets.length, 0);
  });
});

test('Postgres schema starts with the complete empty Rembr model', async () => {
  const database = await createTestDatabase();
  try {
    const result = await database.prepare(`SELECT count(*) AS count FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'`).get() as { count: string };
    assert.equal(Number(result.count), 36);
    const rls = await database.prepare(`SELECT count(*) AS count FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity`).get() as { count: string };
    assert.equal(Number(rls.count), 36);
    const mediaAnalysisTables = await database.prepare(`SELECT count(*) AS count FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('ai_analysis_preferences','ai_worker_status','ai_analysis_jobs','ai_analysis_results','ai_import_usage','ai_monthly_usage','ai_usage_reservations')`).get() as { count: string };
    assert.equal(Number(mediaAnalysisTables.count), 7);
  } finally { await database.close(); }
});

test('asset recovery retains failed deletions for retry and removes them when storage recovers', async () => {
  const database = await createTestDatabase(); const root = await mkdtemp(join(tmpdir(), 'rembr-assets-recovery-'));
  try {
    class FlakyStorage extends LocalAssetStorage {
      fail = true;
      override async remove(key: string) { if (this.fail) throw new Error('injected unlink failure'); return super.remove(key); }
    }
    const storage = new FlakyStorage(root);
    const id = '11111111-1111-4111-8111-111111111111';
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO users (id,email,password_hash,created_at) VALUES ('asset-user','asset@example.test','x',?)`).run(now);
    await database.prepare(`INSERT INTO asset_objects (id,owner_id,kind,storage_key,detected_mime,byte_size,sha256,state,created_at,updated_at)
      VALUES (?,'asset-user','note_image',?,'image/png',1,'x','deleting',?,?)`).run(id, `${id}.asset`, now, now);
    await storage.initialize();
    await recoverAssets(database, storage);
    assert.equal((await database.prepare('SELECT count(*) AS c FROM asset_objects WHERE id=?').get(id) as { c: number }).c, 1);
    storage.fail = false;
    await recoverAssets(database, storage);
    assert.equal((await database.prepare('SELECT count(*) AS c FROM asset_objects WHERE id=?').get(id) as { c: number }).c, 0);
  } finally { await database.close(); await rm(root, { recursive: true, force: true }); }
});

test('staging assets are never readable and are removed during startup recovery', async () => {
  await withApi(async (baseUrl, database, assetsPath) => {
    const account = await register(baseUrl, 'staging-owner@example.test');
    await profile(baseUrl, account.cookie, 'staging_owner');
    const id = '22222222-2222-4222-8222-222222222222';
    const now = new Date().toISOString();
    await database.prepare(`INSERT INTO asset_objects (id,owner_id,kind,storage_key,detected_mime,byte_size,sha256,state,created_at,updated_at)
      VALUES (?,?,'avatar',?,'image/png',1,'x','staging',?,?)`).run(id, account.user.user.id, `${id}.asset`, now, now);
    const unreadable = await fetch(`${baseUrl}/api/assets/${id}`, { headers: { Cookie: account.cookie } });
    assert.equal(unreadable.status, 404);
    const storage = new LocalAssetStorage(assetsPath);
    await storage.initialize();
    await recoverAssets(database, storage);
    assert.equal((await database.prepare('SELECT count(*) AS count FROM asset_objects WHERE id=?').get(id) as { count: number }).count, 0);
  });
});
