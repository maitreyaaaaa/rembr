# Account deletion, billing, and data-export critical flows

**Evidence basis:** `services/accountDeletion.js`, `services/dataExportPipeline.js`, `services/credits.js`, `application/billingWorkflow.js`, account/admin/integration routes, and selected store methods. Sources are in `D:/IScraper-main/IScraper-main/apps/orchestration`. No destructive action, purchase, webhook, or hosted export was executed.

## Service function map verified in source

`src/services/accountDeletion.js`: status sets and ordered `DELETION_STEPS` are at 3–13; `hashDeletionValue` 17–22; blocking/public-state projection at 24–66; `redactDeletionError` 68–73; `processAccountDeletionRequest` 75–159 validates request id/capability/existence/status, marks executing, skips completed steps, records running/completed/failed, returns partial failure, and finalizes/logs only when all ordered steps completed; `runDeletionStep` 161–193 dispatches freeze, storage, content, access, profile, Auth and finalization. This service itself has no distributed claim/lease; concurrent invocations need store-level protection. Public projection includes step metadata and status message, so persistence must not contain unredacted secrets.

`src/services/dataExportPipeline.js`: constants/expiry `6–16`; `buildUserDataExport` `18–138` concurrently reads account/privacy/structured payload, emits fixed JSON files/manifest, optionally adds bounded media and ZIPs; `runDataExport` `140–177` records each step, saves artifact, marks ready, and marks failed/rethrows on error; `processDataExportRequests` `179–193` expires then claims and processes requests sequentially; fallback payload `195–212`; category/row/error helpers `214–227`; media manifest `229–238`; media loader `240–271` enforces count/bytes and records skips; media candidate collection `273–320` accepts user-owned storage paths and inline data URL assets; loader `322–330`; data URL decoder `332–338`; skip metadata `340–347`; safe filename `349–351`. Inline data URL decode allocates bytes before applying total ZIP byte limit. ZIP artifact correctness and exactly-once claims depend on store semantics and are not proven by source alone.

`src/services/credits.js`: `FREE_ITEMS_LIMIT` (1) is zero. Default package data (3–26) declares 100/$9, 500/$39, and 1500/$99 USD packages. `normalizePackage` (28–37) converts numeric fields, supports snake/camel amount and price IDs, lowercases currency, defaults active unless explicitly false. `formatPrice` (39–44) formats cents using `Intl.NumberFormat('en-US')`. Package values in source are defaults; actual displayed/sold packages depend on store config and Stripe availability. `application/billingWorkflow.js:createBillingWorkflow` (3–12) returns `stripeFor`, which constructs a Stripe client only when secret is configured; no provider side effect until caller uses client.

## Account deletion

### User request and review gate

`POST /api/account/deletion` requires `exportConfirmed === true`, derives request/correlation IDs, creates/reuses an active request, freezes access/jobs, transitions through `frozen` to `pending_approval`, writes a critical security audit event, and returns a redacted/public projection (`routes/accountRoutes.js:26-59`). The route therefore blocks risky access as soon as the user submits, before admin approval. User cancellation is permitted only while the store considers the request cancelable; cancellation is audited (`:62-77`).

The active statuses are requested/frozen/pending_approval/approved/executing/failed/partially_failed; cancelable are requested/frozen/pending_approval; terminal are completed/logged/canceled (`services/accountDeletion.js:3-5`). Auth blocks active requests through `assertUserNotDeleted` at session setup (store refs in `supabase-store-contract.md`). `publicDeletionRequest` exposes only a selected request projection and actions, although it includes reason and step metadata to the owner/admin paths (`:25-62`). `redactDeletionError` masks email addresses and URLs and truncates to 500 chars (`:64-69`).

### Approval and execution

Admin listing, approval, cancellation and execution require `assertAdmin` plus a dedicated admin rate limiter (`routes/adminRoutes.js:225-303`). Admin actor is a bounded header value or the authenticated admin email; execution accepts a bounded `maxSteps` defaulting to seven. Request, approval, cancellation, and processing write security audit records and workflow telemetry.

`processAccountDeletionRequest` validates request ID/capability/existence, returns idempotently for completed/logged, and only starts for approved/executing/failed/partially_failed (`services/accountDeletion.js:76-114`). It marks executing, skips previously completed steps, then records each step as running, performs it, and records completion; failures are redacted, persisted, and return a partially_failed request (`:116-147`). Ordered steps: freeze access, remove storage, delete content, delete access, delete profile, delete auth user, finalize (`:9-17`, `:163-189`). Completion inserts the hashed audit record, removes the user row, marks completed, then separately marks logged (`:149-173`; store `supabaseStore.js:453-485`).

Store details (`supabaseStore.js:386-485`): freeze revokes extension tokens, disables stored provider credentials, and fails open/paused processing jobs; storage cleanup removes user-prefixed files from import, Instagram asset, note, and export buckets in batches; table deletion is grouped by content/access/profile; completed purchases are retained while pending purchases are removed; Auth deletion treats not-found as already deleted. Calls are not wrapped in one transaction. Each operation must remain retryable after earlier steps succeed.

Rembr follow-up: IScraper keeps ownership in user-prefixed object paths and sweeps those prefixes before deleting account rows. Rembr's worker retry queue previously stored media keys without an owner, which meant account deletion could miss an object after its media-artifact row had already been removed. The `20261030153000_media_cleanup_queue_owner.sql` migration adds owner attribution where the source artifact still exists; all current queue writers store the owner, and deletion drains owner-scoped queue keys before identity removal. Historical queue rows without a surviving artifact cannot be attributed safely and remain eligible for the worker-wide sweep.

### Deletion risks and Rembr requirements

- **Concurrent execution:** service allows `executing` requests and does not claim a processing lease. Two admin requests can run the same steps concurrently. Conditional status transitions/atomic claim and per-step idempotency need explicit design and concurrency tests.
- **Freeze result is not a transaction:** token, credentials and jobs are changed in parallel; if one update fails, other updates may already have committed. The request route can return error after partially freezing the account.
- **Step logging can fail separately:** action may succeed before the `completed` step write fails; retry must be safe. `deleteAuthUser` treats already-missing Auth as success, which supports retry.
- **Detached-user behavior:** for any non-final step with no `userId`, service returns a `skipped` result and still records that step as completed. This can allow a detached request to finish without proving all user data was deleted; Rembr should distinguish “already deleted and verified” from “owner unavailable.”
- **Retention statement:** implementation retains hashed deletion audit, security logs/backups per retention policy, and completed purchases, but the source cannot prove backup deletion timing or third-party provider behavior. The final note about third-party provider records is generic and not evidence of actual deletion.
- **No isolated account-deletion service test file is present.** API tests cover request deduplication/freeze/cancel and admin approval/idempotent processing/account recreation prevention (`test/api.test.js:686-740`, `1237-1290`); they use `localStore`, not the Supabase adapter. No concurrent processing test was found in the test inventory.

## Credit purchase and Stripe webhook

`credits.js` defines default packages and `FREE_ITEMS_LIMIT = 0` (`services/credits.js:1-31`). In hosted mode, `listCreditPackages` prefers DB active packages and falls back to defaults only for missing table. Checkout is disabled unless `enableCreditCheckout`; if enabled, it authenticates the user, rate-limits checkout, resolves a package from the store, creates a purchase row, builds a Stripe one-time payment checkout session, stores purchase/session linkage, and returns the session URL (`routes/integrationPrivateRoutes.js:112-152`).

`POST /api/webhooks/stripe` is mounted before global JSON parsing with `express.raw`, verifies the signature through `stripe.webhooks.constructEvent`, rejects invalid signatures with 400, and handles only `checkout.session.completed`; it calls `completeCreditPurchase` with purchase/session/payment-intent identifiers, then returns `{received:true}` (`routes/integrationRawRoutes.js:6-34`). Stripe is created only when configured (`application/billingWorkflow.js:3-8`).

In Supabase, credit completion delegates to `complete_credit_purchase` RPC (`supabaseStore.js:2033-2040`), and paid usage delegates to `record_paid_analysis_usage` so debit/idempotency can be atomic (`:2076-2111`). The webhook returns success for other event types without processing them. The code assumes completion RPC verifies purchase/session ownership and duplicate delivery; SQL migration semantics must be verified. If checkout is disabled, paid credit UI paths should not imply live purchasing. Current app constants indicate no free items; `worker.js` has a paid-credit gate and no `free` plan branch even though usage persistence accepts both `free` and `paid`. The API test only verifies package listing and that checkout fails closed without Stripe configuration (`test/api.test.js:3180-3208`). No test for `/api/webhooks/stripe` signature handling, duplicate event delivery, or purchase completion was found.

## User data export

`POST`/status/download routes create a user-scoped export request, allow async worker processing, and download only a ready artifact belonging to the current user; details are cataloged in `api-routes-and-contracts.md`. `dataExportPipeline.js:1-154` assembles account/privacy data into named JSON files, includes a versioned manifest and data map, records category row/byte counts, optionally includes bounded media, compresses the output to ZIP, writes step records, uploads to `<userId>/<requestId>/...`, and marks request ready with a seven-day expiry. Failures are sanitized, stored as failed and rethrown.

The `includeFiles` path gathers candidate files and enforces file/byte limits, adding skipped reasons to the manifest (`dataExportPipeline.js:221+`). Raw access tokens and internal deletion hashes are expressly excluded in manifest text. Default media export excludes raw uploads and retains metadata.

**Queue risk:** store claim reads `requested` rows then updates each with a compare-and-set status predicate (`supabaseStore.js:653-679`), which helps avoid duplicate successful claims, but there is no lease/expiry recovery for a worker that dies after setting `building`. Expiry only covers `ready` requests (`:680-688`). A stale-building recovery policy and concurrency test are needed. There are no observed guarantees that export build/upload/ready updates are transactional; retries should be idempotent and clean up orphan artifacts. The existing API test named `queued data export creates a redacted downloadable zip and enforces ownership` exercises the local-store path; no Supabase claim/RLS test was confirmed.

## Rebuild order for these critical flows

1. Define deletion/export/purchase status enums, allowed transitions and actor permissions as contracts.
2. Implement atomic claim/state transition RPCs and step/run idempotency keys; include outbox-style audit events for partial failures.
3. Make deletion freeze/revoke and export/checkout actions recoverable across partial failure, with separate user-visible progress and operator diagnostics.
4. Implement privacy export from a registry that is cross-checked against every user-owned table/storage bucket; document retention exclusions and jurisdiction-specific decisions separately.
5. Test webhook signature, duplicate event replay, wrong purchase/session, canceled/expired checkout, concurrent deletion execution, retry after each deletion step, stale export worker, export size limits, and owner-only downloads.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
