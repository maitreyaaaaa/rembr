# Backend route handler audit

**Scope:** handler bodies in `apps/orchestration/src/routes/*.js`. Source references are relative to `D:/IScraper-main/IScraper-main`. All routes are mounted after server middleware described in `backend-architecture.md`; the public/worker/extension/admin exceptions to user auth are controlled by server composition. This is a source map, not proof of deployed environment behavior. Store/workflow callees are separately mapped in backend docs and still require remaining full-file coverage.

## Account routes (`routes/accountRoutes.js`)

| Route / lines | Handler contract, side effects and errors |
|---|---|
| `GET /api/account/deletion` `:11-16` | Reads the active request for current user and returns public action/status projection; absent capability means no request. |
| `GET /api/account/security-activity` `:18-22` | Bounded recent audit activity (1-50); missing store capability returns empty list. |
| `POST /api/account/deletion` `:24-56` | Requires explicit export confirmation; creates/reuses request, immediately freezes tokens/credentials/jobs, transitions frozen then pending approval, records critical audit/workflow; returns 201. Partial mutations are possible if a subsequent call errors. |
| `POST /api/account/deletion/cancel` `:58-71` | Calls user-cancel method; unavailable=501, noncancelable=409; records security audit/workflow. |
| `GET /api/credits` `:73-75` | Returns store credit projection. |
| `GET /api/profile` `:77-82` | Times profile read and computes whether username is required when `store.requiresAuth`. |
| `GET /api/onboarding` `:84-92` | Returns preferences and computes required state only for authenticated stores with an existing incomplete/non-skipped preferences record. |
| `POST /api/activity/sign-in` `:94-104` | Best-effort support activity and workflow capture; returns `{ok:true}`. |
| `POST /api/profile` `:106-114` | Validates profile input, upserts and captures. |
| `POST /api/onboarding` `:116-131` | Requires store capability; validates preferences, upserts, captures counts/skip; missing capability=501. |

## Admin routes (`routes/adminRoutes.js`)

All handlers are rate-limited; all except login invoke `assertAdmin` before store access (`:13-303`). Login compares byte length before timing-safe password compare, requires configured allowlisted email/password, audits denial/success, but returns email only and does not issue a session/token (`:13-42`). Subsequent requests must use admin API key, email/password headers, or an allowlisted signed-in email (`http/auth.js:56-87`).

| Route family / lines | Behavior |
|---|---|
| Summary, users, detail `:44-78` | Capability checks/501. User listing bounds limit 1-100, offset >=0 and query; audits list/detail views with hashed actor reference. Detail is 404 if absent. |
| Block/unblock `:80-120` | Store update with bounded reason and actor; audit critical block / warning unblock; 404 missing account. |
| Imports/activity/worker status `:122-138` | Bounded fixed list responses; worker status uses workflow capability; missing methods return 501. |
| User timeline/audit events `:140-171` | Bounds result counts, applies user/type/severity filters, audits privileged reads; actor hash avoids storing admin email directly in read event metadata. |
| Feedback hide/show `:173-195` | Sets hidden/visible; 404 if missing; captures workflow but route does not write security audit event. |
| User credits/adjust `:197-223` | Read current credits; adjustments require nonzero integer, user ID, reason, carry actor; writes ledger + critical audit; 201. |
| Deletion list/approve/cancel/process `:225-303` | Admin-only, bounds list, logs critical audit; process delegates to deletion service with maxSteps, reports partial failure and executed count. See `deletion-billing-exports.md`; processing has no request-level lease. |

## Import routes (`routes/importRoutes.js`)

| Route / lines | Handler contract |
|---|---|
| `POST /api/imports` `:24-51` | Import limiter, multipart limit 20, completed-profile gate, validates file extension/MIME/bytes, parses and persists, queues worker if jobs, refreshes Smart Collections, records trace. Inline processing is configured separately. |
| `POST /api/imports/upload-urls` `:53-75` | Auth/profile gate; requires 1-20 client file descriptors; validates descriptor and creates user-prefixed upload paths, ensures bucket and returns signed-upload metadata. This route does not itself upload file bytes. |
| `POST /api/imports/upload-chunk` `:77-102` | Chunk parser, ownership-prefix validation, index/count checks, bucket ensure, storage upload with `upsert:true`; response returns storage path/part path. No extra import limiter on this handler. |
| `POST /api/imports/storage` `:104-147` | Loads submitted storage objects, validates complete files, synchronously creates import, removes retrieved files in `finally`, queues jobs, refreshes collections. This direct endpoint differs from worker-based `processStorageImport`; it does not call `store.claimStorageImport`. |
| `POST /api/saves/link` `:149-205` | Validates manual link payload, creates import and item; `review:true` creates `needs_review` without job, else queued and job created. Attempts readable archive, queues work, refreshes collections; duplicate response sets skipped count. |
| `POST /api/imports/:id/process` `:207-220` | Reads user-scoped jobs, queues processing for supplied import ID. Download defaults false only if caller explicitly sets false? Here `shouldDownload: req.body?.download !== false`, so default true. Returns count and queue metadata; it does not return 404 for nonexistent import. |
| `POST /api/jobs/restart` `:222-247` | Resets restartable jobs for current user and optional import, optionally queues processing unless `start:false`; download defaults true. |
| `GET /api/jobs/:id` `:249-256` | Owner-scoped job lookup, 404 absent. |

## Library routes (`routes/libraryRoutes.js`)

An unusual ordering exists: `GET /api/privacy-export` is registered before the local `app.use(requireAccountNotDeleting)` gate (`:35-47`); it remains behind whatever global deletion check the server has, but this file does not itself block pending deletion for that route. All later handlers are behind the local deletion middleware (`:49-53`). Most mutations require completed profile; reads generally do not.

| Route group / lines | Behavior |
|---|---|
| Privacy export, all items, paged items `:35-74` | Privacy export has capability/501 and workflow counts; `/api/data` loads all; `/api/items` switches to list paging only when paging/filter params are present, otherwise returns full list. |
| Smart Collections `:76-129` | List optionally includes hidden and has empty fallback; refresh requires completed profile; item page and patch/override enforce current user through store, return 404 missing, sanitize in store. |
| Library care/reminders `:131-172` | Link check is import-rate-limited, capped at 50, updates health and returns summary; reminder creation validates date/input, verifies owner item; patch maps unknown statuses to `done` rather than 400. |
| Note create/update/delete `:174-269` | Multipart image cap; creation requires body/link/image, creates note then persists images; on create image persistence error deletes saved item but object cleanup may depend on helper. Update validates existing item type, enforces image cap, deletes selected asset rows/objects, updates note fields, persists new files. Delete checks note type, deletes item then removes objects. Multi-call partial writes are possible, especially update/delete cleanup. |
| Item read/archive/similar `:271-307` | Owner-scoped item lookup; archive requires profile, checks archive support and forces capture; similar-visuals is search-rate-limited, reads all items plus vectors and ranks. |
| Review, approval, enrichment, batch start `:309-414` | Review patch projects allowed fields; approve changes status, creates import if missing, creates job if not done and optionally starts worker; single enrich queues one job; indexing start caps 1000 review items and bulk-approves into jobs. All refresh collections after relevant mutations. |
| Index summary/graph/export `:415-449` | Summary requires completed profile and capability. Graph reads user items and builds graph; Obsidian export packages graph files in ZIP. |

## Search routes (`routes/searchPrivateRoutes.js`, `searchRoutes.js`)

| Route / lines | Behavior |
|---|---|
| `POST /api/enrichment/intent-batch` `searchPrivateRoutes.js:18-35` | Requires completed profile, caps IDs to five, catches each queue error into per-item result, returns processed/queued counts. |
| `POST /api/search` `:37-89` | Query truncated to 240; runs keyword/semantic search; logs safe failure metadata. Optional AI answer runs only with results; 429/503 rethrow, other model errors fall back to normal results. Records search event, storing query only for zero-result searches, plus result IDs/filters/AI flag. This handler itself does not call `requireCompletedProfile`. |
| `POST /api/library-chat` `:91-125` | Requires completed profile, runs search then model answer with caller messages and optional web; errors emit support and workflow warnings; user-provided message history is passed to the chat workflow. |
| `POST /api/visual-search` `:127-177` | Requires profile; parses image data, requires app OpenAI, consumes media budget, describes image, loads all user items, ranks vectors/fallback and records search event. Any error is recorded as support failure and rethrown. |
| `POST /api/search/feedback` `:179-207` | Validates event/item/rating, delegates owner-scoped feedback persistence, returns 201; reason length is not bounded in this route and should be checked in store/schema. |
| `POST /api/lens/search` `searchRoutes.js:12-77` | Extension token scope `lens:search`; pending deletion blocks; text query requires two chars, image query validates crop, requires app OpenAI and media budget; returns at most eight sanitized results and records aggregate lens event. |

## Extension, agent and Telegram routes (`routes/integrationRoutes.js`)

Shared helper `getExtensionRequestUser` validates token scope, attaches user, blocks deletion and requires profile (`:45-58`); `getAgentRequestUser` mirrors this for agent scope (`:60-73`). Agent query cleans/truncates query, caps results, records search event and returns a constrained response (`:75-106`). Extension projection limits item fields (`:23-43`).

| Route / lines | Behavior |
|---|---|
| `POST /api/extension/saves/link` `:125-168` | Requires `saves:create`, creates browser-extension import/item/job, queue, refresh. |
| `DELETE /api/extension/saves/:id` `:170-189` | Requires `saves:delete`; only removes a saved item tied to an import whose source is `browser-extension`; does not delete parent import. |
| Screenshot capture `POST /api/extension/captures/screenshot` `:191-267` | Requires `captures:create`, image file and note/asset capabilities; optional local/paid screenshot plan; creates note, stores image, tags source metadata, attempts analysis but analysis failure is warning-only and capture succeeds; outer persistence failure deletes item (not guaranteed object cleanup). |
| Selection capture `POST /api/extension/captures/selection` `:269-322` | Accepts text/image/video selection with bounded title/text/note/url/media fields; text/media required by kind; creates note with references and metadata; no actual media download/upload. |
| `DELETE /api/extension/captures/:id` `:324-341` | Requires `captures:delete`, only deletes extension capture/selection platform keys; removes asset objects after row delete. |
| Extension recent/search/status `:343-373` | Scope `lens:search`; recent caps 20; search rate-limited and returns projected results; status normalizes URL and loads all current-user items to compare. |
| Agent query/item `:375-395` | `library:search` or `library:read` scope; read returns `publicAgentItem` projection and logs access. |
| `POST /api/mcp` `:397-409` | Requires `library:search`; dispatches single or JSON-RPC batch requests; handles notifications with 202; filters nulls in batch; actual tool authorization/validation is in `agentAccess.js`. |
| `POST /api/telegram/webhook` `:411-505` | Verifies secret; checks store capabilities; parses update. `/connect` resolves a hashed scoped token and upserts chat connection; disconnect revokes; ordinary message loads connection and token, checks profile, saves only first link, marks connection used, and replies through Telegram API. Reply failure is warning-only; save failure propagates. Pending deletion is not checked by `requireCompletedProfile` alone unless that helper includes it; verify workflow helper. |

## Automation routes (`routes/automationRoutes.js`)

Group-level middleware blocks deletion for `/api/automations` and `/api/automation-chats` (`:9-11`, `:30-32`); each user data handler requires completed profile. Models list is returned without profile gate but still passes global user middleware. Chat list/create/get/update/append/delete delegate owner ID to chat service (`:36-74`). Run history validates status, UUID, date/page filters (`:76-94`). Draft/revise calls model workflow and logs support/worfklow data (`:96-108`); create/update expose a public projection (`:110-116`, `:165-184`). Gmail connection listing returns mock mode flag. Connect either mock-connects, or verifies optional chat ownership, signs per-user state, starts provider OAuth, sets HttpOnly SameSite=Lax short-lived cookie, and returns redirect (`:122-143`). Manual run returns 429 + Retry-After for rate limit; otherwise 200 completed, 409 needs connection, 502 failed (`:152-163`).

Callback `GET /api/automations/gmail/callback` validates signed state cookie, reads `session_uri`, clears cookie and redirects to fixed app origin with connected/failed query (`:185-206`). Errors are intentionally collapsed into failed redirect. Cookie parser is simple split; app return URL only preserves origin, discarding path (`:209-270`). Full OAuth provider contract and state signing live in `services/automations.js` and need separate complete trace.

## Data export/public/worker/workflow/Stripe routes

| Module/routes | Behavior |
|---|---|
| Data exports `routes/dataExportRoutes.js:9-65` | User data map is public read; account summary and export listing are user-scoped; POST enqueues request and kicks one worker job; GET detail owner-scoped; download requires own request status ready, artifact exists, then audit and sends ZIP. |
| Public routes `routes/publicRoutes.js:8-45` | Health no-store with process metadata; packages include computed labels and checkout-enabled flag; public feedback reads visible feedback; posting validates message 3-500 chars, rate-limits, stores feature/message and returns 201. |
| Worker aliases `routes/workerRoutes.js:6-9` | GET and POST process/process-one call identical worker handler and mutate jobs. GET is state-changing and should be removed or protected from prefetch/caches in Rembr. |
| Workflow routes `routes/workflowRoutes.js:13-82` | Middleware blocks deleting account. Readiness returns config/skills. Generate requires profile, shared budget only when OpenRouter configured, combines selected owned items and up to four manual references, then generates plan. Publish requires `approved:true` gate inside service; route returns 409 blocked, 502 failed, 200 otherwise. |
| Stripe raw route `routes/integrationRawRoutes.js:8-34` | Mounted before JSON parser; checks webhook secret, signature-verifies raw body; only checkout completion is handled and delegated to store RPC. No test covers route behavior in current orchestration test tree. |
| Checkout `routes/integrationPrivateRoutes.js:112-153` | Fail closed unless config enabled and Stripe configured; resolves active package, creates purchase, Stripe session with server-generated price/metadata and updates session ID; see billing docs for missing webhook test/SQL ACL risk. |

## Route-level issues and remaining evidence

1. **Mutation via GET:** worker process aliases are registered for GET and POST. Keep only explicit mutation methods in Rembr.
2. **Password login is not a session:** admin login validates but emits no credential; admin guard separately accepts admin email/password headers. Document UX/security behavior and consider session-based admin auth.
3. **Middleware asymmetry:** search handler and item details may not require completed profile while many mutations do; document onboarding exceptions and align expected product gates.
4. **State/data changes are multi-call:** note uploads, deletion, item approve, manual import and Smart Collection refresh have partial-failure windows. Durable idempotency/compensation policy required.
5. **Input validation responsibility split:** some handlers truncate; some rely on service/store; some accept broad body filters/messages. Maintain exact schema contracts and owner checks in Rembr.
6. A line-by-line pass over every route was performed for the modules in this document. Route-focused test assertions, service callees, and Supabase policy parity remain open; see `../source-audit/backend-source-coverage.md`.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
