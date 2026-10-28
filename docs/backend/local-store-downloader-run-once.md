# Local store, downloader, and one-shot worker entrypoint

## Scope and evidence

Reference files read end-to-end:

- `apps/orchestration/src/stores/localStore.js` (2,677 lines)
- `apps/orchestration/src/services/downloader.js` (28 lines)
- `apps/orchestration/src/worker/run-once.js` (5 lines)
- `apps/orchestration/test/localStore.test.js` (417 lines; seven tests)
- `apps/orchestration/test/supabaseStore.test.js` (382 lines; eleven top-level tests)

Source locations below refer to the checked-out IScraper repository and will shift if that source changes. Tests were read, not executed. The local adapter is a developer/test/demo implementation. It is not equivalent to Supabase transactions, storage, auth, or multi-worker coordination.

## `localStore.js` module and state construction

### Imports and shared helpers (`:1-352`)

- Imports Node `fs`, `path`, and `crypto`, plus domain helpers for queue/job states, analysis/search, credits, profiles, tokens, deletion, onboarding, assets/archives, list paging, smart collections, link care, audit metadata, source dates, and in-memory rate budgets (`:1-33`). This makes the persistence adapter responsible for a large amount of domain shaping.
- Local identity default is `local-dev-user` (`:35`). `now()` returns UTC ISO strings (`:37-39`). `readJson()` returns the supplied fallback for absent files, otherwise parses the complete UTF-8 JSON file (`:41-44`). `writeJson()` makes the parent directory and synchronously rewrites the entire pretty-printed state file (`:46-49`).
- `seedFromLegacyIndex()` imports a legacy `index.json` into one synthetic local user and translates Instagram fields, collections, status, timestamps, and available analysis fields (`:51-132`). Existing legacy rows receive local ownership; no cross-user partition exists in the old file.
- `emptyState()` provides arrays for the supported local domains, defaults credit packages, and omits a number of Supabase-only capabilities such as actual storage/auth (`:134-170`). `normalizeState()` merges old JSON with defaults, converts jobs to include lease/retry fields, fills missing arrays, and normalizes credit packages (`:172-214`). This is compatibility normalization, not schema validation or migration versioning.
- `normalizeJob()` adds null lease/timing defaults then overlays stored job fields (`:216-227`). `adminUserSummary()` derives profile/admin/item-status/usage summaries by scanning arrays (`:229-265`).
- `localItemAssets`, `localItemArchive`, and `hydrateLocalItem` enforce user/item filters and remove private analysis metadata from public item projections; archive content is opt-in (`:267-287`). `publicAnalysis()` copies approved analysis fields only (`:289-305`).
- `publicRefForUser()` uses a truncated SHA-1-derived support reference, not an authentication secret (`:307-309`). `referenceIdFor()` strips characters and truncates trace identifiers (`:311-314`). `publicDataExportRequest()` exposes request state and ordered per-category steps, but also includes user ID, error message, and metadata for its trusted callers (`:316-336`). `publicCaptureConnection()` strips token hash (`:338-351`).

### Construction, user setup, smart collections, and shared helpers (`:353-456`)

`createLocalStore({dataPath})` reads `brain.local.json`; when absent it uses the legacy seed/empty state. It creates an in-process `Map` for rate budgets (`:353-356`). Every method closes over this one mutable `state` object. `save()` synchronously rewrites the full state. `ensureUser()` checks the local deletion tombstone before creating/updating a user; `ensureUserRecord()` derives a support reference and updates last-seen/email fields (`:362-391`). `assertUserNotDeleted()` compares hashed user ID or email and throws a 410 when a tombstone matches (`:393-404`).

`smartCollectionItemMap()` hydrates only a user's items; `publicLocalSmartCollection()` scopes membership rows to collection owner/ID before projection (`:406-417`). `activeSmartCollectionItemIds()` combines auto/manual included memberships and then removes manual excludes (`:419-429`). Deletion helpers map requests plus chronologically sorted steps, locate the newest active request, and filter a named state array by `userId` (`:431-455`).

## Store API by method group

### Rate budget and automation domain (`:457-679`)

- `ensureUser`, `ensureUserRecord`, and `assertUserNotDeleted` expose setup/tombstone checks. `consumeRateBudget()` calls the in-memory budget helper; counts are process-local and reset on process restart (`:462-464`).
- Mock Gmail connection methods create/read one in-memory connection per user (`:466-477`); this is a local mock and is not live OAuth.
- Automation CRUD/list methods scope by `userId`, filter trigger/status, sort and paginate. Save upserts on `(userId,id)` and preserves creation time; runs begin in `running` with `received` activity; the rate-limited constructor writes a `rate_limited` terminal record (`:479-545`). Run readers bound per-automation limits, add automation names for all-run lists, and filter dates/status/id (`:548-574`).
- Automation chats are owner-scoped; messages sort by creation and append only when an owned chat exists. Deleting a chat removes its messages. Deleting an automation removes its runs but leaves linked chat and sets `automationId=null` (`:576-640`).
- `claimDueAutomations()` filters active scheduled automations due now and without a live schedule lease, sorts, bounds to 10, and stores a ten-minute lease token in local state (`:642-655`). Completion/defer require matching token; completion schedules the next run with an interval clamped from 60 to 43,200 minutes; defer accepts only parseable retry timestamps (`:657-678`). There is no cross-process atomic claim in this JSON adapter.

### Account deletion and data export (`:680-1251`)

- Deletion request methods derive active status from `ACTIVE_DELETION_STATUSES`, dedupe by returning the existing active request, hash ID/email, cap reason at 500 chars, record request/correlation IDs, and append activity. User cancel is limited to requested/frozen/pending-approval; admin approval permits requested/frozen/pending/failed/partially-failed; admin cancel refuses executing/completed/logged (`:680-834`). `markDeletionRequestExecuting()` does not atomically claim a request or reject a second executing worker. The local state file is single-process only.
- `recordDeletionStep()` creates per-request/per-key steps, increments attempts and started time on `running`, sets finished time for completed/failed/skipped, merges metadata, then synchronously saves (`:836-872`).
- `freezeUserForDeletion()` revokes extension tokens, disables provider credential rows, and marks queued/downloading/analyzing/paused jobs failed while clearing lease/retry fields. It is one in-memory pass and one file save (`:874-907`).
- Local `deleteUserStorageObjects()` is a no-op returning `{skipped:true}` and `deleteAuthUser()` is a synthetic success; neither deletes real object storage nor an Auth user (`:909-911`, `:968-970`). Rembr must never present this local behavior as production deletion.
- Content/access/profile deletion filter user-owned arrays. Profile cleanup also removes export steps whose request belonged to the user. The sequence is split across calls, not transactional (`:913-966`). `completeDeletionRequest()` writes hash-based audit/tombstone rows, removes the local user, and detaches the request (`:972-1003`).
- `getPrivacyExport()` returns user items/archives/link checks/reminders/imports/collections, credits, extension-token projection, capture connections, search data, activity/usage, profile/onboarding, and active deletion request (`:1005-1033`). `getDataExportPayload()` adds item assets, automations/chats/runs, billing ledgers, and export requests (`:1059-1092`). Compare both projections with the canonical user-data registry during Rembr design; the first privacy projection and full ZIP payload have different shapes.
- Export requests begin `requested`, include an include-files metadata flag, and write activity. `claimDataExportRequests()` changes the earliest requested rows to `building`; with no database/lease predicate this is not safe for multiple processes. Expiration changes only ready requests to expired; building rows have no stale recovery (`:1094-1172`). Status transition helpers can set building/ready/failed without an execution token (`:1174-1206`).
- `upsertDataExportStep()` upserts by request/category. `saveDataExportArtifact()` stores the whole ZIP as Base64 in `brain.local.json`; read is owner/request scoped and decodes it. This is local-only and can greatly inflate/rewrite the state file. `downloadUserStorageObject()` returns null (`:1208-1251`).

### Admin, profile, integration credentials, and feedback/search events (`:1253-1554`)

- Admin status defaults to active; block/unblock updates the user admin state, logs an activity event, then returns the composed admin user detail (`:1253-1278`). Authorization is not implemented by this store method; the route/auth layer must guard it.
- Profile read/write is user-scoped and uses `normalizeUsername`; duplicate username produces a 409. Onboarding stores content types/referral/skipped/completed timestamps and returns the public projection (`:1280-1342`).
- Extension-token methods persist token hash/scopes/expiry, expose `publicExtensionToken`, revoke by owner and record selected activity. Lookup requires hash, non-revoked/unexpired status and required scope, updates last use, then returns owner ID/email (`:1344-1386`).
- Capture connection upsert normalizes provider/external ID, searches globally by that pair, then may update stored `userId` and token hash. It does not itself prove the token belongs to the supplied user; require the application contract or a composite same-owner invariant. Reads by provider/external ID omit revoked rows; mark-used is by connection ID alone; revoke is by provider/external ID. Public projection excludes token hash (`:1388-1459`).
- Lens search events append owner/query type/result count (`:1462-1473`). Public feedback stores a bounded, whitespace-normalized anonymous feature/message; readers omit hidden entries, admin readers see all and status mutation is by feedback ID (`:1475-1509`).
- Search events bound query length and retained result IDs to 30; search feedback requires an owned item and an owned event containing that item ID, otherwise 404/400 (`:1511-1553`).

### Imports, saved items, assets, and library care (`:1555-1881`)

- `createImport()` stores source/mode/file names/status/storage references and activity; ID is timestamp-derived (`:1555-1579`). `getImport()` owner-scopes. Pending storage imports filter `queued_storage`; `claimStorageImport()` changes the selected row to `processing_storage`; `updateImportStatus()` records activity with error category, not raw-category only (`:1581-1615`). The local claim is serialized only by the JavaScript event loop in one process.
- `upsertImportData()` creates user-scoped collection rows, finds duplicates by owner plus ID or URL, either skips or merges existing metadata/collections, and creates new items with initial status and `createdAtForImportedItem` source-date logic. It saves once after all parsed rows; existing merges are not included in the returned newly-created array (`:1617-1657`).
- `updateSavedItem()` checks item ownership and allowlists mutable fields plus note; `createNoteItem()` forces owner and clears analysis; asset creation verifies parent ownership and public-projection path; item/archive readers owner-scope (`:1659-1758`).
- Link-health upsert verifies owner/item and carries source/final URLs, status, HTTP/error fields and timestamps (`:1760-1789`). Reminder create verifies item owner and dedupes pending entries on owner/item/reason/date; update is owner-scoped, while `removeItemAssets()` filters by owner and item and optional ID list (`:1791-1847`).
- `deleteSavedItem()` removes item, jobs, search feedback, assets, archive, visual embeddings, link checks, reminders, and smart collection memberships for that owner, then returns a hydrated copy (`:1849-1863`). It does not directly delete actual storage objects; workflow/storage cleanup must occur separately.
- `createJobs()` derives trace IDs from explicit or import metadata and calls `createJobsForImport`, then stores owner/source action (`:1865-1881`).

### Library, Smart Collections, and processing jobs (`:1883-2288`)

- `getItems()` hydrates all user's items; `listItemsPage()` delegates to shared filter/sort/cursor code (`:1883-1889`). Avoid unbounded `getItems()` in user-facing list paths.
- `refreshSmartCollections()` generates candidate groups from current user items, upserts collection metadata, removes `auto` memberships only for candidate collections, preserves manual excludes, adds missing auto memberships, saves and returns visible collections (`:1891-1959`). This is a multi-array update with no rollback; collections that disappear from candidate generation may retain stale auto memberships because only current candidate IDs are cleared.
- Collection list filters owner/hidden state, drops empty groups, sorts and caps results. Item listing checks collection owner and applies manual override set. Update sanitizes names/descriptions and pin/hidden flags; override validates collection and item ownership then replaces prior manual override and can set include/exclude/auto (`:1961-2022`).
- `getItem` includes archive content; `getJobs` and `getJob` filter by user and optional import/ID (`:2024-2053`). `getProcessableJobScopes()` selects reclaimable jobs via shared queue helpers, calculates active leases by owner, groups one scope per user/import, and respects the requested scope count (`:2032-2049`).
- `claimNextJobs()` calculates active per-user leases, selects eligible jobs sorted oldest-first, bounds limit/concurrency, assigns downloading state, increments attempts, creates UUID lease/fencing tokens and expiry, clears old errors/retry time, then saves (`:2055-2094`). Unlike Supabase RPC claims, it is not safe across processes and does not coordinate a DB advisory/row lock.
- `updateJob()` owner-scoped patch; `updateClaimedJob()` additionally requires matching non-empty lease token; `claimJob()` transitions only queued jobs. `restartJobs()` uses shared restart eligibility and resets job/item state (`:2096-2145`).
- `getIndexingSummary()` reclassifies stale active leases as queued, distinguishes retry due/future, exhausted/retryable failures, review items and pause reasons; `getWorkerQueueStatus()` delegates summary math (`:2147-2184`).
- Analysis metadata and visual embedding functions store hashes/model/dimensions in local derived collections. `saveAnalysis()` strips internal metadata/vector fields from public analysis, stores processing hashes separately, marks done, saves, refreshes smart collections, and returns hydrated detail (`:2186-2267`). Failure/status methods update item error/status and save (`:2269-2288`).

### Search, credits, audits, and administrative projections (`:2289-2663`)

- Search delegates hydrated owner data to shared `searchItemsWithDetails` (`:2289-2291`). Credit packages are normalized and filtered active; purchase creation is timestamp-ID-based and pending; session update and completion mutate the matching purchase. Completion locates by purchase ID **or** checkout session, returns if missing/already completed, then adds a positive credit transaction (`:2293-2353`). This local adapter is not authoritative for Stripe/payment validation.
- Credit balance counts distinct `free` item usage and sums all paid credit transactions; `recordUsage()` dedupes by owner/item/source, writes usage/activity, debits one paid credit, then saves (`:2355-2402`). Multi-step changes are not transactional or concurrency-safe.
- User activity and security audit sanitize metadata before saving; security audit requires event type, accepts actor/target/request/route hashes/metadata and returns the saved row (`:2404-2453`). `addCreditTransaction()` validates non-zero integer and nonnegative result, records activity; admin adjustment wraps it and appends adjustment row (`:2455-2501`).
- Admin summary/list/detail/import/activity methods aggregate across all local users for support; they rely on privileged route-level authorization. User timeline/security activity scope to the target, redact projection fields and cap limits (`:2503-2659`). `dump()` returns the raw in-memory state, including private fields, and must remain test/internal-only (`:2661-2664`).
- `staleActiveJobStatus()` reports expired downloading/analyzing jobs as queued; module exports only `createLocalStore` and default local user ID (`:2667-2677`).

## Downloader (`services/downloader.js`)

- Imports `path`, `fs`, and `yt-dlp-exec` (`:1-3`). `downloadInstagramMedia({url,outputDir,id})` builds output template with `path.join(outputDir, `${id}-%(playlist_index)s.%(ext)s`)`, calls yt-dlp for the preferred MP4 video/audio combination, suppresses warnings, and returns matching output paths plus stdout/stderr (`:5-18`).
- `findDownloadedFiles()` returns `null` if output directory is absent; otherwise synchronously lists entries whose names merely start with the supplied ID and joins them to the output directory (`:20-26`). The function exports only `downloadInstagramMedia` (`:28`).
- Called as a default media adapter by the indexing worker with `item.url`, configured `videoDir`, and `item.id` (`services/worker.js:72`, `:206-213`). Worker catches downloader exceptions and proceeds without media paths; this degrades enrichment but can hide why the download failed unless outer logs capture it.
- No explicit URL/destination validation, redirect policy, timeout, byte/file-count cap, cleanup, output-name sanitization, or path containment check appears in this helper. `id` also participates in filesystem template and prefix matching. Upstream item identity validation and deployed egress controls may reduce reachability, but are not enforced here; treat as an SSRF/resource/path-safety review item, not a demonstrated exploit. Use a secure, bounded fetch/download adapter with allowlisted media hosts and generated local filenames in Rembr.

## One-shot worker entrypoint (`worker/run-once.js`)

- Node shebang, sets `process.env.WORKER_RUN_ONCE='true'`, imports `runCli` from `indexing-runner`, and invokes it (`:1-5`). It has no own error handling, export, config parsing, or shutdown logic; `indexing-runner.runCli()` owns fatal/preflight handling and delegates to the same worker runtime. Root/package script reaches it through `worker:once` workspace command; `indexing-runner` also recognizes `--once` CLI override and applies it before creating config. One-shot behavior is therefore an environment flag consumed downstream, not a separate processing implementation.

## Test assertion maps and missing coverage

### `localStore.test.js` (`:1-417`; seven tests)

1. **Internal analysis metadata (`:9-78`)**: saves analysis hashes/processing level and a visual vector; asserts public item hides internal hashes/vector/metadata, raw JSON keeps metadata, dedicated metadata readers return expected values, embedding list stores the vector and item deletion removes it.
2. **Duplicate `skipExisting` (`:80-133`)**: reimported same ID/URL yields no new row and does not change existing import ID, caption, hashtags, collections, status, analysis or total count.
3. **Paged list filters/cursor (`:135-235`)**: five fixture types, title sort, exact cursor continuation, total/facets; checks links, screenshots, notes, voice-note and uploaded type aliases.
4. **Source dates (`:237-278`)**: saved source dates control created time and newest/oldest order.
5. **Date-less ordering (`:280-320`)**: deterministic fallback timestamps preserve parser order and reverse for oldest/newest.
6. **Archives (`:322-369`)**: public list omits archive body, detail includes content, privacy export contains archive, deleting parent removes archive.
7. **Link health/reminders (`:371-417`)**: writes/list health check, dedupes identical pending reminder, and item deletion cascades local check/reminder.

The suite does not cover most local store methods: user/tombstone behavior, store file corruption, write failures, multi-process concurrency, automation scheduling, deletion partial failures, export claim/stale recovery, token lifecycle, capture connection owner match, rate budgets, job lease fencing, credit concurrency/idempotency, audit redaction, smart collection stale candidates, or raw `dump()` exposure.

### `supabaseStore.test.js` (`:1-382`; eleven tests)

1. `cleanDbText` preserves valid emoji and removes lone high/low surrogate (`:13-17`).
2. Duplicate lookup batches IDs and URLs in chunks <=100 with user predicate (`:19-69`).
3. Insert duplicate race retains non-conflicting row and retries individually (`:71-105`).
4. Duplicate classification recognizes expected unique key conflicts only (`:107-118`).
5. Bulk item fetch pages beyond 1,000 rows (`:120-152`).
6. List page query applies expected owner/paging/filter/sort/range chain and exact count (`:154-206`).
7. Public item selection excludes `processing_level` (`:208-244`).
8. Analysis metadata reader selects owner/item-scoped hashes from `item_analysis` (`:246-292`).
9. Visual vector writes to derived table with `(user_id,item_id)` upsert conflict (`:294-332`).
10. Paid analysis delegates one atomic `record_paid_analysis_usage` RPC (`:334-366`).
11. RPC result without paid credit rejects with the expected insufficient-credit error (`:368-382`).

Mocks validate helper/chain construction, not live Supabase behavior, policies, transaction isolation, grants, race execution, or all store methods. Neither this file nor `storageImports.test.js` covers `supabaseStore.claimStorageImport`; current local store coverage does not detect the Supabase claim defect recorded in the central issue register.

## Rembr design requirements

1. Do not reuse JSON state as production persistence. Retain it only for single-process demos/tests, make its limitations explicit, and use a durable database for concurrent workers.
2. Define a typed store contract and adapter parity tests; test failures/capabilities rather than silently treating absent local methods as successful production behavior.
3. Use atomic claims and lease fencing for scheduled automations, exports, storage imports, indexing, and deletion execution. Recover stale `building`/`processing` work.
4. Keep privacy projections narrow and versioned. Audit `getDataExportPayload()` category completeness against every table/bucket and prevent raw state/debug dumps from becoming route responses.
5. Separate local stubs (`deleteUserStorageObjects`, `deleteAuthUser`, Gmail mock) from production-required implementations; startup checks should reject unsafe production mode.
6. Validate media URL, redirect chain, host/IP, size, duration and content type; use generated safe filesystem names under a verified output root; clean files after analysis and never persist raw provider/debug output by default.
7. Use atomic file replacement/locking if a local JSON adapter remains; otherwise multiple API/worker processes can overwrite one another's state.
8. Add tests for store conformance, migration parity, storage import claims, multi-user isolation, export/deletion retry, worker lease races, downloader path/URL safety, file cleanup, and provider-off behavior.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
