# IScraper API Routes and Access Contracts

This route catalog is derived from the current route registration source, not a generated OpenAPI artifact. Handler line numbers are given as source anchors. Route contracts should be converted to OpenAPI in Rembr only after the current behavior and error shapes are accepted.

## Middleware and request contract

Global order and route boundaries are described in [Backend Architecture](backend-architecture.md#composition-and-request-ordering), sourced from `apps/orchestration/src/server.js:124-191`. JSON is limited by `jsonBodyLimit` (default `1mb`); multipart files are memory-buffered with route-specific file/size limits. Successful and error responses may include `requestId` and `correlationId`. Errors are normalized by `src/http/errors.js:4-45`; common statuses are 400 validation/upload, 401 missing/invalid identity, 403 denied, 404 missing resource, 409 state conflict, 413 payload too large, 423 account deletion lock, 428 profile incomplete, 429 rate limit, 501 store capability absent, 503 service/config not ready, and 500 unexpected failure. Exact status is per handler.

Access classes:

| Class | Mechanism | Source |
|---|---|---|
| Public | No user identity; general limiter, sometimes route limiter | `routes/publicRoutes.js`, `http/rateLimit.js` |
| User-authenticated | Global Bearer resolution; account-not-deleting and user-row setup | `server.js:162-189`, `http/auth.js:5-22` |
| Admin | Admin API key, allowlisted admin credentials, or allowlisted Supabase user; admin limiter | `http/auth.js:54-91`, `routes/adminRoutes.js` |
| Worker | Worker key in `x-worker-api-key` or Bearer; worker limiter | `http/auth.js:93-109`, `routes/workerRoutes.js` |
| Extension token | Hashed, revocable token with required scope in `x-iscraper-extension-token` | `http/auth.js:24-37` |
| Agent token | Hashed, revocable token with required scope in `x-iscraper-agent-token` or Bearer | `http/auth.js:39-52` |
| Signed callback | Provider signature or signed/verified connection-state token | Stripe `integrationRawRoutes.js`; Gmail callback `automationRoutes.js`; Telegram webhook `integrationRoutes.js` |

## Route catalog

### Public, admin, and worker surfaces

| Method | Path | Access | Behavior / implementation |
|---|---|---|---|
| GET | `/api/health` | Public | Health/status probe (`routes/publicRoutes.js:8`) |
| GET | `/api/credit-packages` | Public | Lists purchase packages (`publicRoutes.js:20`) |
| GET | `/api/feedback` | Public | Lists visible feedback only (`publicRoutes.js:31`) |
| POST | `/api/feedback` | Public + feedback limiter | Validates/stores feedback (`publicRoutes.js:35`) |
| POST | `/api/admin/login` | Admin limiter; route implements login | Admin credential login (`adminRoutes.js:13`) |
| GET | `/api/admin/summary` | Admin | Aggregate summary (`adminRoutes.js:44`) |
| GET | `/api/admin/users` | Admin | User listing (`adminRoutes.js:50`) |
| GET | `/api/admin/users/:userId` | Admin | User detail (`adminRoutes.js:65`) |
| POST | `/api/admin/users/:userId/block` | Admin | Blocks user (`adminRoutes.js:80`) |
| POST | `/api/admin/users/:userId/unblock` | Admin | Unblocks user (`adminRoutes.js:102`) |
| GET | `/api/admin/imports` | Admin | Import inspection (`adminRoutes.js:122`) |
| GET | `/api/admin/activity` | Admin | Activity events (`adminRoutes.js:128`) |
| GET | `/api/admin/worker/status` | Admin | Queue and worker status (`adminRoutes.js:134`) |
| GET | `/api/admin/users/:userId/timeline` | Admin | User/security timeline (`adminRoutes.js:140`) |
| GET | `/api/admin/audit-events` | Admin | Security audit events (`adminRoutes.js:154`) |
| GET | `/api/admin/feedback` | Admin | Feedback moderation list (`adminRoutes.js:173`) |
| POST | `/api/admin/feedback/:id/hide` | Admin | Hide feedback (`adminRoutes.js:179`) |
| POST | `/api/admin/feedback/:id/show` | Admin | Show feedback (`adminRoutes.js:188`) |
| GET | `/api/admin/credits/:userId` | Admin | User credits (`adminRoutes.js:197`) |
| POST | `/api/admin/credits/adjust` | Admin | Creates an audited adjustment (`adminRoutes.js:202`) |
| GET | `/api/admin/deletion-requests` | Admin | Lists deletion requests (`adminRoutes.js:225`) |
| POST | `/api/admin/deletion-requests/:id/approve` | Admin | Approves request (`adminRoutes.js:232`) |
| POST | `/api/admin/deletion-requests/:id/cancel` | Admin | Cancels request (`adminRoutes.js:251`) |
| POST | `/api/admin/deletion-requests/:id/process` | Admin | Executes deletion steps (`adminRoutes.js:271`) |
| GET/POST | `/api/worker/process` | Worker | Processes bounded batch (`workerRoutes.js:6-7`) |
| GET/POST | `/api/worker/process-one` | Worker | Caps indexing to one job (`workerRoutes.js:8-9`) |

### Authenticated account and export surfaces

| Method | Path | Behavior / implementation |
|---|---|---|
| GET | `/api/account/deletion` | Current deletion request (`accountRoutes.js:11`) |
| GET | `/api/account/security-activity` | Security history (`accountRoutes.js:18`) |
| POST | `/api/account/deletion` | Requires explicit `exportConfirmed: true`; creates request (`accountRoutes.js:24`) |
| POST | `/api/account/deletion/cancel` | Cancels only an eligible request (`accountRoutes.js:58`) |
| GET | `/api/credits` | User credit balance (`accountRoutes.js:73`) |
| GET/POST | `/api/profile` | Read or update profile (`accountRoutes.js:77`, `106`) |
| GET/POST | `/api/onboarding` | Read or save onboarding preferences (`accountRoutes.js:84`, `116`) |
| POST | `/api/activity/sign-in` | Records sign-in activity (`accountRoutes.js:94`) |
| GET | `/api/user-data-map` | Describes data categories/retention map (`dataExportRoutes.js:9`) |
| GET | `/api/account/summary` | Account data summary (`dataExportRoutes.js:13`) |
| GET | `/api/data-exports` | Lists export requests (`dataExportRoutes.js:18`) |
| POST | `/api/data-exports` | Requests export processing (`dataExportRoutes.js:23`) |
| GET | `/api/data-exports/:id` | Owner-scoped status (`dataExportRoutes.js:39`) |
| GET | `/api/data-exports/:id/download` | Owner-scoped download only when ready; records audit event (`dataExportRoutes.js:46`) |

### Import, saves, indexing, and job state

| Method | Path | Behavior / implementation |
|---|---|---|
| POST | `/api/imports` | Multipart export import; up to 20 files (`importRoutes.js:24`) |
| POST | `/api/imports/upload-urls` | Creates signed storage upload URLs (`importRoutes.js:53`) |
| POST | `/api/imports/upload-chunk` | Receives a bounded chunk (`importRoutes.js:77`) |
| POST | `/api/imports/storage` | Validates and processes user-prefixed storage paths (`importRoutes.js:104`) |
| POST | `/api/saves/link` | Captures a manual link (`importRoutes.js:149`) |
| POST | `/api/imports/:id/process` | Starts or requests processing for an import (`importRoutes.js:207`) |
| POST | `/api/jobs/restart` | Restarts eligible failed/paused jobs (`importRoutes.js:222`) |
| GET | `/api/jobs/:id` | Reads job status (`importRoutes.js:249`) |
| POST | `/api/indexing/start` | Starts indexing for queued library content (`libraryRoutes.js:372`) |
| GET | `/api/indexing/summary` | Returns indexing summary (`libraryRoutes.js:415`) |

### Library, notes, collections, archives, and graph

| Method | Path | Behavior / implementation |
|---|---|---|
| GET | `/api/privacy-export` | Legacy/synchronous privacy export (`libraryRoutes.js:35`) |
| GET | `/api/data` | Legacy data read (`libraryRoutes.js:50`) |
| GET | `/api/items` | Paged/filtered library list (`libraryRoutes.js:55`) |
| GET | `/api/smart-collections` | List collections (`libraryRoutes.js:76`) |
| POST | `/api/smart-collections/refresh` | Recompute collection membership (`libraryRoutes.js:85`) |
| GET | `/api/smart-collections/:id/items` | Collection item page (`libraryRoutes.js:93`) |
| PATCH | `/api/smart-collections/:id` | Update collection properties (`libraryRoutes.js:108`) |
| POST | `/api/smart-collections/:id/items/:itemId` | Add/remove membership according to body contract (`libraryRoutes.js:117`) |
| GET | `/api/library-care` | Link health and reminder summary (`libraryRoutes.js:131`) |
| POST | `/api/library-care/check-links` | Checks bounded candidate links (`libraryRoutes.js:136`) |
| POST | `/api/items/:id/reminders` | Adds a reminder (`libraryRoutes.js:149`) |
| PATCH | `/api/reminders/:id` | Updates reminder (`libraryRoutes.js:161`) |
| POST/PATCH | `/api/notes`, `/api/notes/:id` | Create/update note and image assets (`libraryRoutes.js:174`, `204`) |
| DELETE | `/api/notes/:id` | Delete note and related assets (`libraryRoutes.js:258`) |
| GET | `/api/items/:id` | Item detail (`libraryRoutes.js:271`) |
| POST | `/api/items/:id/archive` | Starts/updates readable page archive (`libraryRoutes.js:277`) |
| GET | `/api/items/:id/similar-visuals` | Rate-limited visual-similarity ranking (`libraryRoutes.js:295`) |
| PATCH | `/api/items/:id/review` | Saves user review/metadata changes (`libraryRoutes.js:309`) |
| POST | `/api/items/:id/approve` | Approves review and schedules indexing (`libraryRoutes.js:318`) |
| POST | `/api/items/:id/enrich` | Queues a single-item enrichment (`libraryRoutes.js:363`) |
| GET | `/api/graph` | Graph representation (`libraryRoutes.js:425`) |
| GET | `/api/graph/obsidian-export` | Obsidian-compatible graph export (`libraryRoutes.js:432`) |

### Search, Lens, extension, and agent interfaces

| Method | Path | Access | Behavior / implementation |
|---|---|---|---|
| POST | `/api/search` | User + search limiter | Keyword/semantic results (`searchPrivateRoutes.js:37`) |
| POST | `/api/library-chat` | User + search limiter | Answers grounded in bounded library context (`searchPrivateRoutes.js:91`) |
| POST | `/api/enrichment/intent-batch` | User + search limiter | Batch item-intent enrichment (`searchPrivateRoutes.js:18`) |
| POST | `/api/visual-search` | User + search limiter | Image-to-library search (`searchPrivateRoutes.js:127`) |
| POST | `/api/search/feedback` | User + search limiter | Persists relevance feedback (`searchPrivateRoutes.js:179`) |
| POST | `/api/lens/search` | User/extension-compatible route + search limiter | Lens image query (`searchRoutes.js:12`) |
| GET/POST/DELETE | `/api/extension-tokens`, `/api/extension-tokens/:id` | User | Creates/lists/revokes scoped extension tokens (`integrationPrivateRoutes.js:26-62`) |
| GET/POST/DELETE | `/api/agent-access/tokens`, `/api/agent-access/tokens/:id` | User | Creates/lists/revokes agent tokens (`integrationPrivateRoutes.js:64-110`) |
| POST | `/api/extension/saves/link` | Extension token `capture:save` | Saves current page/link (`integrationRoutes.js:125`) |
| DELETE | `/api/extension/saves/:id` | Extension token | Deletes owned save (`integrationRoutes.js:170`) |
| POST | `/api/extension/captures/screenshot` | Extension token + bounded image | Saves and analyzes screenshot (`integrationRoutes.js:191`) |
| POST | `/api/extension/captures/selection` | Extension token | Saves selected text (`integrationRoutes.js:269`) |
| DELETE | `/api/extension/captures/:id` | Extension token | Deletes capture (`integrationRoutes.js:324`) |
| GET | `/api/extension/library/recent` | Extension token | Recent library items (`integrationRoutes.js:343`) |
| GET | `/api/extension/library/search` | Extension token + search limiter | Library lookup (`integrationRoutes.js:352`) |
| GET | `/api/extension/library/status` | Extension token | Token/library status (`integrationRoutes.js:366`) |
| POST | `/api/agent-access/query` | Agent token + search limiter | Scoped query (`integrationRoutes.js:375`) |
| GET | `/api/agent-access/items/:id` | Agent token + search limiter | Retrieves an allowed item (`integrationRoutes.js:386`) |
| POST | `/api/mcp` | Agent token + search limiter | JSON-RPC-style tool list/call (`integrationRoutes.js:397`) |
| POST | `/api/telegram/webhook` | Telegram secret | Captures supported Telegram messages (`integrationRoutes.js:411`) |

### Workflow automation, billing, and callbacks

| Method | Path | Access | Behavior / implementation |
|---|---|---|---|
| GET | `/api/workflows/readiness` | User | Provider/action readiness (`workflowRoutes.js:21`) |
| POST | `/api/workflows/generate` | User + search limiter | Generates workflow plan (`workflowRoutes.js:25`) |
| POST | `/api/workflows/publish` | User | Dispatches an approved publishing action (`workflowRoutes.js:61`) |
| GET | `/api/automations/models` | User | Lists model options (`automationRoutes.js:13`) |
| GET/POST | `/api/automations` | User | Lists/creates automation (`automationRoutes.js:17`, `110`) |
| POST | `/api/automations/draft` | User | Creates constrained draft (`automationRoutes.js:96`) |
| POST | `/api/automations/revise` | User | Revises draft (`automationRoutes.js:103`) |
| PATCH/DELETE | `/api/automations/:id` | User | Updates/deletes owned automation (`automationRoutes.js:165`, `172`) |
| GET | `/api/automation-runs` | User | Lists run history (`automationRoutes.js:76`) |
| GET | `/api/automations/:id/runs` | User | Per-automation run history (`automationRoutes.js:145`) |
| POST | `/api/automations/:id/run` | User | Manually runs validated automation (`automationRoutes.js:152`) |
| GET/POST/PATCH/DELETE | `/api/automation-chats`, `/api/automation-chats/:id`, `/messages` | User | Chat list/create/read/update/message/delete (`automationRoutes.js:36-74`) |
| GET | `/api/automations/gmail/connections` | User | Lists Gmail connections (`automationRoutes.js:117`) |
| POST | `/api/automations/gmail/connect` | User | Creates OAuth-like connection handoff (`automationRoutes.js:122`) |
| GET | `/api/automations/gmail/callback` | Signed-state callback | Verifies state and completes Gmail connect (`automationRoutes.js:185`) |
| POST | `/api/credits/checkout` | User + checkout limiter | Creates Stripe checkout if enabled (`integrationPrivateRoutes.js:112`) |
| POST | `/api/webhooks/stripe` | Stripe signature | Verifies and processes raw Stripe event (`integrationRawRoutes.js:8`) |

## Contract and error cases that Rembr must specify

1. **Ownership:** all user-owned IDs must be authorized against `req.user.id` in the route/workflow/store; a guessed ID must never reveal another user's data. Supabase RLS is a defense-in-depth layer, not a substitute for the application owner check.
2. **Uploads:** reject unsupported extension/MIME, empty files, oversized files, invalid chunk counts, paths outside the user prefix, missing chunks, and note image formats outside the allowlist. Do not log uploaded body contents.
3. **Review and indexing:** preserve `needs_review` until explicit approval; duplicate imports must report parsed/new/skipped counts; force-enrichment must be explicit; retries must not create duplicate jobs.
4. **Deletion:** require export acknowledgement when requesting deletion, expose only redacted public status, permit cancellation only before the irreversible phase, and keep admin processing idempotent/audited.
5. **Provider limits:** distinguish missing provider, invalid key, exhausted quota, transient outage, and invalid model; expose safe public messages while retaining request/correlation IDs.
6. **Webhooks and callback:** validate signatures/state before changing persistence; reject replay/expired state; make event completion idempotent.
7. **Compatibility:** optional store methods currently yield 501 or skipped behavior. Rembr docs and implementation should define capabilities explicitly and specify degraded local-mode behavior.

## Rebuild contract approach

Before implementation, create an OpenAPI 3.1 source contract for the endpoint groups above, including request/response schemas, auth schemes and scopes, standard error envelope, pagination, and idempotency behavior. Verify it against route handlers and focused integration tests in Rembr. This is a proposed improvement: current IScraper route contracts are primarily implicit in Express handlers and tests.


## Related documents

- [Backend architecture](backend-architecture.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
- [Feature acceptance matrix](../rebuild-plan/feature-and-acceptance-matrix.md)
