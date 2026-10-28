# Assertion-level supplement: stores and worker billing

**Scope:** complete static reads of `apps/orchestration/test/localStore.test.js` (417 lines, 7 tests), `supabaseStore.test.js` (382 lines, 11 tests), and `worker-billing.test.js` (689 lines, 9 tests). No test command was run. Assertions describe local fixtures or mocked Supabase query/RPC contracts; they do not establish live database/deployment behavior.

## `localStore.test.js`

| Lines | Assertions and source mapping | Coverage gaps |
|---|---|---|
| 9–79 | Saving analysis keeps processing level/source and embedding hashes in raw `analysisMetadata`, public item analysis omits internal fields, metadata accessors return expected fields, visual embedding metadata lists model/dimensions, deleting item removes embedding. Maps `localStore.saveAnalysis/getAnalysisMetadata/saveVisualEmbedding/listVisualEmbeddings/deleteSavedItem`. | Corrupt store file, concurrent writes, invalid vectors, foreign user access, crash durability. |
| 80–134 | `duplicateMode:'skipExisting'` returns no inserted row and preserves existing importId/caption/hashtags/collections/status/analysis; only one item remains. Maps `upsertImportData`. | Cross-user/global URL dedupe, concurrent duplicate insert, partial import failure. |
| 135–236 | Five item types produce expected title order, facets and next cursor; cursor fetch returns beta; type filters select links/screenshot/note/voice/uploaded. Maps `listItemsPage` and itemList shaping. | Invalid cursor, state/collection/platform filters, mutable dataset between pages, page size max, tie/updated sorting. |
| 237–279 | Source savedAt controls newest/oldest order and imported `createdAt`. Maps date normalization and `upsertImportData`. | Invalid time zones, ties, malformed source dates. |
| 280–321 | Empty dates preserve deterministic reverse ordering; newest sort has later generated createdAt first. | Stability across separate runs/clock perturbation and parser ordering contract. |
| 322–370 | Archive upsert returns ready; list endpoint item projection does not include archive body; `getItem` does; privacy export includes one archive; deleting save removes archive. | Archive ownership collisions, update transitions, large archive bounds. |
| 371–416 | Link check upsert/list; creating same reminder twice returns same id and one pending reminder; deleting save removes health check and reminder. | Idempotency under concurrent requests, reminder transition/update, other statuses. |

**Interpretation:** this is local JSON store behavior and intentional public projection. It does not prove the Supabase adapter shares these deletion/pagination/ownership semantics.

## `supabaseStore.test.js`

| Lines | Assertions and source mapping | Coverage gaps |
|---|---|---|
| 13–17 | `cleanDbText` retains valid emoji sequence and strips isolated high/low surrogates. | Other malformed Unicode and normalization forms. |
| 19–69 | Existing ID/URL lookup splits 245 ids and URLs into six batches (each <=100), queries `saved_items(id,url)` with `user_id`, and returns both ID and URL keys. Maps `getExistingSavedItemKeys`. | Empty values, query errors, duplicate result overlap, large batch failure/retry. |
| 71–105 | Bulk insert duplicate race falls back to single-row inserts and retains only valid new row; asserts three insert calls. Maps `insertSavedItemRows`. | Non-duplicate failures and partial successful batch followed by fatal error. |
| 107–139 | Recognizes primary-key unique conflict and rejects unrelated unique constraint and permission errors. Maps `isExpectedSavedItemDuplicateError`. | Constraint-name/casing/provider-specific variations. |
| 141–152 | Pages 2,456 rows in ranges `[0,999]`, `[1000,1999]`, `[2000,2999]`. Maps `selectAllUserSavedItems`. | Short/error pages, count mismatch, cursor stability. |
| 154–206 | Range-backed saved-items page applies exact select projection, user filter, web type OR, updated desc/id asc ordering, range 20–29, and exact count. Maps `selectUserSavedItemPage`. | State/collection/platform filtering matrix and DB sort/date null handling. |
| 208–244 | Page selection never selects `processing_level`. Maps public query projection. | Other private column regression. |
| 246–292 | `getAnalysisMetadata` reads only `item_analysis` fields processing_level/source hash/embedding hash with user and item filters; maps snake_case to camelCase. | Missing row/error and authorization/RLS behavior. |
| 294–332 | Visual vector writes to `item_visual_embeddings` with user/item/vector/hash/model and `onConflict:'user_id,item_id'`, followed by throwOnError. | Invalid vector/model, delete/upsert conflict correctness, retrieval parity. |
| 334–366 | Paid `recordUsage` calls exactly one `record_paid_analysis_usage` RPC with user/item/provider/model and returns recorded/idempotent/remaining fields. | Live RPC atomicity, duplicate retries, trigger/RLS/grants. |
| 368–381 | RPC return `recorded:false` with no credit causes “Not enough paid credits” rejection. | RPC error response, already-recorded/no-credit semantics, provider omission. |

**Interpretation:** tests use handcrafted chainable clients and RPC stubs. They verify adapter query shape and RPC call arguments, not SQL function body, actual role permissions, RLS, transaction behavior, or deployed schema. The 38-migration ledger remains necessary evidence.

## `worker-billing.test.js`

| Lines | Assertions and source mapping | Coverage gaps |
|---|---|---|
| 12–65 | With no app provider, media import job reaches `done`, deterministic title/summary, empty transcript, no public internal processing/hash values, no item error. Maps `processImportJobs` basic fallback. | Provider absence across all content types, download errors, job retry. |
| 66–118 | One saved item likewise completes basic indexing without app key, and public analysis hides processing/source/embedding metadata. | Paused missing-provider semantics vs deliberate fallback. |
| 119–214 | Mocked OpenAI+embedding requests produce enriched done item; local raw store contains ai_enriched and 64-hex source hash; zero free use and one paid credit consumed. | HTTP auth/error/timeouts, idempotent second pass, Supabase RPC and provider usage consistency. |
| 215–294 | Local ML media request gets expected endpoint/file name; returns OCR/description/vector; job/item done, ML metadata hidden publicly, derived vector metadata persisted, no paid credit consumed. | Local extractor failure/timeout, vector mismatch, storage cleanup and concurrency. |
| 295–391 | Second run after manually requeueing item downloads media again but unchanged source-content hash prevents second local ML request; existing analysis remains done and hash stays persisted. | Changed source input invalidation, missing file, model change, false-positive hash collision. |
| 392–493 | Given matching embedding content hash/model, analysis/provider still runs but embeddings endpoint is not called and embedding not re-saved; stored embedding hash matches expected normalized content. | Model mismatch/old hash/new input and errors from metadata lookup/save. |
| 494–584 | Three paid jobs with concurrency 3 all complete, all three paid credits consumed, and mocked provider observes >1 concurrent request. | Per-user concurrency cap, leases across workers, provider rate limit, partial failures. |
| 585–638 | Provider 503 under maxAttempts 2 yields queued job, attempt 1, future nextAttemptAt, cleared lease token, queued item status and retry message. | Exact delay cap/jitter, retry after stale lease, no-credit handling. |
| 639–688 | Provider 503 under maxAttempts 1 yields terminal failed job/item, attempts 1, no nextAttemptAt, retry-if-attempts-remain message. | Malformed provider response, non-retryable classification and attempt boundary beyond 1. |

## Rebuild implications and unresolved test gaps

Treat each adapter as an independent implementation of one contract and use parity fixtures for ownership, pagination, redaction, deletion cascades, idempotent billing, and queue claims. Unit tests with fake Supabase clients do not substitute for SQL/RLS/RPC review. Worker tests demonstrate intended credit behavior only in local store plus mocked provider HTTP; they do not prove distributed lease safety, atomic credit debit under races, real provider authorization or exact accounting under partial writes.

All three assigned files were read fully and every top-level case was mapped above. No unresolved source lines remain within these test files; uncovered behaviors are listed as test gaps rather than pending review.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
