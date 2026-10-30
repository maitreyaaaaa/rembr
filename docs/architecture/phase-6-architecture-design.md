# Phase 6 architecture — account, privacy, admin, and billing

## Status and sequencing

Phase 6 implementation is in progress on `feat/phase-6-account-privacy-admin-billing`; its exit gate remains open. The user explicitly deferred Phase 5 browser-extension and connected-workflow implementation for later and directed Phase 6 as the next scope. This is a sequencing exception only: Phase 5 remains in the roadmap and feature matrix. Phases 3 and 4 also retain open verification gates.

## Goals

- Give a signed-in owner a clear account data map and complete owner-scoped data export.
- Provide a request, cancellation, approval, and recoverable processing lifecycle for full account deletion.
- Show useful security activity without storing passwords, session tokens, raw queries, or private content in audit metadata.
- Limit admin/support access to explicit roles, safe projections, and audited privileged actions.
- Keep billing and credit behavior disabled until product approval and live configuration; when enabled, require signed callbacks, replay protection, and atomic idempotent ledger updates.
- Define retention and deletion behavior for source records, derived artifacts, private files, jobs, logs, vectors, exports, tokens, and provider boundaries.

## Architecture decisions

1. Keep Supabase Postgres as the only database (ADR-R12). All account queries derive the owner ID from the verified session; client-supplied owner IDs are never accepted.
2. Keep the API as the only app data boundary; RLS remains defense in depth, and every owner-scoped query names its owner predicate (ADR-R06). Derive export ownership columns from the same inventory used by the data map and deletion flow; include an operator's own role while omitting the granting operator's identifier.
3. Treat private file bytes as separate lifecycle artifacts from database metadata (ADR-R09). Exports enumerate database data and include bounded private files only through the private storage adapter. The data map must distinguish byte totals it cannot verify from database row counts.
4. Make deletion a durable state machine with an atomic claim/lease and idempotent steps. A successful destructive operation followed by failed step logging must be safe to retry. Missing ownership is not proof of completed deletion.
5. Use an app-owned export request record with owner, state, expiry, and processing lease. Downloads require both the authenticated owner and a ready or explicitly partial, unexpired request. Account records must match the versioned data map and an explicit per-table column policy; the exporter selects only approved columns and a schema-backed test fails when any mapped schema column is unclassified. Bounded private-file omissions are listed in the manifest with safe reason codes, while ownership, integrity, storage, and archive failures fail the export.
6. Keep audit records minimal and redacted. Security activity can include event kind, timestamp, outcome, and safe request metadata, but not secrets or raw user content.
7. Admin authorization is a separate policy from support metadata. Every privileged mutation must be role-checked, rate-limited, confirmed, and durably audited; denied role checks are also recorded with bounded redacted action metadata. Private content is excluded from default support projections.
8. Billing remains optional and fail-closed. No live checkout is enabled until prices, credentials, callback secret, access policy, and test evidence are configured and approved.
9. Bootstrap the first admin through a one-time server-side CLI, not an app endpoint. Require an existing active account, explicit operator confirmation, and an empty `admin_roles` table under a transaction lock. Later role grants, changes, and revocations use a separate admin-only, confirmed, rate-limited, audited flow that serializes changes and protects the last active administrator.
10. Keep media cleanup keys owner-attributed and drain them before deleting the identity. A storage key can outlive its `media_artifacts` row, so deletion enumerates both artifact rows and the owner-scoped cleanup queue; legacy unattributed queue entries are left to the global worker sweep.

## Source references and adaptations

Use IScraper's account/export/deletion/admin/credit flows to recover supported behavior from `apps/orchestration/src/routes/accountRoutes.js`, `routes/dataExportRoutes.js`, `services/dataExportPipeline.js`, `services/accountDeletion.js`, `routes/adminRoutes.js`, `services/credits.js`, and `application/billingWorkflow.js`. The complete source ADR porting review is recorded in [`source-adr-porting-review.md`](source-adr-porting-review.md). Preserve the reliability constraints in source ADR-001, worker-boundary constraints in ADR-002, Supabase evidence practices in ADR-009, and deterministic provider-off behavior in ADR-010. Do not import source's Vercel-specific runtime decisions into Rembr's Render deployment.

Do not carry forward source deletion behavior without the improvements recorded in `docs/backend/deletion-billing-exports.md`: it has no distributed processing claim, multi-step freeze can partially commit, and detached-owner steps can be recorded as completed without proving deletion. Source billing tests also do not prove invalid-signature rejection, replay handling, or ledger idempotency. Rembr must add those guarantees before enabling billing.

## Implementation sequence

1. Account data map: owner-scoped database row counts, clear private-file and provider-boundary disclosures. Implemented locally; user-facing count panel is in Settings. Hosted and browser verification remain open.
2. Full data export: authenticated request/status/cancel/download, bounded worker processing, complete manifest, expiring private artifact, and coverage against the Rembr data map. Implemented locally with staged artifact recovery, owner-work lease renewal, explicit per-table field projections, and a schema drift test. Known optional file omissions produce an explicitly partial, downloadable export with per-file reason codes; ownership, byte-integrity, transient storage, snapshot, and archive errors still fail closed. Authenticated browser and hosted storage evidence remain open.
3. Account deletion: owner request/cancel, admin approval, atomic execution claim, retry-safe data/storage cleanup, deletion audit, and prevention of job resurrection or account recreation. Implemented locally; hosted/browser evidence and complete writer-path inventory remain open.
4. Security activity and privacy controls: port source-backed export/import, processing, search, analysis, and safe deletion-progress events without raw metadata. Expose bounded owner-scoped labels and timestamps, include account activity in the shared export/deletion inventory, and expire it after 90 days. Partial exports have a separate safe activity label from complete exports. Keep settings tied to actual retention/provider behavior. Local owner activity and deletion controls are implemented; hosted retention and browser review remain open.
5. Admin/support: establish an explicit operator role, safe projections, denial tests, action confirmation, throttling, and immutable audit history. Local deletion queue and audit screen/API are implemented; admins can also search accounts by bounded email prefix, inspect safe account counts/activity, view aggregate worker queue counts plus oldest waiting timestamps, review 50 recent redacted import summaries, browse a keyset-paginated redacted audit stream, and request a redacted per-user timeline over existing security, deletion, export, import, and admin-access rows. These reads are rate-limited, no-store, and audited; denied role checks record only a fixed action label and the actual/required role. Account lookup uses hashed targets and omits raw search text. Role grants, changes, and revocations now use a confirmed admin-only route, lock and recheck the actor, protect the last active admin, and write hashed-target audit records. Remaining evidence includes authenticated browser review and verification of the initial-admin bootstrap in its intended environment; wider source activity-event coverage also remains open.
6. Billing/credits: implement only behind an off-by-default configuration boundary; verify provider signatures, replay safety, purchase ownership, and atomic ledger idempotency before enabling. Disabled pending explicit product and configuration approval.
7. Retention: reconcile every new and existing data category with export/deletion and expiry rules; add cleanup recovery where needed. Worker sweeps remove expired 12-hour sessions, 90-day search/security/admin-access events, seven-day export artifacts, and terminal export/deletion history after 90 days. Unresolved deletion requests remain for recovery. Hosted migration/storage evidence, backup configuration, provider-held copies, and a complete source/derived-record inventory remain open.

## Exit criteria

- Owner export contains complete account records against the current data map, clearly lists any optional private files omitted by configured limits or confirmed unavailability, is time-limited, and is downloadable only by the owner.
- Deletion is idempotent, recoverable after partial failure, fenced against concurrent workers, and prevents new processing.
- Admin access and every privileged operation pass both allowed and denied authorization tests, response sanitization, and durable audit checks.
- Billing callbacks pass invalid-signature, replay, wrong-owner, and duplicate-delivery tests; live production status is not claimed without verified configuration.
- Every privacy control matches actual behavior and every external provider/storage retention boundary is explicit.
- All in-scope schema changes and runtime behavior have reproducible evidence. The Phase 6 gate stays open while any required acceptance is unrun.
