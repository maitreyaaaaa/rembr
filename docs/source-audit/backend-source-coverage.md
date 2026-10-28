# Backend Source Coverage Ledger

**Repository:** `D:/IScraper-main/IScraper-main`  
**Scope:** `apps/orchestration/src`, `apps/orchestration/test`, and `apps/orchestration/supabase/migrations`.  
**Inventory checked:** 85 source files, 37 tests, 38 SQL migrations.  
**Status:** all 37 test files have been read and mapped at assertion level; no test command was run. Route handlers and all 38 checked-in migration bodies have been traced in focused docs. All 85 source files now have source maps, including a full function/helper map of `supabaseStore.js`; no source row remains pending. “Traced” means the whole file was read and its source behavior mapped; it does not mean live provider, hosted database, or production semantics were verified. Cross-layer discrepancies and unverified hosted behavior remain open.

## Review status definitions

- **Mapped:** file exists, role and module relationship identified.
- **Traced:** source behavior reviewed and described with function/line references.
- **Pending:** requires complete block-by-block pass; avoid claiming behavior solely from filename.
- **Generated/data artifact:** inventory and purpose recorded; line-by-line explanation is not required.

At this checkpoint, route paths and registration order are mapped; core server/auth/HTTP, import/library/worker/runtime, indexing worker, and storage import/parser behaviors are traced in `../backend/backend-architecture.md`, `../backend/indexing-worker-contract.md`, and `../backend/storage-import-flow.md`. Many parser/provider/service/store details are only mapped and need their own deeper trace before this ledger can be closed.

## Source files (85)

### Bootstrap, configuration, HTTP, and application workflows

| File | Role | Status |
|---|---|---|
| `apps/orchestration/src/config.js` | Environment/config defaults and provider/worker settings | Traced; `backend-architecture.md` |
| `apps/orchestration/src/server.js` | Express composition, middleware order, auth, route mounting | Traced; `backend-architecture.md` |
| `apps/orchestration/src/http/auth.js` | User/admin/worker/scoped-token auth gates | Traced; `backend-architecture.md` |
| `apps/orchestration/src/http/errors.js` | Async wrapper and global status/audit error response | Traced; `backend-architecture.md` |
| `apps/orchestration/src/http/rateLimit.js` | IP-based in-memory limiter | Traced; `backend-architecture.md` |
| `apps/orchestration/src/http/security.js` | Security response headers/CSP | Traced; `../backend/service-contracts-data-shaping.md` |
| `apps/orchestration/src/http/uploads.js` | File type, storage path, bucket, chunk, and validation rules | Traced; `backend-architecture.md` |
| `apps/orchestration/src/application/index.js` | Workflow dependency composition | Traced; `../backend/service-contracts-data-shaping.md` |
| `apps/orchestration/src/application/common.js` | Shared clean text, timeout, request capture helpers | Traced; `../backend/service-contracts-data-shaping.md`; timeout does not cancel underlying promise |
| `apps/orchestration/src/application/archiveWorkflow.js` | Page archive retrieval and metadata backfill | Traced; `../backend/service-contracts-data-shaping.md`; durable queue/restart behavior unverified |
| `apps/orchestration/src/application/billingWorkflow.js` | Conditional Stripe client construction | Traced; `../backend/deletion-billing-exports.md` |
| `apps/orchestration/src/application/importWorkflow.js` | Import/link capture orchestration | Traced; `backend-architecture.md` |
| `apps/orchestration/src/application/libraryWorkflow.js` | Review, enrichment, link checks, Smart Collection refresh | Traced; `backend-architecture.md` |
| `apps/orchestration/src/application/noteAssetWorkflow.js` | Note asset operations | Traced; `../backend/service-contracts-data-shaping.md`; partial upload compensation risk documented |
| `apps/orchestration/src/application/screenshotWorkflow.js` | Screenshot/media analysis and provider fallback | Traced; `../backend/service-contracts-data-shaping.md`; provider/live execution unverified |
| `apps/orchestration/src/application/searchWorkflow.js` | Keyword, semantic, AI answer and search event flow | Traced; `../backend/service-contracts-data-shaping.md`; provider/live execution unverified |
| `apps/orchestration/src/application/workerWorkflow.js` | Worker HTTP orchestration and background scheduling | Traced; `backend-architecture.md` |

### Route modules

All route paths are inventoried in `../backend/api-routes-and-contracts.md`; handler-by-handler behavior and major side effects were traced in `../backend/route-handler-audit.md`. Route-specific assertions and store/policy parity remain open.

| File | Route families | Status |
|---|---|---|
| `apps/orchestration/src/routes/accountRoutes.js` | Profile, onboarding, security activity, deletion, credits | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/adminRoutes.js` | Login, users, blocking, audit, feedback, credits, deletion | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/automationRoutes.js` | Automation/chat/run/Gmail callback | Traced; `../backend/route-handler-audit.md`; provider failure and hosted behavior are test gaps |
| `apps/orchestration/src/routes/dataExportRoutes.js` | Data map, export requests/status/download | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/importRoutes.js` | Multipart/chunked import, save links, job controls | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/integrationPrivateRoutes.js` | Token management and billing checkout | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/integrationRawRoutes.js` | Raw Stripe webhook | Traced; `../backend/route-handler-audit.md`; no webhook test found |
| `apps/orchestration/src/routes/integrationRoutes.js` | Extension, agent/MCP, Telegram | Traced; `../backend/route-handler-audit.md`; hosted tenant parity and live provider behavior remain unverified |
| `apps/orchestration/src/routes/libraryRoutes.js` | Items, notes, collections, review, care, graph | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/publicRoutes.js` | Health, package listing, public feedback | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/searchPrivateRoutes.js` | Search/chat/intent/visual search/feedback | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/searchRoutes.js` | Lens search | Traced; `../backend/route-handler-audit.md`; test gaps are listed in the focused assertion ledger |
| `apps/orchestration/src/routes/workerRoutes.js` | Worker processing aliases | Traced; `../backend/route-handler-audit.md`; GET mutation risk documented |
| `apps/orchestration/src/routes/workflowRoutes.js` | Readiness, generation, publish | Traced; `../backend/route-handler-audit.md`; live provider and publish behavior remain unverified |

### Runtime, worker, ML, repositories, and stores

| File | Role | Status |
|---|---|---|
| `apps/orchestration/src/runtime/workerRuntime.js` | Scope discovery, concurrency, pass loop, export and schedule work | Traced; `backend-architecture.md` |
| `apps/orchestration/src/worker/indexing-runner.js` | CLI runner, store choice, preflight, shutdown | Traced; `backend-architecture.md` |
| `apps/orchestration/src/worker/preflight.js` | Production worker requirements | Traced; `backend-architecture.md` |
| `apps/orchestration/src/worker/run-once.js` | One-shot worker entrypoint | Traced: `../backend/local-store-downloader-run-once.md`; 5-line wrapper sets `WORKER_RUN_ONCE` and delegates error/preflight handling to indexing runner |
| `apps/orchestration/src/ml/localExtractorService.js` | Local OCR/transcription/visual extraction HTTP service | Traced; `../backend/local-extractor-service-deep-trace.md`; local filesystem path boundary is high risk |
| `apps/orchestration/src/ml/local-extractor-server.js` | Local extractor CLI process | Traced; full entrypoint/lifecycle map in `../backend/remaining-service-contracts.md`; shutdown deadline and bind exposure unresolved |
| `apps/orchestration/src/repositories/automationRepository.js` | Automation/run persistence mapping | Traced; full repository methods/map in `../backend/remaining-service-contracts.md`; SQL/RPC/lease semantics remain in migration audit |
| `apps/orchestration/src/repositories/automationChatRepository.js` | Automation chat/message persistence mapping | Traced; full repository methods/map in `../backend/remaining-service-contracts.md`; SQL/RLS/trigger/cascade semantics remain unresolved |
| `apps/orchestration/src/stores/localStore.js` | Local persistence adapter | Traced; full 2,677-line method/helper map in `../backend/local-store-downloader-run-once.md`; local-only and single-process limitations documented |
| `apps/orchestration/src/stores/supabaseStore.js` | Supabase persistence adapter and row mapping | Traced; full function/block map (`:1-3547`) in `../backend/supabase-store-contract.md`; multi-call atomicity gaps and `claimStorageImport` runtime defect at `:1157-1179` recorded; live SQL/RLS/RPC behavior is separately audited but not exercised |

### Domain services

| File | Role | Status |
|---|---|---|
| `apps/orchestration/src/services/accountDeletion.js` | Deletion states, public redaction, ordered/idempotent processing | Traced; `../backend/deletion-billing-exports.md`; store-level concurrency and error redaction remain test gaps |
| `apps/orchestration/src/services/agentAccess.js` | Agent item/query projection and JSON-RPC/MCP tools | Traced; `../backend/service-contracts-security-queue.md`; route/tool integration coverage remains a test gap |
| `apps/orchestration/src/services/aiSearch.js` | AI answer/citation normalization and web search | Traced; full file/function map in `../backend/ai-search-service-deep-trace.md`; unit assertions linked; live provider behavior unverified |
| `apps/orchestration/src/services/analyzer.js` | Deterministic and model-backed analysis | Traced; full function map in `../backend/remaining-service-contracts.md`; provider privacy, timeout and remote media cleanup unresolved |
| `apps/orchestration/src/services/auditLog.js` | Security/support event recording and redaction | Traced; `../backend/service-contracts-security-queue.md`; adversarial redaction cases remain untested |
| `apps/orchestration/src/services/automationChats.js` | Chat state and model-led automation drafts | Traced; full function map in `../backend/remaining-service-contracts.md`; repository/RLS/message concurrency remain external |
| `apps/orchestration/src/services/automations.js` | Validation, Gmail reads, OAuth-like state, runs/schedules | Traced; full file/function map in `../backend/automations-service-deep-trace.md`; repository methods, live Composio behavior and distributed lease semantics remain independently unverified |
| `apps/orchestration/src/services/contentHashes.js` | Content identity/hash creation | Traced; `../backend/service-contracts-data-shaping.md`; schema versioning policy remains open |
| `apps/orchestration/src/services/contentWorkflows.js` | Content workflow generation and publish dispatch | Traced; full readiness/approval/dispatch map in `../backend/remaining-service-contracts.md`; live OpenRouter/Composio behavior unverified |
| `apps/orchestration/src/services/credentials.js` | Provider credential encryption and use | Traced; complete helper map in `../backend/providers-and-credentials.md`; no production callsites found; rotation and adversarial tests are design gaps |
| `apps/orchestration/src/services/credits.js` | Credit package normalization and price formatting | Traced; complete helper functions in `../backend/deletion-billing-exports.md`; balance/ledger logic belongs to stores/routes/RPCs and is audited separately |
| `apps/orchestration/src/services/dataExportPipeline.js` | Async data export build/status/artifacts | Traced; `../backend/deletion-billing-exports.md`; export media and partial-failure cases remain untested |
| `apps/orchestration/src/services/downloader.js` | Media/page download logic | Traced: `../backend/local-store-downloader-run-once.md`; yt-dlp helper and worker call mapped; explicit URL/path/size/timeout controls absent in helper |
| `apps/orchestration/src/services/embeddings.js` | Text embedding requests and provider fallback | Traced; full request/response map in `../backend/remaining-service-contracts.md`; timeout and provider error fidelity unresolved |
| `apps/orchestration/src/services/exportParser.js` | Import format dispatch/normalization | Traced; `../backend/storage-import-flow.md`; parser edge cases remain untested |
| `apps/orchestration/src/services/extensionTokens.js` | Scoped token creation/hash/revocation | Traced helper functions; `../backend/service-contracts-security-queue.md`; no dedicated test file found; route/store lifecycle gaps are listed in the audit |
| `apps/orchestration/src/services/graph.js` | Entity/relationship graph generation | Traced; full graph/export function map in `../backend/remaining-service-contracts.md`; filename collisions and wiki escaping unresolved |
| `apps/orchestration/src/services/instagramParser.js` | Instagram export parsing | Traced at dispatch/normalization level; `../backend/storage-import-flow.md`; additional format variants remain untested; all test assertions are mapped |
| `apps/orchestration/src/services/itemList.js` | Item filtering/sort/page helpers | Traced; `../backend/service-contracts-data-shaping.md`; no dedicated unit test exists |
| `apps/orchestration/src/services/lensSearch.js` | Lens query provider integration | Traced; full image/query/provider map in `../backend/remaining-service-contracts.md`; upstream request-body cap and live provider behavior unresolved |
| `apps/orchestration/src/services/libraryCare.js` | Link candidate health/reminder summary rules | Traced; full duplicate/health/reminder/rediscovery map in `../backend/remaining-service-contracts.md`; live reachability/scheduling remain external |
| `apps/orchestration/src/services/linkSaver.js` | URL normalization/manual capture parsing | Traced; full normalization/capture map in `../backend/remaining-service-contracts.md`; suffix-based platform and DNS policy gaps documented |
| `apps/orchestration/src/services/localMlExtractors.js` | Calls optional local ML extractor | Traced; full payload/timeout/normalization map in `../backend/remaining-service-contracts.md`; configured endpoint trust and live extractor remain unresolved |
| `apps/orchestration/src/services/notes.js` | Note validation/assets/domain logic | Traced; full note/link/asset map in `../backend/remaining-service-contracts.md`; file magic and storage compensation are external concerns |
| `apps/orchestration/src/services/observability.js` | Request context, timing, logs/telemetry | Traced; full middleware/sanitization map in `../backend/remaining-service-contracts.md`; telemetry privacy/retention and redaction completeness unresolved |
| `apps/orchestration/src/services/onboarding.js` | Onboarding input validation/state | Traced; `../backend/service-contracts-data-shaping.md`; direct validation cases remain untested |
| `apps/orchestration/src/services/pageArchive.js` | Web-page snapshot retrieval/normalization | Traced; full SSRF/redirect/size/extraction map in `../backend/remaining-service-contracts.md`; IPv6 registry coverage and live network behavior unresolved |
| `apps/orchestration/src/services/pinterestParser.js` | Pinterest export parsing | Traced at dispatch/normalization level; `../backend/storage-import-flow.md`; additional format variants remain untested; all test assertions are mapped |
| `apps/orchestration/src/services/profiles.js` | Profile input validation | Traced; `../backend/service-contracts-data-shaping.md`; avatar content edge cases remain untested |
| `apps/orchestration/src/services/providerClients.js` | AI provider HTTP requests and output normalization | Traced; full function map in `../backend/providers-and-credentials.md`; provider error/timeout behavior and live authorization unverified |
| `apps/orchestration/src/services/providers.js` | Provider allowlists/config validation/URL checks | Traced in `../backend/providers-and-credentials.md`; validation edge cases remain untested |
| `apps/orchestration/src/services/queue.js` | Pure job state, lease and retry rules | Traced; `../backend/service-contracts-security-queue.md`; boundary/gap notes recorded |
| `apps/orchestration/src/services/rateBudgets.js` | Shared DB-based AI/request budgets | Traced; `../backend/service-contracts-security-queue.md`; Supabase atomicity/RPC parity remains unverified |
| `apps/orchestration/src/services/similarVisuals.js` | Candidate selection/fallback for visual similarity | Traced; full lexical/vector ranking map in `../backend/remaining-service-contracts.md`; caller scoping and calibration external |
| `apps/orchestration/src/services/smartCollections.js` | Collection matching and membership rules | Traced; full rules/membership/projection map in `../backend/remaining-service-contracts.md`; false positives and curation persistence documented |
| `apps/orchestration/src/services/sourceDates.js` | Source date normalization | Traced; `../backend/service-contracts-data-shaping.md`; malformed component cases remain untested |
| `apps/orchestration/src/services/storageImports.js` | Storage-backed import coordination | Traced; `../backend/storage-import-flow.md`; malformed-input and partial-write cases remain untested |
| `apps/orchestration/src/services/telegramCapture.js` | Telegram webhook request validation/capture | Traced; full secret/parser/reply map in `../backend/remaining-service-contracts.md`; durable replay protection and live Telegram behavior unresolved |
| `apps/orchestration/src/services/userDataRegistry.js` | User data category/retention registry | Traced; `../backend/service-contracts-data-shaping.md`; export/deletion/migration parity remains an implementation cross-check |
| `apps/orchestration/src/services/visualEmbeddings.js` | Visual embedding normalization/storage contract | Traced; full normalization/model/cosine map in `../backend/remaining-service-contracts.md`; model-space compatibility unresolved |
| `apps/orchestration/src/services/visualSimilarity.js` | Vector normalization and ranking | Traced; full feature/ranking map in `../backend/remaining-service-contracts.md`; candidate scoping and calibration belong to caller |
| `apps/orchestration/src/services/worker.js` | Claim/process/update/retry indexing pipeline | Traced; `../backend/indexing-worker-contract.md`; worker/billing assertions are mapped in `test-audit-supplement-stores-billing.md` |
| `apps/orchestration/src/services/workerRuntime.js` | Worker facade/runtime compatibility helpers | Traced; wrapper/core relationship and return/download semantics in `../backend/remaining-service-contracts.md`; core distributed claim behavior documented separately |
| `apps/orchestration/src/services/xBookmarksParser.js` | X bookmarks export parser | Traced at dispatch/normalization level; `../backend/storage-import-flow.md`; additional format variants remain untested; all test assertions are mapped |

## Backend tests (37)

These names were inventoried; assertion-level coverage must be inspected before treating behavior as tested.

| Test file | Apparent focus from test name |
|---|---|
| `agentAccess.test.js` | Scoped agent/MCP access | Fully read: 3 tests cover projection/raw omission, citation guidance/rank, initialize/list; tool calls, errors, bounds, tenant isolation untested. `../backend/service-contracts-security-queue.md` |
| `aiSearch.test.js` | AI search answer/citations | Fully read: 11 tests; see `../backend/test-audit-supplement-small.md` for assertions and uncovered behavior |
| `analyzer.test.js` | Deterministic/model analysis | Fully read: 8 tests; see `../backend/test-audit-supplement-small.md` |
| `api.test.js` | HTTP routes, middleware, integration contracts | Fully read: 73 test cases mapped with assertions and route/source gaps in `../backend/api-test-assertion-audit.md`; no Stripe webhook case |
| `automations.test.js` | Automation validation, connect/run/schedule | Fully read: 19 cases cover validation, scoped read-only Gmail tool, generation/run budgets, signed state, schedules/leases, route isolation, pagination and mock modes; provider live behavior and production distributed claims remain unproven. `../backend/focused-test-assertion-ledger.md` |
| `billing.test.js` | Credits and billing operations | Fully read: two local-store assertions cover zero starting allowance and one paid usage decrement. `../backend/focused-test-assertion-ledger.md` |
| `contentHashes.test.js` | Hash stability/dedupe behavior | Fully read: 2 tests cover normalized metadata/path invariance and whitespace normalization. `../backend/focused-test-assertion-ledger.md` |
| `credentials.test.js` | Credential encryption/redaction | Fully read: encrypt/decrypt under same key, ciphertext differs/no plaintext, mask hint; key rotation, invalid/tampered data, production callsites untested. `../backend/providers-and-credentials.md` |
| `embeddings.test.js` | Provider embedding behavior | Fully read: content composition, response parse, OpenRouter/OpenAI request body and API-key not in body. `../backend/focused-test-assertion-ledger.md` |
| `exportParser.test.js` | Import parser dispatch | Fully read: nested Instagram saved post selection and X bookmark.js dispatch; variants/malformed archives pending. `../backend/focused-test-assertion-ledger.md` |
| `graph.test.js` | Knowledge graph output | Fully read: indexed item/concept graph and Obsidian note/wikilink/JSON output; escaping/cardinality pending. `../backend/focused-test-assertion-ledger.md` |
| `instagramParser.test.js` | Instagram export variants | Fully read: 6 tests; see `../backend/test-audit-supplement-small.md`; parser variants and malformed inputs remain gaps |
| `libraryCare.test.js` | Link health/reminders | Fully read: 4 tests cover duplicate grouping, 404 vs 403, reminder date rules, fresh-check/note exclusion and URL normalization. `../backend/focused-test-assertion-ledger.md` |
| `linkSaver.test.js` | URL capture and normalization | Fully read: 4 tests cover tracking normalization, unsafe/local URL rejection, deterministic X item metadata and platform IDs. `../backend/focused-test-assertion-ledger.md` |
| `localExtractorService.test.js` | Local extractor request handling | Fully read: 8 tests; see `../backend/focused-test-assertion-ledger.md`; subprocess limits/failure behavior remain gaps |
| `localMlExtractors.test.js` | Extractor client/fallback behavior | Fully read: 4 cases cover media/image request construction, normalized text metadata, empty extraction handling, and internal visual embedding metadata. `../backend/focused-test-assertion-ledger.md` |
| `localStore.test.js` | Local adapter persistence | Fully read: all 7 assertions and untested store domains mapped in `../backend/local-store-downloader-run-once.md` |
| `observability.test.js` | Request context/timing/telemetry | Fully read: six tests cover ID validation, redaction, disabled/failing PostHog behavior, route groups and request timing fields. `../backend/focused-test-assertion-ledger.md` |
| `pageArchive.test.js` | Archive fetch behavior | Fully read: 4 cases cover HTML cleanup, loopback blocking, eligibility, and metadata patch precedence. `../backend/test-audit-supplement-queue-runtime.md` |
| `providers.test.js` | Provider configuration/validation | Fully read: 7 cases cover defaults/purpose allowlist, media model list, URL normalization/private host rejection and provider credential smoke endpoints. `../backend/focused-test-assertion-ledger.md` |
| `queue.test.js` | Job lifecycle/retry helpers | Fully read: 7 tests cover create/dedupe, queue pick, restartability, retry due, max attempts; lease boundaries and summary untested. `../backend/service-contracts-security-queue.md` |
| `rateBudgets.test.js` | Shared budget policy | Fully read: 3 tests cover fixed windows, denied counter behavior, isolation, local concurrency, missing-store fail-closed; Supabase RPC/429 error paths untested. `../backend/service-contracts-security-queue.md` |
| `rateLimit.test.js` | IP limiter behavior | Fully read: 3 tests cover threshold/429, pluggable store namespace and resolved IP precedence. `../backend/focused-test-assertion-ledger.md` |
| `screenshotWorkflow.test.js` | Screenshot analysis workflow | Fully read: 3 cases cover budget gating, local-first extraction, paid fallback and credit consumption. `../backend/focused-test-assertion-ledger.md` |
| `securityScripts.test.js` | Security boundary scripts | Fully read: 8 tests cover RLS/route inventory findings, aggregate-only audit rendering, safe load auth failure, sanitized sign-in, preflight profile/success and classification. `../backend/focused-test-assertion-ledger.md` |
| `similarVisuals.test.js` | Similar item ranking/fallback | Fully read: 3 tests; see `../backend/test-audit-supplement-small.md` |
| `smartCollections.test.js` | Dynamic collection rules | Fully read: 7 cases cover generated categories, personalization/suppression, source groups, persisted edits/hide/exclusions, and API tenant isolation. `../backend/test-audit-supplement-queue-runtime.md` |
| `storageImports.test.js` | Storage import integration | Fully read: local duplicate preservation/job queue/file cleanup path; no Supabase claim adapter coverage. `../backend/focused-test-assertion-ledger.md` |
| `supabaseStore.test.js` | Supabase query/helper behavior | Fully read: all 11 mocked tests mapped in `../backend/test-audit-supplement-stores-billing.md`; `claimStorageImport` is not covered; live SQL/RLS/atomicity unverified |
| `visualEmbeddings.test.js` | Vector normalization/persistence | Fully read: two tests cover conversion/rejection, cosine basics/dimension mismatch, metadata extraction and default model. `../backend/focused-test-assertion-ledger.md` |
| `visualSimilarity.test.js` | Similarity math/ranking | Fully read: three tests cover metadata ranking, exclusion rules, tokenization and output limits. `../backend/focused-test-assertion-ledger.md` |
| `worker-billing.test.js` | Fully read: 9 cases cover basic/enriched/local-ML indexing, content hash reuse, embedding reuse, concurrency and retry/exhaustion. `../backend/test-audit-supplement-stores-billing.md`; live provider and distributed behavior unverified |
| `worker-leases.test.js` | Lease/reclaim/retry behavior | Fully read: 3 cases cover batch claim/concurrency, expired lease reclaim, and retry/max-attempt filters; Supabase parity/fencing/races pending. `../backend/test-audit-supplement-queue-runtime.md` |
| `worker.test.js` | Provider-plan selection | Fully read: three plan-selection tests; core claim/retry/partial-write coverage is in worker-* files. `../backend/focused-test-assertion-ledger.md` |
| `workerOperations.test.js` | Job operations/restart paths | Fully read: 6 cases cover preflight redaction, local pass/status aggregation, one-shot runner, shutdown wake, and deployment blueprint. `../backend/test-audit-supplement-queue-runtime.md` |
| `workerRuntime.test.js` | Loop, caps, concurrency and status | Fully read: 3 cases cover cross-scope cap, status counts/redaction, and injected-sleep loop stop. `../backend/test-audit-supplement-queue-runtime.md` |
| `xBookmarksParser.test.js` | X bookmark parsing | Fully read: 5 tests; see `../backend/test-audit-supplement-small.md` |

## Database migrations (38)

All 38 migration bodies were read and summarized file-by-file in [`sql-migration-ledger-detailed.md`](../backend/sql-migration-ledger-detailed.md). High-risk function/ACL/tenant policy notes are also summarized in [`critical-migration-contracts.md`](../backend/critical-migration-contracts.md). This is checked-in SQL only; actual hosted migration versions and effective role grants remain unverified, so deployment verification is still open.

## Completion rule

Mark an entry **Traced** only after reading the whole file, following its relevant callees/callers, recording line anchors, mapping associated tests, and noting error and authorization behavior. Static names, route declaration scans, a green test suite, and REA output alone do not satisfy this gate. Keep the overall backend audit open until all source files, tests, and migration semantics are reviewed and reconciled with the frontend/API contract documentation.


## Related documents

- [Extension source coverage](extension-source-coverage.md)
- [Support-code coverage](support-code-coverage.md)
- [UI source coverage](ui-source-coverage.md)
- [REA static-analysis record](rea-static-analysis.md)
