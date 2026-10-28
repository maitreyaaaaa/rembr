# IScraper Persistence, Migrations, and Worker Semantics

This document summarizes the source-defined database and job model. It does not assert that hosted Supabase has applied these migrations or that its current policies match them.

## Store abstraction

`createApp` injects a store into workflows, and `worker/indexing-runner.js` selects `createSupabaseStore` when `STORAGE_MODE=supabase`, otherwise `createLocalStore` (`apps/orchestration/src/server.js:44-123`; `apps/orchestration/src/worker/indexing-runner.js:11-23`). The local adapter persists JSON under `dataPath` and is intended for dev/local workflows. The Supabase adapter uses a service-role client and implements owner-filtered reads/writes plus explicit mapping between domain objects and database rows (`apps/orchestration/src/stores/localStore.js`, `supabaseStore.js`).

The effective store interface includes identity and profile, imports and saved items, collections and notes/assets, analyses and embeddings, jobs/leases, provider credentials, credits, feedback/search events, archives/link health/reminders, smart collections, capture connections, extension/agent tokens, automation/chat/run state, export requests/artifacts, deletion workflow, admin/security activity, and storage operations. A number of workflow handlers feature-detect optional methods. This means the store contract is implicit and capability-dependent; document the local/Supabase parity matrix before rebuilding.

Security design uses three layers: route authentication and owner validation, explicit user-scoped Supabase queries, and RLS on user-owned tables. The service-role store bypasses ordinary client RLS semantics, so application owner predicates and database constraints remain critical. Several worker-only RPCs are revoked from anon/authenticated and granted to `service_role` (migration `202605240003_indexing_retry_leases.sql`). The migration `20260926173447_automation_api_only_rls.sql` is specifically intended to keep automation writes behind the API.

## Data model groups

| Domain | Core tables / purpose | Main evolution |
|---|---|---|
| Identity and core library | `users`, `user_profiles`, `imports`, `collections`, `saved_items`, `item_assets` | Initial schema; source metadata, content type, note fields, dates, onboarding preferences |
| Analysis and retrieval | `item_analysis`, `item_embeddings`, `item_visual_embeddings` | Processing level/hash metadata; pgvector and semantic RPC; separate stored visual vectors |
| Durable processing | `processing_jobs` | Claim/status indexes, leases, retries, per-user concurrency, scoped worker RPC |
| Storage and captures | Supabase Storage buckets, `capture_connections`, `extension_tokens`, `lens_search_events` | User-prefix private import/note assets; capture connections and scoped revocable tokens |
| Search and quality | `search_events`, `search_result_feedback`, `public_feedback` | User-owned query and relevance feedback; public visible feedback is separately constrained |
| Collections and care | `smart_collections`, `smart_collection_items`, `item_archives`, `link_health_checks`, `item_reminders` | Dynamic grouping, archived page snapshots, link checks and reminders |
| Providers and credits | `user_provider_credentials`, `user_credit_accounts`, `credit_transactions`, `analysis_usage_events`, `credit_packages`, `credit_purchases`, `admin_credit_adjustments` | Encrypted provider credential metadata, account ledger, checkout/purchase completion RPC |
| Administration and audit | `user_admin_states`, `user_activity_events`, `security_audit_events`, `account_deletion_audit` | Blocking status, activity timeline, sanitized security audit, hash-based retention data |
| Privacy workflows | `account_deletion_requests`, `account_deletion_steps`, `user_data_export_requests`, `user_data_export_steps` | Human-approved deletion processing and async export state |
| Automations | `automations`, `automation_runs`, `automation_chats`, `automation_chat_messages`, `request_rate_budgets` | Scheduled jobs, chat-led configuration, run history, persistent shared budgets |

Important relation invariant: child tables commonly use composite `(user_id, item_id)` foreign keys to ensure an item belongs to the same user as its assets, analysis, feedback, archive, or visual embeddings. Review migration `202605060001_instagram_brain.sql` for initial composite relationships; later domain migrations repeat this pattern.

## Migration ledger

### Core schema, search, providers, and feedback

| Migration | Change |
|---|---|
| `202605060001_instagram_brain.sql` | Initial users/imports/collections/saved items/assets/analysis/text embeddings/jobs/AI key tables; RLS, storage policies, initial indexes |
| `202605060002_move_vector_extension.sql` | Moves pgvector extension into `extensions` schema |
| `202605070001_semantic_search_rpc.sql` | `match_saved_items` semantic RPC and vector index adjustment |
| `202605070002_provider_credentials_credits.sql` | User provider credentials, credit accounts/ledger, analysis usage events and RLS |
| `202605080001_public_feedback.sql` | Anonymous feedback submission and public-visible read policy |
| `202605080002_credit_purchases_admin.sql` | Packages, purchases, admin adjustments, completion function |
| `202605080003_remove_login_scrape_mode.sql` | Removes legacy login-scrape state/column |
| `202605080004_user_profiles.sql` | Profile table and policies |
| `202605080005_saved_item_source_metadata.sql` | Additional source platform/title/description/author/owner fields and index |
| `202605080006_lens_extension_tokens.sql` | Extension tokens and Lens search events |
| `202605090001_admin_controls_activity.sql` | Admin state and user activity event records |

### Imports, jobs, privacy workflows, library features

| Migration | Change |
|---|---|
| `202605090002_import_upload_storage.sql` | Private import upload bucket/storage policies |
| `202605100001_saved_items_pin_content_type.sql` | Saved-item content type fields |
| `202605100002_processing_jobs_worker_idx.sql` | Processing-job worker index |
| `202605110001_processing_job_leases.sql` | Lease columns/indexes plus worker scope-list and claim RPCs |
| `202605240001_openai_compatible_provider_credentials.sql` | OpenAI-compatible provider fields/configuration support |
| `202605240002_account_deletion_requests.sql` | Deletion requests, ordered steps, hashed audit, purchase retention semantics |
| `202605240003_indexing_retry_leases.sql` | Retry scheduling and hardened claim/list RPC permissions |
| `202605240004_search_quality_feedback.sql` | Search events and result-level feedback |
| `202605240005_notes_saved_items.sql` | Note fields/indexes on saved items and private note-asset bucket policies |
| `202605250001_smart_collections.sql` | Smart collection definitions and item membership |
| `202605250002_item_archives.sql` | Readable page archive snapshot/status table |
| `202605250003_library_care.sql` | Link health checks and item reminders |
| `202605250006_capture_connections.sql` | Capture provider connections |

### Isolation, observability, ML, and automation

| Migration | Change |
|---|---|
| `202605270001_phase6j_supabase_performance_indexes.sql` | Library ordering/search trigram and audit performance indexes |
| `202605270002_user_data_exports.sql` | Async data export requests and step tracking |
| `202605270003_security_audit_timeline.sql` | Security audit event table/indexes |
| `202605270004_tenant_isolation_classification.sql` | Tenant ownership/index classification and isolation indexes |
| `202605270005_request_correlation_ai_notice.sql` | Request/correlation metadata and AI disclosure notice fields |
| `202605290001_saved_item_source_dates.sql` | Source-created/published date fields and indexes |
| `202605300001_user_onboarding_preferences.sql` | Onboarding preference persistence |
| `202609080001_item_analysis_processing_level.sql` | Analysis processing level/content hashes and hash lookup indexes |
| `202609080002_item_visual_embeddings.sql` | User-scoped visual embedding persistence and hash-based uniqueness/indexes |
| `20260926173444_chat_automations.sql` | Automations, runs, due-schedule claim function and policies |
| `20260926173445_automation_chats.sql` | Automation chat/message persistence |
| `20260926173447_automation_api_only_rls.sql` | Restricts automation table access to API/service paths |
| `20260926173449_shared_request_rate_budgets.sql` | Shared user request budgets, atomic consumption RPC, revised processing claim and paid-usage accounting |
| `20260926173500_revoke_claim_processing_jobs_client_access.sql` | Removes client execution grants on worker job claim RPC |

The ledger covers all 38 tracked migration files in `apps/orchestration/supabase/migrations`. Exact column definitions, constraints, RLS statements, and `SECURITY DEFINER` behavior must be checked in each SQL file before implementing a fresh schema. This summary is not a migration replacement.

## Job lifecycle and lease model

Queue states are centralized in `services/queue.js:1-23`: open statuses include queued, downloading, analyzing, and paused states (`paused_needs_billing`, `paused_api_limit`, `paused_missing_provider`); terminal states are `done` and `failed`. Each job is keyed by import/item, starts queued with zero attempts and empty lease fields (`queue.js:25-48`).

Eligibility rules (`queue.js:50-98`): a queued job may run when its retry time is due; active jobs can be reclaimed after lease expiry; paused jobs are not automatically claimable; exhausted attempts are not reclaimable. Retry delay doubles from base delay by attempt count, capped by max delay. Status summaries distinguish due queued, waiting/retrying, active, paused, failed, and exhausted jobs.

The runtime clamps all worker settings (`runtime/workerRuntime.js:14-29`), discovers processable scopes (`31-39`), processes bounded scopes with either configured concurrency or a single total-cap lane (`41-84`), and combines indexing and export work in one pass (`87-129`). It separately runs due automations after each loop pass (`132-174`). Production/Supabase preflight requires Supabase URL and service-role key, while missing OpenAI is a warning (`worker/preflight.js:1-45`).

## Storage and upload invariants

- Import and note buckets are private and have configured MIME/size limits (`http/uploads.js:64-105`).
- Storage names are sanitized and placed under a user-ID prefix; signed storage upload paths are revalidated by prefix before download (`http/uploads.js:107-135`, `138-190`).
- Chunk uploads accept a bounded chunk count; the API reconstructs the buffer and validates the complete file after retrieval.
- Note-image validation is separate from import-file validation (`http/uploads.js:36-57`).
- Export downloads require an owner-scoped `ready` request and existing artifact; successful download is audit logged (`routes/dataExportRoutes.js:39-64`).

## Rembr rebuild requirements

1. Define a typed `Store` interface that both local and Supabase implementations satisfy; explicitly represent optional capabilities instead of silent `typeof` checks.
2. Preserve ownership as a required predicate in every store operation and test cross-user IDOR cases for all entity types.
3. Make migrations idempotent, ordered, and independently verifiable; include policy/function permissions in a schema ledger and test service-role versus client behavior.
4. Keep job state transitions and lease/attempt mutation atomic in SQL for hosted operation; test duplicate claims, expired leases, pause/resume, max attempts, and concurrent workers.
5. Make data export and account deletion explicit state machines with auditable, retryable steps and redacted user-facing status.
6. Preserve source/analysis hashes, processing levels, and provider provenance to enable safe reprocessing and explainable search.
7. Record external provider configuration as unknown until verified in a controlled environment; never copy secrets or live user data into Rembr docs.

## Verification gaps

- A source-level bug is visible in the Supabase storage-import claim path: `claimStorageImport` refers to `status` and `errorMessage` identifiers that are not parameters or local declarations (`apps/orchestration/src/stores/supabaseStore.js:1157-1179`). The analogous local-store path does not have this code. A successful Supabase claim with a user id therefore appears to throw `ReferenceError` while recording activity, after the database row has already transitioned to `processing_storage`; see `storage-import-flow.md` and the recovery implications there. This is source inspection, not a reproduced hosted failure.
- Repository SQL and security scripts validate selected assumptions, but the files alone do not prove hosted migrations were applied or live RLS is correct.
- Local-store tests cannot establish Supabase RLS or storage policy behavior.
- Worker unit tests do not prove multi-process locking/lease behavior against a live database; SQL function and concurrency tests are required for Rembr.
- No production database was queried during this source audit.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
