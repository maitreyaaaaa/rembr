# Phase 6 — Account, privacy, admin, and billing

- Status: **In progress; exit gate not passed.**
- Scope: Account data map, complete personal-data export, account-deletion lifecycle, security activity, privacy controls, admin/support, approved billing/credits, and data retention. See [`phase-gated-roadmap.md`](phase-gated-roadmap.md), [`feature-and-acceptance-matrix.md`](feature-and-acceptance-matrix.md), and [`phase-6-architecture-design.md`](../architecture/phase-6-architecture-design.md).
- Implementation branch: `feat/phase-6-account-privacy-admin-billing`.
- Sequencing: The user deferred Phase 5 extension/connected workflows and directed Phase 6 as the next work area. Phase 5 remains planned for later. Phases 3 and 4 remain open; this Phase 6 work does not close or waive those gates.

## Acceptance evidence

### Account-freeze groundwork

- A shared active-owner row lock now fences import creation/chunk recording/parsing/acceptance, AI usage reservations/results, and export request/claim/finalization against a concurrent account freeze. AI jobs also recheck owner status before media resolution and at provider-consent checkpoints.
- Worker claim recovery is separated from owner-first claiming so a future freeze/deletion transaction does not encounter child-row-to-owner lock inversion. Export claims lock the owner before the export row and retain skip-locked concurrency behavior.
- This is groundwork, not a completed deletion lifecycle. The complete writer-path inventory, in-flight provider dispatch protocol, deletion state machine, storage cleanup, and hosted/browser evidence remain open.

| Requirement | Status | Evidence and remaining gap |
|---|---|---|
| Owner-visible account data map | **Implemented locally; hosted and browser evidence open** | `apps/api/src/account/data-map-service.ts` counts owner-scoped tables using static SQL and parameterized owner values; labels file bytes and external provider copies as uncounted. `GET /api/account/data-map` requires a verified session and returns `Cache-Control: no-store`. Settings shows category counts and boundary notes. API tests cover category counts, owner isolation, missing owner ID, auth requirement, and no-store response. |
| Complete personal-data export | **Implemented locally; coverage and hosted gates remain open** | `apps/api/src/account/data-export-service.ts` exports data-map tables with owner predicates, excludes password hashes, token hashes, and worker/storage internals, and packages bounded private files in a versioned ZIP. Authenticated request/history/status/cancel/retry/download routes, lease-fenced worker processing, private storage, and seven-day expiry are integrated. Tests cover owner isolation, credential exclusion, private files, limits, retry, expiry, storage, and route caching. Remaining evidence: systematic field/table coverage review, authenticated browser review, and hosted migration/bucket/worker verification. |
| Full account deletion | **Not implemented** | Needs owner request/cancel, approval, distributed execution claim, retry-safe cleanup across records/files/vectors/jobs, audit, and prevention of account/job recreation. |
| Security activity and privacy controls | **Not implemented** | No complete security-event history or account retention control surface exists. Must avoid raw secrets/content in events and ensure controls match actual behavior. |
| Admin/support | **Not implemented** | Requires explicit operator role, safe projections, denied-actor tests, confirmation, rate limiting, and durable audit. |
| Billing/credits | **Not implemented; disabled** | Requires product/config approval and tested signature validation, replay protection, purchase ownership, and atomic ledger idempotency. |
| Retention and lifecycle | **Not implemented** | Must cover source/derived data, private files, vectors, logs, export artifacts, tokens, provider copies, and in-flight jobs. |

## Checks

- `npm.cmd run check` passed locally on 2026-10-30 with the account-freeze groundwork in the working tree: API/web typecheck, API/web lint, 141 API tests, and API/web production builds. Focused export, AI budget, and import suites also passed after the changes.
- Vite emitted the existing large JavaScript chunk warning (about 2.35 MB minified); build succeeded.
- `git diff --check` passed. No hosted database or provider changes were made.

## Next steps

1. Add retry-safe staged account deletion and security activity with durable audit records.
2. Implement admin/support policy and approved billing only after source contracts and Rembr authorization are reconciled.
3. Reconcile all new Phase 6 data tables with export/deletion lifecycle and rerun the full acceptance gate.
