# Supabase store contract and method map

**Repository:** `D:/IScraper-main/IScraper-main`  
**Source:** `apps/orchestration/src/stores/supabaseStore.js` (3,547 lines) and migrations under `apps/orchestration/supabase/migrations`.  
**Audit status:** complete source read and function/block map for `:1-3547`. This verifies source behavior only; live Supabase, hosted RLS, SQL grant behavior, and provider authorization were not exercised. The store has no provider-credential CRUD/read API: its only direct credential mutations are disable-on-freeze (`:390`) and delete-on-account-access cleanup (`:430`); provider secret encryption helpers in `services/credentials.js` have no discovered production callsite. See `providers-and-credentials.md`. SQL/RPC/policy definitions are separately documented in `sql-migration-ledger-detailed.md`.

## Construction and shared behavior

`createSupabaseStore({url, serviceRoleKey})` throws if either required value is missing, constructs Supabase JS with session persistence/refresh disabled, and returns one broad object implementing auth, account, import, library, jobs, search, billing, audit and automation persistence (`supabaseStore.js:57-72`). The service-role client means application code must enforce tenant scoping; many methods explicitly add `.eq('user_id', userId)`, while selected admin/worker methods intentionally operate across users. This source has no compile-time interface describing those distinctions.

The store invokes atomic SQL RPCs for shared request budgets and background job scope/claiming (`:70-88`, `:1719-1758`); their correctness depends on migration definitions, grants and RLS. API-side Supabase auth resolves tokens (`:90-97`). `ensureUser` checks deletion state before ensuring both user and credit-account records (`:99-132`). `assertUserNotDeleted` hashes user ID/email, checks completed audit records and detached active/completed deletion requests, and returns 410 or 423 for blocked accounts; it tolerates missing deletion tables (`:134-163`).

## Method map by domain

### Account deletion and privacy export (`:165-615`)

- `getActiveDeletionRequest`, `getDeletionRequestById`, `createDeletionRequest`, `cancelDeletionRequestForUser`, `markDeletionRequestFrozen`, `markDeletionRequestPendingReview`, `listDeletionRequests`, `approveDeletionRequest`, `cancelDeletionRequestAsAdmin`, `markDeletionRequestExecuting`, `markDeletionRequestPartiallyFailed`, `markDeletionRequestLogged`, `recordDeletionStep`: maintain request status and step records, return mapped request objects, and write user activity for selected transitions. Creation reuses an existing active request and treats a unique constraint conflict as a concurrent request (`:165-385`). Admin approval allows requested/frozen/pending/failed/partially_failed; admin cancel refuses to change executing/completed/logged.
- `freezeUserForDeletion` marks the user blocked and revokes access tokens/provider credentials before later destructive steps (`:386-406`). Verify ordering and exact per-table behavior in full method body before implementing.
- `deleteUserStorageObjects` walks configured private buckets by user prefix and removes objects (`:407-424`); partial bucket errors must be surfaced as deletion-step failures.
- `deleteUserContentData`, `deleteUserAccessData`, `deleteUserProfileData` delete explicit table groups. Completed billing purchases are retained while pending purchase rows and user data are removed (`:425-447`, helper `retainCompletedCreditPurchases`).
- `deleteAuthUser` uses Supabase admin auth deletion and treats not-found as already deleted (`:448-452`).
- `completeDeletionRequest` inserts hashed deletion audit + retention summary, deletes the live `users` row, then marks request completed (`:453-485`). These are separate calls; partial completion is possible if later calls fail.
- `getPrivacyExport` fetches saved items, archives, link checks, reminders, imports, collections, token/connection projections, search/activity/usage, profile/onboarding/credits/deletion (`:486-528`). `getDataExportPayload` adds assets, billing ledgers, export requests, automations/runs/chats/messages, tolerating missing optional newer tables (`:558-615`).

### Data export jobs and file access (`:616-802`)

- `createDataExportRequest`, `listDataExportRequests`, `getDataExportRequest`: create and query user-scoped ZIP export requests with correlation metadata and audit activity (`:616-652`).
- `claimDataExportRequests` selects oldest requested rows and conditionally updates each to building; claims are not a single SQL RPC (`:653-679`). Multiple workers may race, though the status predicate prevents both from receiving the same successful update.
- `expireDataExportRequests`, `getDataExportQueueStatus`, `markDataExportBuilding`, `markDataExportReady`, `markDataExportFailed`, `upsertDataExportStep`: transition status, record timestamps/steps and activity (`:680-770`).
- `saveDataExportArtifact` ensures a private ZIP bucket then uploads with upsert; `getDataExportArtifact` selects by user/request and downloads the row’s stored object; `downloadUserStorageObject` only allows user-prefixed paths in import/note buckets and explicitly disallows the export bucket (`:771-802`).

### Profiles, onboarding, credentials and capture connections (`:803-1014`)

- `getUserAdminState` defaults to active if the table is missing; `setUserBlocked` records block/reason/admin actor (`:803-833`).
- `getProfile`/`saveProfile` map and upsert username/avatar; `getOnboardingPreferences`/`saveOnboardingPreferences` map and upsert selected content types, referral source and skipped flag (`:834-894`).
- `createExtensionToken`, `listExtensionTokens`, `revokeExtensionToken`, `getUserForExtensionToken` persist only token hashes, return scoped metadata, revoke by owner, and enforce token scope/revocation/expiry (`:895-948`).
- `upsertCaptureConnection`, `getCaptureConnection`, `markCaptureConnectionUsed`, `revokeCaptureConnection`, `listCaptureConnections` map an external capture identity to a token hash; public projection is delegated to `publicCaptureConnection` (`:949-1014`).
- No provider-credential read/create/update method appears in the returned store object. The only references found are the freeze disable update (`:390`) and account cleanup deletion (`:430`). Do not infer provider-secret encryption at rest from extension-token/capture-connection methods or from the orphaned `services/credentials.js` helpers.

### Search, feedback and imports (`:1015-1283`)

- `recordLensSearchEvent`, `recordSearchEvent`, `recordSearchFeedback` persist bounded search metadata, result IDs and feedback, with user ownership checks where applicable (`:1015-1070`).
- `listPublicFeedback`, `createPublicFeedback`, `listAdminFeedback`, `setFeedbackStatus` serve public/admin feedback flows (`:1071-1113`).
- `createImport`, `getImport`, `getPendingStorageImports`, `claimStorageImport`, `updateImportStatus`, `upsertImportData`, `updateSavedItem`, `createJobs` implement import persistence (`:1114-1283`). Exact processing steps and a high-priority claim defect are in `storage-import-flow.md`.

### Library, Smart Collections, notes and media (`:1284-1711`)

- `getItems`, `listItemsPage`: user-scoped row selection, item/analysis mapping, database pagination/cursor, facet counts and optional timing callbacks (`:1284-1313`). Helper methods cap/sort/filter query results; `getItems` retrieves all pages, so callers should avoid it for unbounded interactive views.
- `refreshSmartCollections`: computes candidates from loaded user items; upserts collection metadata; removes old `auto` memberships; preserves `manual_exclude`; inserts generated memberships; then reads the public collection list (`:1314-1415`). The delete-and-reinsert sequence is not transactional, so a mid-refresh failure can leave incomplete memberships.
- `listSmartCollections`, `listSmartCollectionItems`: combine collection definitions, memberships and current items; hide hidden collections unless requested; filter empty results, apply ordering and list pagination (`:1416-1470`). Missing feature tables return empty/null.
- `updateSmartCollection`, `setSmartCollectionItemOverride`: sanitize name/description and pin/hidden fields; allow manual include/exclude or revert-to-auto; validate that collection/item exist and replace prior manual override (`:1471-1536`).
- `getItem`, `createNoteItem`, `addItemAsset`, `listItemAssets`, `getItemArchive`, `upsertItemArchive`, `listLinkHealthChecks`, `upsertLinkHealthCheck`, reminder CRUD, `removeItemAssets`, `deleteSavedItem`: provide owner-scoped item and attached-data operations (`:1537-1711`). Item deletion returns the pre-delete item; storage-object deletion is handled separately by workflows/routes.

### Jobs, leases, analysis and embeddings (`:1712-1985`)

- `getJobs`, `getProcessableJobScopes`, `getJob`: owner-scoped job reads or cross-user RPC scope scan for worker discovery (`:1712-1736`).
- `claimNextJobs`: creates a UUID lease token and calls `claim_processing_jobs` with bounded limit, worker identity, expiration, per-user concurrency and attempts (`:1737-1759`).
- `updateJob`, `updateClaimedJob`, `claimJob`: ordinary owner-scoped patch, fencing-token patch, or queued-to-active status claim (`:1760-1794`).
- `restartJobs`: resets selected failed/stuck/paused jobs and corresponding non-done items to queued, clears attempts, lease and retry metadata (`:1795-1828`).
- `getIndexingSummary`, `getWorkerQueueStatus`: compute user/whole-worker queue counts, treating expired active leases and future retry timestamps as queued/retrying in different counters (`:1829-1881`).
- `saveAnalysis`: upserts `item_analysis`, sets saved item done, reloads item, refreshes Smart Collections; each step is a separate database request (`:1882-1891`).
- `saveEmbedding`, `getEmbeddingMetadata`, `getAnalysisMetadata`, `saveVisualEmbedding`, `getVisualEmbeddingMetadata`, `listVisualEmbeddings`, `markItemFailed`, `setItemStatus`: persist text and visual vectors/hash/model metadata and item status (`:1892-1985`).

### Billing, activity, security and administration (`:1986-2404`)

- `listCreditPackages`/`getCreditPackage` prefer active package rows and fall back to built-in defaults only for a missing table; `createCreditPurchase` inserts pending purchase data; `updateCreditPurchaseSession` stores Stripe session linkage; `completeCreditPurchase` delegates to `complete_credit_purchase` RPC (`:1986-2040`). `getCredits` ensures an account, reads paid balance and counts exact `free` usage rows; `ensureCreditAccount` upserts the user account; `recordUsage` uses the `record_paid_analysis_usage` RPC for paid idempotency, while the free path select-checks then upserts a unique usage row and writes activity (`:2041-2112`). The paid path’s actual atomicity/idempotency is defined by migration/RPC code, not this JS.
- `recordUserActivity`, `recordSecurityAudit`: append safe activity/security audit metadata, with bounded/redacted fields (`:2113-2161`).
- `addCreditTransaction` validates a non-zero integer delta, reads current balance, inserts a transaction row, separately updates the account balance, then records activity (`:2162-2191`); this multi-request sequence is non-atomic and can race or partially persist. `addAdminCreditAdjustment` calls that mutation, inserts the admin adjustment record afterward, then rereads credits (`:2192-2199`); a later audit-row failure leaves the balance and ledger changed without its adjustment record.
- `getAdminSummary`, `listAdminUsers`, `getAdminUserSummary`, `getAdminUserDetail`, `listAdminImports`, `listAdminActivity`, `listUserTimeline`, `listUserSecurityActivity`, `listSecurityAuditEvents`: aggregate/query administrator and user audit views (`:2200-2404`). Access control is expected in route/auth layer; methods do not accept an actor capability.

### Search engine (`:2405-2444`)

- `search`: gathers searchable saved items, keyword/semantic candidates and merges by item ID with filters (`:2405-2424`).
- `searchLean`: selects lean candidates/page rows for performance-sensitive paths (`:2425-2444`). Exact SQL RPC/fallback behavior should be reviewed with `services/aiSearch.js`, `embeddings.js`, `rateBudgets.js` and semantic-search migration.

## Source-level edge cases found in the complete pass

- `ensureUserRecord` checks user and credit account in parallel, then independently upserts whichever is absent; concurrent calls can race but uniqueness/on-conflict makes the writes converge (`:103-132`). It only refreshes `last_seen_at` when email/public reference is missing or email changed, so ordinary returning sessions do not update it.
- Deletion transitions are mostly unconditional updates by ID, not compare-and-set state transitions (`:211-348`). A user/admin cancellation can race with a worker entering execution unless the service layer or database adds serialization. `recordDeletionStep` reads current attempts/metadata and then upserts them in separate calls (`:350-384`), so concurrent step attempts can lose increments/metadata.
- `freezeUserForDeletion` runs token revocation, credential disablement, and job cancellation concurrently. A failure in one rejects the method after other writes may already have committed (`:386-405`). Deletion remains a multi-step, partially committed workflow.
- Storage deletion walks four buckets sequentially and deletes in batches of 100 (`:407-423`); any failure stops later buckets. The source only discovers paths under the user prefix; it cannot prove provider-side deletion beyond successful API return.
- Privacy export loads all items and multiple complete user tables in parallel (`:486-527`), then adds assets, billing, exports, and automation history (`:558-614`). No pagination or global export bound is enforced at this store layer. Optional-table compatibility catches only missing-table errors.
- Export request claiming uses select-then-status-conditional updates (`:653-679`); stale `building` records have no lease here, and expiration only updates `ready` rows (`:680-688`). Artifact upload and request-ready marking are separate operations (`:717-775`).
- `listItemsPage` computes facets from at most 10,000 user rows even when total library size is larger (`:1288-1312`). `getItems` reads all user items (`:1284-1287`); collection refresh and listing use it and can scale with the full library (`:1314-1427`).
- Smart collection refresh updates/inserts definitions, deletes generated memberships only for currently-generated collection IDs, then inserts replacement rows in separate statements (`:1314-1415`). If a candidate disappears, prior generated collection/membership state may remain; a mid-refresh failure may expose incomplete membership state. Manual exclusions are preserved and suppress generated memberships.
- `getItem` selects nested archives with the saved item (`:1537-1545`), potentially loading full archive bodies through mapping; consider a metadata-only projection for list views. `removeItemAssets` with an empty `assetIds` array removes every asset for that user/item (`:1690-1700`); callers must treat omission as “all” intentionally.
- `restartJobs` resets matching jobs first and then changes non-done saved items in a second call (`:1795-1827`), so partial restart is possible. `saveAnalysis` writes analysis, marks item done, reloads it, and refreshes collections in separate calls (`:1882-1890`); failure in collection refresh follows a successful analysis persistence.
- `getAdminSummary` sums at most 10,000 usage/purchase/transaction rows (`:2200-2241`); `getAdminUserDetail` reads bounded subsets and computes import/job counts with separate queries (`:2287-2318`). These are dashboard summaries, not reconciled financial statements.
- `search` loads all user items before keyword search and optional vector RPC (`:2405-2424`); `searchLean` uses paged/candidate row selection and maps without a Supabase client, so linked signed assets are not hydrated in that path (`:2425-2435`).

## Cross-cutting observations and rebuild requirements

1. Make separate narrow adapters or typed repository interfaces for account, library, billing, search, automation and worker domains; this monolithic object has broad coupling and unchecked capabilities.
2. Keep tenant predicates explicit at every service-role access. Add tests for every route/store entity using a foreign user ID.
3. Encode atomic state changes in SQL/RPCs for import claims, export claims, job claims, billing and deletion transitions where concurrent workers/users can race.
4. Treat `42P01` missing-table compatibility fallbacks as migration compatibility only. They can silently hide unapplied schema; surface schema version/health in operator diagnostics.
5. Define transaction boundaries for smart collection refresh, analysis save, export ready/completion, and deletion; current multi-call workflows may partially persist.
6. Main store methods before the helper tail still require a complete line-by-line pass; SQL policy/RPC bodies and test-by-test assertions are covered in their linked ledgers. Provider credential CRUD is absent from this store rather than merely untraced.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
