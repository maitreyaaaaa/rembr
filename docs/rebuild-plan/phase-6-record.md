# Phase 6 — Account, privacy, admin, and billing

- Status: **In progress; exit gate not passed.**
- Scope: Account data map, complete personal-data export, account-deletion lifecycle, security activity, privacy controls, admin/support, approved billing/credits, and data retention. See [`phase-gated-roadmap.md`](phase-gated-roadmap.md), [`feature-and-acceptance-matrix.md`](feature-and-acceptance-matrix.md), and [`phase-6-architecture-design.md`](../architecture/phase-6-architecture-design.md).
- Implementation branch: `feat/phase-6-account-privacy-admin-billing`.
- Sequencing: The user deferred Phase 5 extension/connected workflows and directed Phase 6 as the next work area. Phase 5 remains planned for later. Phases 3 and 4 remain open; this Phase 6 work does not close or waive those gates.

## Acceptance evidence

### Account-freeze groundwork

- Shared active-owner locks fence account, library, import, AI, knowledge, and export writes against a concurrent account freeze. Provider work uses expiring owner leases with heartbeats; capture media and export artifacts persist planned storage keys before writing so deletion and recovery can find orphaned objects.
- Account data map, personal-data export, request/cancel/approve/retry deletion, security activity, and a redacted admin deletion queue/audit screen are implemented locally on this branch.
- This is not a completed Phase 6 gate. Hosted Supabase migration/storage behavior, authenticated browser and accessibility review, full data-field coverage, role provisioning, complete retention policy, and approved billing remain open.

| Requirement | Status | Evidence and remaining gap |
|---|---|---|
| Owner-visible account data map | **Implemented locally; hosted and browser evidence open** | `apps/api/src/account/data-map-service.ts` counts owner-scoped tables using static SQL and parameterized owner values; labels file bytes and external provider copies as uncounted. `GET /api/account/data-map` requires a verified session and returns `Cache-Control: no-store`. Settings shows category counts and boundary notes. API tests cover category counts, owner isolation, missing owner ID, auth requirement, and no-store response. |
| Complete personal-data export | **Implemented locally; coverage and hosted gates remain open** | `apps/api/src/account/data-export-service.ts` exports data-map tables with owner predicates, excludes password hashes, token hashes, and worker/storage internals, and packages bounded private files in a versioned ZIP. Authenticated request/history/status/cancel/retry/download routes, lease-fenced worker processing, private storage, and seven-day expiry are integrated. Tests cover owner isolation, credential exclusion, private files, limits, retry, expiry, storage, and route caching. Remaining evidence: systematic field/table coverage review, authenticated browser review, and hosted migration/bucket/worker verification. |
| Full account deletion | **Implemented locally; hosted/browser and lifecycle coverage remain open** | Owner request freezes the account; cancellation, admin approval, claim leases, checkpointed storage cleanup, retries, and deletion/security audit are wired. Owner work leases and durable media/export object intents close important write races. Media cleanup queue entries now retain owner attribution, and deletion drains queued media keys even after their artifact rows are gone. Focused tests cover auth, denial, retry after storage failure/max attempts, provider-drain admission, storage-write freeze, and orphan-key recovery. Pre-migration queue rows without a surviving artifact remain unattributed and depend on the global worker cleanup sweep. Remaining evidence: hosted Supabase/storage run, browser review, and complete writer/data inventory. |
| Security activity and privacy controls | **Implemented locally; retention policy and browser evidence remain open** | Owner-only activity returns bounded event labels/timestamps, prunes after 90 days, and omits secrets/content. Settings now includes activity and deletion controls. Verify all user-facing statements against a complete retention/provider policy before passing the gate. |
| Admin/support | **Implemented locally for deletion operations; broader support scope remains open** | Support/admin roles, redacted bounded queue, self-role endpoint, audit projection with allowlisted metadata, explicit action confirmation, rate limits, and denial/redaction tests are present. A one-time, server-side bootstrap CLI now provisions the first admin from an existing active account; it requires explicit confirmation and refuses if any admin role already exists. The screen currently covers deletion support rather than general account lookup. |
| Billing/credits | **Not implemented; disabled** | Requires product/config approval and tested signature validation, replay protection, purchase ownership, and atomic ledger idempotency. |
| Retention and lifecycle | **Partial; policy gate remains open** | Security activity retains 90 days and completed exports expire after seven days. Deletion audit retention, backups, provider copies, and remaining source/derived records need explicit retention rules and verified cleanup behavior. |

## Checks

- `npm.cmd run check` passed locally on 2026-10-30: API/web typecheck and lint, **174 API tests**, and API/web production builds. The suite includes one-time admin bootstrap failure/success cases, owner-attributed queued-media deletion, deletion, activity, admin, media/export intent recovery, lease-heartbeat retry/loss, storage timeout/abort, local media-write abort, bounded standalone-audio discovery/chunking for page-exposed MP4, WebM, and Ogg inputs, cancellation propagation through media and token-count requests, and temp cleanup after owner lease loss.
- Vite emitted the large JavaScript chunk warning (2.36 MB minified); build succeeded.
- `git diff --check` passed. No hosted database or provider changes were made; browser and hosted migration/storage evidence were not run.

## Next steps

1. Complete the writer-path and export-field inventory, then verify the deletion worker and private storage against hosted Supabase without using production customer data.
2. Review `/admin`, Settings, deletion, and export flows in an authenticated browser, including keyboard and narrow-screen states.
3. Decide and document retention durations for deletion audits, backups, logs, and provider boundaries; implement and verify the applicable cleanup rules.
4. Run and verify the one-time initial-admin command in the intended environment; define a separately audited process for later role changes. Keep billing disabled until product approval and callback/ledger behavior can be verified.
5. Reconcile all Phase 6 data tables with export/deletion, then rerun the full acceptance gate.
