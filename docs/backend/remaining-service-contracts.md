# Remaining backend service contracts

**Source repository:** `D:/IScraper-main/IScraper-main`  
**Scope:** the assigned remaining service, local extractor entrypoint, and automation repository files listed below.  
**Read status:** full source-file passes completed for every listed file. Function/branch anchors below describe source behavior; they do not imply live provider, DNS, database, or deployment verification. No source files were changed and no tests were run.

## How to interpret this trace

- “Full source read” means the entire tracked file was read. It does not mean every external dependency or production runtime path was independently verified.
- “Unresolved” means a behavior depends on an external contract, upstream validation, schema/RLS/RPC behavior, or a live network/provider that source inspection alone cannot prove.
- Ownership commonly comes from route middleware and injected repositories. Pure helpers in these files generally do not enforce tenant scoping themselves; callers must pass already-scoped rows.
- Rembr design notes below are recommendations, not changes to IScraper.

## Indexing, search, and similarity

### `services/analyzer.js` — fully read

Function map: `appReferer`, `unique`, `firstSentence`, and deterministic `analyzeTextMetadata` (`:30-76`); OpenRouter schema/prompt/response path (`analysisSchema`, `buildOpenRouterAnalysisRequest`, `parseJsonContent`, `parseOpenRouterAnalysisResponse`, `analyzeTextWithOpenRouter`, `mergeAnalysis`, `:77-193`); Gemini media upload/poll/generate and multi-result merge (`:194-259`); search field construction, normalization, token/group matching, scoring, snippets, explanations, filters and ordered search (`:260-421`); exports (`:422-432`).

The deterministic analyzer extracts terms, topics, tools, brands and first-sentence summaries from caption, transcript, OCR and visual description using fixed dictionaries. OpenRouter receives structured item context plus the base analysis and asks for schema-constrained enrichment. Gemini uploads media files, polls processing state every four seconds, generates structured analysis and merges string fields across media. Search in this module is deterministic token/OR-group matching with field weights and exact-phrase bonuses; it is not embedding search. `searchItemsWithDetails` applies type/status/platform/collection filters and returns match explanations/snippets; `searchItems` is its result-list projection.

Callers: indexing worker/service paths consume analysis; `application/searchWorkflow.js` and search routes consume the search helpers. Existing tests are `test/analyzer.test.js` (8 assertions according to the focused test ledger); live OpenRouter/Gemini behavior is not proven by mocks.

Unresolved/design notes: outbound prompts include saved item content and may include URLs; provider retention/privacy must be explicitly decided for Rembr. Provider requests shown here do not impose a request timeout/AbortSignal. Gemini polling has no explicit total deadline and remote uploaded files are not cleaned up in this module. Search query grouping and dictionary coverage are intentionally bounded heuristics; distinguish deterministic text search from semantic retrieval in UI/API contracts.

### `services/embeddings.js` — fully read

`compactText` and `appReferer` (`:1-8`) prepare provider input; `buildEmbeddingContent` (`:9-30`) composes bounded item and analysis text; `parseOpenRouterEmbeddingResponse` (`:31-38`) projects provider output; OpenAI/OpenRouter request functions (`:39-100`) handle missing key/content, POST, response validation and vector extraction; `createEmbeddingWithCredential` (`:101-127`) selects OpenAI explicitly and otherwise OpenRouter; exports (`:128-134`).

The functions produce the first returned embedding from the configured endpoint. Missing usable content/key is represented as `null`; HTTP/parse failures throw generic errors. Provider credential loading and allowed-purpose policy live elsewhere and are not inferred from this helper.

Callers: indexing/search application path builds and persists embeddings; tests: `test/embeddings.test.js` (focused ledger maps request body, parsing and key placement).

Unresolved/design notes: no explicit timeout is set here; generic errors discard useful HTTP status/body context. Rembr should make provider selection, timeout, retry, vector dimension/model metadata and failure-vs-no-content semantics explicit.

### `services/graph.js` — fully read

`slugify`, `safeFileName`, `unique`, `addNode`, and `conceptEntries` (`:1-39`) form stable concept keys and graph entities. `buildKnowledgeGraph` (`:40-90`) includes completed, analyzed items, creates `item:<id>` nodes, concept nodes for topic/tag/brand/tool/person/repository/collection values, aggregates counts and edges, and deduplicates relationships. `wiki`, `buildItemNote`, `buildConceptNote`, and `buildObsidianFiles` (`:91-158`) project graph nodes into Markdown and `graph.json`; exports (`:159-164`).

Callers: `libraryRoutes.js` exposes graph data/export through the library workflow; `test/graph.test.js` covers graph construction/export at unit level. Input ownership is a caller responsibility.

Unresolved/design notes: `safeFileName` strips a limited forbidden-character set and truncates, so normalized collisions are possible. Wiki labels are not fully escaped for Markdown/wiki delimiters. Define collision handling, escaping, size limits and export format stability in Rembr.

### `services/lensSearch.js` — fully read

`cleanLensText` (`:15-18`), `parseLensCrop` (`:19-37`) and `lensQueryFromAnalysis` (`:38-50`) accept PNG/JPEG/WebP data URLs, cap decoded crop bytes at 750 KiB, and form a bounded textual query. `describeLensCrop` (`:51-83`) requires an image-capable credential, sends the decoded image to the provider, parses its analysis and returns the query; exports (`:84-90`).

Caller: `routes/searchRoutes.js` exposes authenticated lens search, then search workflow uses the generated query. Provider execution is external and is not live-verified. No dedicated service test was found; API coverage is in `test/api.test.js`.

Unresolved/design notes: the base64 string is received/decoded before the decoded-size check, so the upstream request-body limit is part of the memory bound. Credentials, provider timeout and route body limit must be verified at the integration boundary.

### `services/visualEmbeddings.js` — fully read

`normalizeVisualEmbedding` (`:3-11`) accepts finite numeric arrays up to a configurable dimension cap (default 2,048) and rejects invalid/truncated vectors. Analysis aliases/model lookup are in `visualEmbeddingFromAnalysis` and `visualEmbeddingModelFromAnalysis` (`:12-32`). Magnitude and equal-dimension cosine behavior are in `vectorMagnitude`/`cosineSimilarity` (`:33-45`); exports (`:46-51`).

Callers: worker/indexing and similarity service paths normalize visual vectors. `test/visualEmbeddings.test.js` covers normalization/cosine; persistence and provider provenance are separate concerns.

Unresolved/design notes: vector model/version compatibility is not enforced beyond dimension equality. Rembr should store model, dimension and normalization/version metadata and avoid comparing incompatible model spaces.

### `services/visualSimilarity.js` — fully read

Text cleaning/tokenization and weighted sparse vectors (`:53-73`); numeric vector/cosine helpers (`:74-103`); visual-surface test and item/query feature projection (`:104-143`); overlap explanations and safe analysis projection (`:144-172`); ranking/filtering/output (`findSimilarVisualItems`, `:173-202`); exports (`:203-210`).

This implementation scores weighted lexical overlap across visual description, OCR, title/summary/source description/caption/topics/tags/brands/tools/collections/platform. It removes URLs/stop words and caps terms. It excludes `needs_review`, requires a visual surface, defaults to a low `.04` threshold and 24 results, adds a small visual-item boost and returns reasons/snippets. It is a separate algorithm from `similarVisuals.js`; caller supplies the candidate list and therefore owns tenant scoping.

Callers: visual search route/application and `test/visualSimilarity.test.js`.

Unresolved/design notes: threshold calibration, ranking fairness and cross-user isolation depend on caller selection. Keep this keyword/feature scorer distinct from embedding similarity in Rembr API naming.

### `services/similarVisuals.js` — fully read

Text/token helpers and visual field inventory (`:1-75`); profile construction (`:76-105`); set intersection/weighted overlap and human-readable reasons (`:106-127`); lexical scoring and vector merge (`:128-167`); candidate filtering/ranking by source item (`findSimilarVisualItems`, `:168-203`); exports (`:204-209`).

This second similarity service scores an item's profile against candidates, with weighted visual fields and keyword overlap. Optional stored embeddings are merged by taking the maximum of lexical baseline and vector score scaled by 1.35. Default threshold is `.16`, result cap 20, and output includes score, reasons and match details. Candidate ownership is not enforced here.

Callers: `routes/libraryRoutes.js` / item-similar flow and `test/similarVisuals.test.js`.

Unresolved/design notes: this overlaps with `visualSimilarity.js` but has different fields, thresholds, ranking and output shape. Rembr should define one shared similarity contract or document two distinct use cases. Ensure repository query is explicitly user-scoped before invoking either helper.

## Content, library and organization

### `services/linkSaver.js` — fully read

`normalizeSavedUrl` (`:31-49`) accepts HTTP(S), normalizes host/www, removes fragment/tracking parameters and sorts query parameters. `buildManualSavedItem` and `parseManualLinkPayload` (`:50-108`) produce a queued saved item with title/caption/collection metadata. Platform matching, deterministic source ID, safe URL projection, clean text/collection, hashtag extraction, hostname block checks and validation error are in `:109-190`; exports `:191-196`.

Callers: import/save-link route and import workflow; `test/linkSaver.test.js` covers canonicalization and manual item shape. The deterministic ID is URL-derived rather than user-derived; persistence must still be keyed/scoped by authenticated user.

Unresolved/design notes: hostname detection uses substring matching rather than registrable-domain/suffix validation, which can label lookalike hosts as a platform. Private-host checks are lexical and do not resolve DNS. Rembr should separate URL canonical identity from platform identity and centralize a DNS-aware SSRF policy for any server fetch.

### `services/notes.js` — fully read

Constants and ID/url helpers (`:4-22`); single-line/body cleaning (`:23-42`); blocked-host policy and link normalization/extraction/deduplication (`:43-94`); request-to-note mapping and caption/preview generation (`:95-124`); note item construction (`:125-154`); image MIME/extension/size/count validation, user-scoped asset storage path and public projection (`:155-185`); exports (`:186-200`).

Notes are synthetic completed items under `iscraper://note/<id>`, default to “My Notes,” cap body at 20,000 chars, collect up to 20 normalized links, and allow at most five PNG/JPEG/WebP/GIF assets up to 5 MiB each. Paths contain user/item IDs and UUID filenames. The public asset projection can include internal ownership/path and should only be returned by authorized workflows.

Callers: `noteAssetWorkflow.js`, library routes and note workflow; API assertions are in `test/api.test.js` and storage tests are tracked in the test ledger.

Unresolved/design notes: MIME/extension checks do not inspect file magic. Host policy blocks selected private IP/localhost forms but is not a general DNS-resolution guard. Asset partial-write cleanup is in the application workflow, not this service; see its existing contract doc.

### `services/libraryCare.js` — fully read

`nowIso`, duplicate-key normalization, public item projection and first-line fallback (`:6-41`); duplicate grouping with deterministic keeper (`:42-68`); broken-link and rediscovery summaries (`:69-107`); bounded link-check candidate selection and public health/reminder projections (`:108-151`); reminder input/date validation (`:152-171`); combined care summary (`:172-188`); host/hash/stable sampling/day/week seed helpers (`:189-223`); exports (`:224-233`).

Duplicate groups use normalized URL, retain the earliest completed item if possible, and expose a public item projection. Broken links join only checks with existing item IDs. Rediscovery includes due pending reminders (up to 12), old items of at least 90 days (up to 8), a stable weekly sample (6) and daily item. Link-check candidates omit notes/recently checked rows and cap work. Reminder status/date parsing rejects invalid/past dates; periods include day/week/month/next day defaults. Care projections include URL and may expose error text after projection, so route authorization and error sanitation still matter.

Callers: `application/libraryWorkflow.js`, library routes; `test/libraryCare.test.js` covers deterministic helper cases.

Unresolved/design notes: UTC-based day/week seeds may differ from user-local expectations. Health checks are snapshots, not proof of permanent availability. Candidate bounds and scheduling durability belong to the workflow/worker contracts.

### `services/smartCollections.js` — fully read

Constants, category/capture rules and pure text/slug/metadata helpers (`:1-154`); item search text and eligible status filter (`:155-183`); candidate accumulation/confidence (`:184-206`); rule, capture, entity, existing collection and platform candidate builders (`:207-317`); generation, minimum two-item threshold, ranking and 30-result cap (`:318-337`); public collection projection, manual exclusion handling and preview (`:338-370`); pinned/count/updated/name sorting (`:371-378`); exports (`:379-386`).

Candidate generation is deterministic: fixed category rules, capture type rules, analyzed entity values, existing saved collections and source platform. `needs_review`, failed and paused items are excluded; categories need at least two members. Membership confidence/reason is the best score per item. Public collection generation metadata and preview items are returned, with callers responsible for scoping collection, memberships and item map by owner.

Callers: library workflow refresh, library routes and UI smart-folder projection; `test/smartCollections.test.js` covers rules, membership/exclusion and sorting.

Unresolved/design notes: naive substring rules can create false positives (e.g. short/common terms); slug collisions can merge semantically distinct labels; confidence is rule-derived, not calibrated probability. Manual exclusions must survive refresh at repository layer. Recommendation: version rule sets and preserve user curation separately from generated state.

### `services/pageArchive.js` — fully read

`PageArchiveError`/factory and public HTTP/port validation (`:17-46`); hostname/address private-range checks, DNS validation and redirect resolution (`:47-102`); bounded HTTP request with DNS re-check, redirect cap, timeout, byte cap, content-type/status validation and HEAD/GET handling (`:103-206`); text/meta/root selection and HTML escaping (`:207-271`); readable text/plain/HTML extraction and archive payload hashing (`:272-353`); capture and reachability health check, including HEAD 405/501 GET fallback (`:354-414`); public projection/status normalization, archive eligibility and exports (`:415-479`).

The archive helper allows public HTTP(S) only, default ports only, rejects localhost and private/reserved IPv4/selected IPv6, resolves all DNS records and rejects mixed public/private results, and repeats lookup in the transport's lookup callback to reduce DNS rebinding risk. Redirect targets are revalidated. Download defaults are 2 MiB, extraction text 60k chars, sanitized HTML 90k chars, 8-second timeout, and four redirects. Non-2xx, too-large, unsupported content types and no-readable-text become typed errors. Link reachability calls 404/410 “broken”; other failures are “unknown.” Archive HTML is rebuilt from escaped text rather than preserving source markup.

Callers: `application/archiveWorkflow.js` and `application/libraryWorkflow.js`; tests: `test/pageArchive.test.js` (4 cases per inventory/ledger), focused on local network fixtures and helper behavior. No live Internet guarantee is implied.

Unresolved/design notes: IPv6 policy is a hand-maintained lexical subset and should be tested against the full IANA special-purpose registry; DNS lookup, TLS/proxy/runtime behavior and hostname corner cases require adversarial tests. HEAD checks can report unknown for servers that do not support HEAD (fallback handles only 405/501). HTML text extraction is heuristic. External fetches should remain isolated and rate-limited.

## Provider and integration helpers

### `services/contentWorkflows.js` — fully read

Text compaction/workflow readiness (`:13-53`); selected reference projection (`:54-76`); deterministic fallback plan (`:77-131`); prompt, output normalization/JSON parsing (`:132-177`); OpenRouter plan generation and fallback for missing key/non-OK response (`:178-213`); Composio readiness gate (`:214-235`); Instagram tool selection (`:236-262`); approved publish dispatch and response projection (`:263-319`); exports (`:320-326`).

Generation includes bounded compact references and returns a fallback plan if the OpenRouter key is missing or HTTP response is non-OK; malformed provider JSON still propagates as failure. Readiness exposes provider/account/config availability. Instagram publish readiness checks Composio key/entity or account mapping, Instagram account/media prerequisites, and explicit `payload.approved`; LinkedIn is marked as prepared/pending tool mapping. Actual execute POST is restricted to ready Instagram action and uses configured Composio endpoint plus API key. The route/UI may offer a readiness check before approval, but this service gate prevents actual publish without approval.

Callers: `workflowRoutes.js` and workflow screen; `test/api.test.js` covers route behavior. Provider/live publish has not been executed or independently verified.

Unresolved/design notes: provider request has no explicit timeout/cancellation here. A fixed tool version can drift; endpoint/config and Composio result shape should be validated. Distinguish plan readiness from irreversible external dispatch, and keep approval server-side and auditable.

### `services/localMlExtractors.js` — fully read

File-path and image-buffer analysis payloads (`:7-63`); shared local extractor POST with AbortController deadline and optional API key header (`:64-83`); analysis allowlist/normalization and vector metadata (`:84-117`); minimized public item context (`:118-129`); endpoint normalization, media-kind/MIME mapping, text/list cleanup (`:130-157`); exports (`:158-162`).

Endpoint comes from trusted configuration, trailing slash is removed, timeout defaults to 30s with a 1s minimum, failures/timeouts surface as errors, and response fields are normalized/capped before merging. Calls can send local filesystem path/filename plus item context, or a base64 image buffer. `_visualEmbedding` remains an internal field for caller handling.

Callers: screenshot/indexing workflows and `test/localMlExtractors.test.js` (4 cases listed in audit ledger).

Unresolved/design notes: endpoint normalization does not enforce scheme/host/locality; config could direct requests to arbitrary network endpoints. File paths/filenames and item context cross the local service boundary. Establish an allowlist, private-network policy, payload limits and response schema; verify callers strip internal vector metadata before public responses.

### `services/telegramCapture.js` — fully read

Webhook secret validation (`:7-21`); update/message normalization (`:22-41`); Telegram entity and text URL extraction with canonical dedupe (`:42-67`); command/token parsers (`:68-82`); bounded reply (`:83-90`); Telegram Bot API `sendMessage` POST (`:91-109`); connect-token hashing (`:110-116`); exports (`:117-124`).

The webhook secret is checked against `x-telegram-bot-api-secret-token`; missing configuration returns 503, wrong/missing secret 401. Parser accepts message, edited message or channel post, takes text/caption, extracts entity-linked and inline URLs and normalizes/deduplicates. Commands support optional `@botname`; connect token is extracted then hashed. Reply sending truncates to 3,900 chars and skips if token/chat/text/fetch unavailable; non-OK Telegram response throws.

Callers: `integrationRoutes.js`; `test/api.test.js` covers integration behavior. `parseTelegramUpdate` itself does not persist or enforce replay/idempotency.

Unresolved/design notes: outbound fetch has no timeout/retry. Telegram update IDs are parsed but replay protection must be guaranteed by caller/store or added as durable idempotency. Secret comparison is ordinary string equality. User/chat binding and who may connect a Telegram chat must be audited at route/store level.

### `services/observability.js` — fully read

Constants and `createObservability` with safe log, capture, error and shutdown closures (`:1-97`); optional PostHog client construction (`:98-113`); request/correlation/action middleware and completion event (`:114-159`); request context/route and trace projections (`:160-185`); route grouping and timing helpers (`:186-246`); request ID/action sanitizers (`:247-255`); recursive property redaction, error categorization and level normalization (`:256-302`); exception-safe PostHog/log sinks and exports (`:303-331`).

Middleware accepts only request IDs matching a bounded safe regex or generates UUID, derives correlation ID, strips unsafe client action chars, attaches timing/cold-start context, echoes headers, and logs request completion. Status >=500 also emits a telemetry event. Sanitizer truncates arrays/depth/string length and redacts keys matching sensitive-name patterns; sink errors do not break request behavior. PostHog defaults to US host when enabled by project key; warnings/errors are captured as events.

Callers: `server.js` middleware plus application/routes via request context; `test/observability.test.js` (6 assertions per ledger).

Unresolved/design notes: redaction is key-name-based; sensitive values under innocuous keys can remain, and query/URL fields are broadly redacted by key. Error-message regex may not catch secrets embedded under unexpected names. User IDs are sent as distinct IDs; verify privacy consent, retention, region and telemetry configuration. `nextRequestIsColdStart` is process-global and only meaningful within one process lifetime.

## Automation persistence and chat

### `services/automationChats.js` — fully read

`createAutomationChats` (`:7-64`) exposes owner-scoped list/get/create/update/delete, chat UUID validation, draft sanitation and message append. `sanitizeDraft` (`:65-72`) runs automation input through `validateAutomationInput` and attaches timestamp. Input/ID/message cleanup and bounded integer helpers plus HTTP error constructor (`:73-99`); exports (`:100-100`).

Creation uses generated UUID, default model/title and authenticated `userId`; update first fetches by owner, validates changed title/model/draft and verifies linked automation belongs to that user. Messages are user/assistant only and text is bounded; initial user message can seed a title. No provider call occurs here. Route middleware supplies identity.

Callers: `automationRoutes.js`, automation chat repository and `test/automations.test.js` / API tests. The chat service itself has no clearly named dedicated test file; assertions are indirect through automation tests/routes.

Unresolved/design notes: repository and SQL RLS determine true isolation; append atomicity/order and retention are external. The sanitizer's draft schema must remain aligned with automation service validation.

### `repositories/automationRepository.js` — fully read

`createAutomationRepository` (`:3-143`) provides Supabase and injected-store implementations: owner-filtered list/get/save, run creation/status/list, all-run pagination and name enrichment, delete, due claim RPC, and lease-token-guarded complete/defer schedule operations. Row encoders (`toAutomationRow`, `toRunRow`, `:144-173`) and decoders (`mapAutomation`, `mapRun`, `:174-194`) map snake_case domain state; exports `:195`.

Supabase list uses user filter, optional trigger/status, sorted/page range; list-all uses exact count, date/status/automation filters and joins names via a second scoped query. Runs seed activity states `received`, optionally `rate_limited`; schedule claim delegates to `claim_due_automations`; completion/defer require matching user/id/lease token. Store adapter delegates each operation without query logic.

Callers: `services/automations.js`; `test/automations.test.js`; SQL/RLS/RPC/lease correctness is documented separately in migration and automation deep trace.

Unresolved/design notes: production atomicity, RPC authorization, lease expiration and `onConflict: id,user_id` uniqueness depend on migrations/database. The Supabase list range requests `start + limit` as inclusive end and then slices to limit (intentional lookahead); verify its page semantics remain stable. Store-adapter behavior parity is not established by this file.

### `repositories/automationChatRepository.js` — fully read

`createAutomationChatRepository` (`:3-88`) maps user-scoped Supabase chat list/get/create/update/message append/delete and injected store equivalents. Supabase `get` loads messages separately filtered by both user and chat, ordered by timestamp then ID. `mapChatSummary`, `mapChat`, `mapMessage` (`:89-114`) normalize database/store rows; exports `:115`.

Callers: `services/automationChats.js`, automation routes. Tests are indirect in `test/automations.test.js` and `test/api.test.js`; migrations/RLS are covered elsewhere.

Unresolved/design notes: appending a message does not visibly update parent chat's `updated_at` in this repository function; database trigger/store behavior may do so and must be checked against schema. Cross-table atomicity and cascade deletion depend on RLS/FK/trigger contracts. A chat can be inserted or updated with automation linkage only because service validation checks owner; repository alone trusts input.

## Worker and local service lifecycle

### `services/workerRuntime.js` — fully read

`createWorkerRuntime` (`:15-28`) creates a local/Supabase store and wraps core runtime; `processIndexingScope` (`:29-43`) constructs/reuses runtime, disables PostHog for scope processing, forwards download options and returns first result; `scanIndexingScopes` (`:44-52`) delegates scope scan; exports (`:53-63`) re-export compatibility helpers from `../runtime/workerRuntime`.

This is a service facade distinct from `src/runtime/workerRuntime.js`. `worker/indexing-runner.js` and worker application paths are callers; `test/workerRuntime.test.js` covers facade behavior. Actual claim/process safety is in core runtime/worker docs.

Unresolved/design notes: return shape uses `results[0]` and can be undefined for empty results; `download || shouldDownload` means either alias enables download. Keep wrapper semantics synchronized with core runtime and callers during rebuild.

### `ml/local-extractor-server.js` — fully read

`runCli` (`:5-22`) creates the local extractor app, listens on configured port/host and registers SIGINT/SIGTERM close-then-exit handlers. Entry point guard and export (`:23-25`).

Local service operations and command invocation are in `ml/localExtractorService.js` and its tests, separately audited. This file is only process bootstrap.

Unresolved/design notes: shutdown has no deadline/error path and exits immediately from close callback. Port/host defaults and bind exposure must be verified in config/service. The entrypoint does not prove local models/OCR binaries are installed or that the service is reachable.

## Contract/testing cross-reference

| File | Direct or closest test evidence | What remains outside that evidence |
|---|---|---|
| analyzer.js | `test/analyzer.test.js` | Live provider retention/timeouts, real media upload lifecycle |
| automationChats.js | `test/automations.test.js`, `test/api.test.js` | Full repository/RLS isolation and message concurrency |
| contentWorkflows.js | `test/api.test.js` | Real OpenRouter/Composio behavior and external side effects |
| embeddings.js | `test/embeddings.test.js` | Live provider latency, dimensions and error semantics |
| graph.js | `test/graph.test.js` | Large graph/export collisions and Markdown edge cases |
| lensSearch.js | `test/api.test.js` | Oversized request body before decode, provider live behavior |
| libraryCare.js | `test/libraryCare.test.js` | Live reachability and durable scheduling behavior |
| linkSaver.js | `test/linkSaver.test.js` | DNS rebinding/registrable-domain edge cases |
| localMlExtractors.js | `test/localMlExtractors.test.js` | Config endpoint trust and actual local model availability |
| notes.js | `test/api.test.js` and store/workflow coverage | File magic validation, cloud storage partial-failure behavior |
| observability.js | `test/observability.test.js` | Real telemetry privacy/retention and all secret value shapes |
| pageArchive.js | `test/pageArchive.test.js` | Global DNS/TLS behavior and full special-address matrix |
| similarVisuals.js | `test/similarVisuals.test.js` | Production tenant scoping/calibration |
| smartCollections.js | `test/smartCollections.test.js` | Long-term curation preservation across persistence refreshes |
| telegramCapture.js | `test/api.test.js` | Replay prevention, live Telegram timeout/retry and account binding |
| visualEmbeddings.js | `test/visualEmbeddings.test.js` | Model-space compatibility and persistence semantics |
| visualSimilarity.js | `test/visualSimilarity.test.js` | Production tenant scoping/calibration |
| workerRuntime.js | `test/workerRuntime.test.js` | Multi-process lease/claim proof is core-runtime/database territory |
| local-extractor-server.js | `test/localExtractorService.test.js` is adjacent | CLI shutdown/bind behavior is not established by service tests |
| automationRepository.js | `test/automations.test.js` | Supabase RLS/RPC/atomicity; store parity |
| automationChatRepository.js | `test/automations.test.js`, `test/api.test.js` | DB trigger/cascade/atomicity and concurrent append behavior |

No tests were run during this source audit. Existing test assertions are mapped in the linked focused test ledger; cited test files are evidence of test presence, not proof of production configuration or external-provider success.

## Rebuild implications for Rembr

1. Make tenant scope an explicit parameter and repository invariant, then pass only scoped records to pure graph/search/similarity/collection helpers.
2. Define stable contracts for deterministic analysis, provider enrichment, embeddings and visual similarity, including timeouts, model/version provenance, redaction and failure semantics.
3. Centralize safe outbound URL fetching (DNS resolution, redirects, address classes, ports, byte/deadline caps) and reuse it for archives, reachability and any server-side link preview.
4. Preserve user curation independently from generated smart-collection suggestions; version rule sets and avoid confidence values that look probabilistic when they are hand-tuned.
5. Model Telegram idempotency, account binding and outbound reply failures explicitly. Persist accepted update IDs before acknowledging side effects.
6. Keep archive/external publish workflows observable and approval-gated; readiness checks must be distinct from dispatch. Preserve request correlation while minimizing telemetry payloads.
7. Treat tests as deterministic contract checks and add separate provider/network/database acceptance checks only when credentials and infrastructure are intentionally available.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
