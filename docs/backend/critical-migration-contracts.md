# Critical Supabase migration contracts

This is a focused source review of security- and money-sensitive migrations, not a complete schema audit. Migration SQL is static repository evidence; it does not prove these migrations were applied to any hosted project.

## Credit purchase completion (`202605080002_credit_purchases_admin.sql`)

Defines active package rows, user-owned purchases with unique Stripe checkout session IDs and status/amount/credit checks, admin adjustment ledger, and RLS: authenticated users may read active packages and their own purchases. The migration upserts default USD packages and defines `complete_credit_purchase` as `SECURITY DEFINER` with `search_path=public`.

The function finds a purchase by purchase ID or checkout session ID and locks it `FOR UPDATE`; missing purchase returns null, completed purchase returns unchanged. Otherwise it marks completed, stores payment identifiers, inserts a credit transaction, increments the user account, and returns the purchase. These DB calls execute within the function transaction, making duplicate webhook delivery safe if the selected purchase/session lookup is valid. It does not visibly compare expected amount/currency/customer from Stripe payload; the webhook passes only purchase/session/payment-intent IDs. The SQL function does not visibly validate that both supplied IDs refer to the same row, nor does this migration restrict function execution grants. PostgreSQL grants function execution to `PUBLIC` by default unless revoked, so the absence of an explicit revoke/grant in this migration is a critical permission review item: inspect effective database ACLs and exposed RPC access before release. If browser roles can execute this `SECURITY DEFINER` function, its lack of caller authorization/payment verification could permit credit manipulation; this risk is conditional on effective grants and must not be stated as a confirmed live vulnerability without checking them.

## Account deletion state and ownership (`202605240002_account_deletion_requests.sql`, `202605270003_security_audit_timeline.sql`, `202605270004_tenant_isolation_classification.sql`)

The initial migration creates request, step and audit tables with hashed user/email identity, a unique active request index, user-read RLS on request/steps, and no authenticated access to deletion audit. A later migration expands request status to include frozen/failed/logged and updates the active-request index. Another later migration adds detached-row support and tenant-aware FKs to step data; later correlation migration adds trace fields.

Application status machine is more detailed than the first migration alone; use the latest migration set as a sequence. Important design fact: request `user_id` becomes nullable/on-delete-set-null so the audit/request can survive auth/user deletion. Rebuild must preserve this intentional detached audit path while ensuring ownership is never inferred from hashes alone.

## Job leases and retry (`202605110001_processing_job_leases.sql`, `202605240003_indexing_retry_leases.sql`, `20260926173449_shared_request_rate_budgets.sql`, `20260926173500_revoke_claim_processing_jobs_client_access.sql`)

- First lease migration adds owner/expiry/claimed/completed/error timestamps, queued-storage import metadata and queue indexes; introduces scope discovery and claim RPCs with `FOR UPDATE SKIP LOCKED`, claim caps and service-role grants.
- Retry migration adds `lease_token` and `next_attempt_at`; both scope listing and claims enforce max attempts and due retry time. Claims set downloading, increment attempts, clear old errors/retry timestamps and store a fencing token. RPCs are revoked from browser roles and granted to service role.
- Shared-budget migration replaces `claim_processing_jobs` to acquire a transaction-scoped advisory lock per user before enforcing active concurrency; it still row-locks candidates with skip-locked. This closes a race where different simultaneous claims for the same user could exceed configured concurrency.
- Final revoke migration enumerates every overload with this name and revokes public/anon/authenticated privileges, guarding against historical function signatures that may otherwise retain grants.

Store `claimNextJobs` creates a UUID token and calls the latest function with user, import, worker, expiry, concurrency and attempts. `updateClaimedJob` filters by token. Runtime checks the current token before writes. There is no heartbeat/lease renewal in the reviewed worker service; provider calls can run for 90 seconds under a 15-minute default lease, but larger configured/model calls or worker stalls can still outlive a lease. A new worker can reclaim then the old one will discover lost token before its next write; external provider side effects/cost are not fenced.

Potential edge: scope listing returns an eligible `(user_id, import_id)` group even though the claim RPC separately checks concurrency; it is a candidate scan, not a reservation. This is acceptable only because claim RPC is authoritative and may return empty. Tests should include two workers racing on one user and stale lease reclamation.

## Shared request budgets (`20260926173449_shared_request_rate_budgets.sql`)

`request_rate_budgets` primary key is `(user_id,scope)`, windows use UTC minute/day starts, counters are nonnegative, and RLS plus browser-role table privileges are disabled. `consume_request_rate_budget` requires a user and allowed scope, validates positive bounded limits, upserts initial budget, row-locks the budget, resets logical counts on window change, increments both counters only when neither limit was already exceeded, and returns allowed/retry/exceeded/count information. Function is `SECURITY DEFINER`, `search_path=''`, revoked from public/browser roles and granted to service role. This is an atomic shared budget, unlike the in-process IP limiter.

Limits passed from runtime config remain part of the trust boundary: SQL caps them at 1,000,000 but does not define product-specific values. Ensure config and route use the same scope names and that a denied call does not accidentally consume count (current function avoids increments when either limit is already reached).

## User data export storage (`202605270002_user_data_exports.sql`)

Creates user-owned export request/step tables, status checks, user/status indexes and RLS for users to read their own requests, create own requests, and read steps through an owner request. It creates a private `user-data-exports` bucket capped at 300 MiB and allows authenticated reads only when the first storage path segment equals `auth.uid()`. Server code uses a service-role client, so download routes must still enforce owner and ready status; current store/routes do that.

The migration does not define an atomic worker-claim RPC; server-side conditional update provides compare-and-set, but stale `building` recovery is not modeled. Bucket path ownership checks and request ownership are separate defenses and both should be preserved.

## Storage tenant boundaries and automation API-only access (`202605090002_import_upload_storage.sql`, `202605270004_tenant_isolation_classification.sql`, `20260926173447_automation_api_only_rls.sql`)

- Import bucket is private, capped at 25 MiB, has explicit MIME allowlist, and authenticated select/insert/delete policies require the first path folder to equal `auth.uid()` (`202605090002_import_upload_storage.sql`). Application-side chunk reconstruction also applies a 25 MiB default to final buffers. Compare any deployment config override with the storage bucket's hard file-size limit.
- Tenant-classification migration adds same-user composite FKs for smart collection memberships, search feedback/event, and analysis usage/item, preventing cross-user relation edges. It explicitly revokes browser access to admin credit adjustments, user admin state and activity logs. It notes credit-transaction `item_id` is contextual only; access boundary remains `user_id` RLS (`202605270004_tenant_isolation_classification.sql`).
- Automation API-only migration drops old all-action user policies and revokes anon/authenticated table privileges on automation/runs/chats/messages. This assumes every user operation passes through API routes using service-role persistence; ownership validation in those routes becomes mandatory (`20260926173447_automation_api_only_rls.sql`).
- Initial schema and provider-credit migration set RLS on `user_provider_credentials`, `user_ai_keys`, and credit tables with broad per-user all-action policies (`202605060001_instagram_brain.sql`, `202605070002_provider_credentials_credits.sql`). However, orchestration source has no provider-credential CRUD methods/routes or callsites for encrypt/decrypt helpers; migration/schema presence does not prove the feature is usable or safe end to end.

## Related schema gaps to trace next

1. Read all 38 migrations for every table's RLS/grants/FKs/checks/indexes and record migration order, especially `user_provider_credentials`, `user_ai_keys`, automations and chat API-only RLS.
2. Compare every `SECURITY DEFINER` function with explicit revoke/grant statements and correct `search_path`; functions without a migration-local grant review should be checked against platform defaults.
3. Add schema-version/preflight checks so code does not mistake missing optional tables for successful operation.
4. Write migration-backed tests against an ephemeral Postgres/Supabase-compatible environment; mocked client tests do not execute policies, constraints or RPC transaction behavior.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Feature acceptance matrix](../rebuild-plan/feature-and-acceptance-matrix.md)
