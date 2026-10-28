# Rembr ten-day rebuild plan

**Status: original baseline, superseded as a current forecast on October 28, 2026.** The official [event page](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon) lists the submission deadline as November 4, 2026 at 9:00 PM ET. The ten-day event window began October 26, so roughly seven calendar days remain on October 28. This document preserves the original ten-day sequence for dependency planning only; it does not establish that complete parity is feasible in the remaining window. Before implementation, re-estimate against confirmed team capacity and service access. Keep all phase gates; do not silently reduce the source-backed scope. See the controlling [phase-gated roadmap](phase-gated-roadmap.md), [feature matrix](feature-and-acceptance-matrix.md), and [screen/workflow phase matrix](screen-workflow-phase-matrix.md).

## Planning assumptions

This baseline sequence is not a promise that every capability can ship regardless of access, provider limits, or team size. If used as an execution reference, each timebox ends with a reviewable product increment and a small commit group after roughly two or three coherent implementation steps. Commits must describe real work; do not manufacture commits to create an appearance of project age. The new Rembr repository should have its own history and should not import IScraper history or private data. UI restyling follows functional parity as requested, but the initial shell should still be accessible and usable.

The full product scope and feature acceptance criteria are in `../screens/ui-surface-and-screen-specifications.md`, `../backend/`, and `../extension-security/`. Resolve the completion matrix in `feature-and-acceptance-matrix.md` before declaring parity.

## Original ten-day sequence (planning baseline)

### Day 1 — Repository foundation and contract freeze

**Build:** initialize the new Rembr repo, workspace/toolchain, environment template, formatting/lint/build scripts, CI, local database setup, and documentation index. Define identity, saved item, collection/tag, processing job, and user-visible status contracts.

**Reasoning:** contracts reduce UI/API/worker drift. Use synthetic fixture content only. Create schema/API type definitions and a small contract test suite before feature implementation.

**Acceptance:** fresh clone instructions work; no secrets committed; migration applies locally; route and data contracts are reviewed; web/API/extension packages can be built independently.

**Commit group:** foundation; contract types and schema; CI and local developer workflow.

### Day 2 — Authentication, tenant isolation, and application shell

**Build:** auth session lifecycle, server-side principal derivation, route protection, user-owned data policies, responsive application navigation, loading/empty/error patterns, and audit event shape.

**Acceptance:** authenticated user can enter app; unauthenticated requests fail safely; cross-tenant API/database tests deny access; keyboard navigation reaches primary shell controls; no protected data flashes before session resolution.

**Commit group:** auth wiring; authorization/data policies; shell and route guards.

### Day 3 — Capture and saved-content lifecycle

**Build:** URL add/save flow, canonicalization, duplicate handling, URL safety validation, saved-item list/detail, edit metadata, delete confirmation, and durable processing-job creation.

**Acceptance:** a valid URL creates durable pending state; duplicates have deterministic behavior; invalid/private-network URLs are rejected safely; delete stops queued processing; client can refresh and recover state from server.

**Commit group:** API save contract; persistence and URL controls; UI capture/list/detail.

### Day 4 — Worker and deterministic extraction

**Build:** job claimant, lease fencing, retry/backoff, timeout/resource limits, extraction adapter, normalized content, deduplicated writes, failure taxonomy, and worker observability.

**Acceptance:** concurrent workers do not double-commit; stale lease cannot overwrite current attempt; transient failures retry within bounds; permanent failures become actionable; deterministic extracted title/text are queryable.

**Commit group:** job state machine; extraction adapter; retries/observability.

### Day 5 — Core browse, organization, and search

**Build:** dashboard/collection surfaces, filters, tags/collections, sorting, pagination, search baseline, saved-content detail and related content. Provide useful states for pending, partial, failed, empty, and ready.

**Acceptance:** user can find and organize captured content; search is deterministic and tenant-scoped; pagination/filter combinations are stable; response times measured on a documented fixture set.

**Commit group:** organization API/data; search and list query; UI workflows.

### Day 6 — Browser extension and secure API handoff

**Build:** minimum-permission browser extension, explicit save action, auth/login handoff, popup/overlay states, API error handling, token refresh/revocation, and privacy/permission copy.

**Acceptance:** extension saves current page with explicit action; supported origins are consistent across manifest/CORS/API; unauthenticated and expired-token paths recover; extension never reports a save before durable API acceptance; keyboard/screen-reader interactions work.

**Commit group:** manifest/permission contract; auth handoff/client; capture UX and integration.

### Day 7 — Optional enrichment and graceful degradation

**Build:** source-backed model/vision/ASR/OCR adapters, provider abstraction, timeouts/rate limits, provenance, partial-ready state, and feature gating. Separately verify the current Meta AI rules and account access for the demo integration; provider access affects live proof, not whether an audited capability remains documented in scope.

**Acceptance:** core save/search works with provider disabled; model errors do not erase deterministic output; user-visible state distinguishes unavailable/failed/complete; prompt inputs and provider outputs are bounded and sensitive fields redacted from logs.

**Commit group:** provider interface and deterministic baseline; one integrated enrichment path; graceful degradation/usage instrumentation.

### Day 8 — Complete secondary screens, export/deletion, and visual system

**Build:** remaining in-scope screens from the screen inventory, settings, profile/account, export/privacy controls, full deletion semantics, and the distinct Rembr visual theme.

**Acceptance:** every screen in the matrix has ready/empty/loading/error states; export/deletion is tenant-safe and covers derived data; consistent typography/colors/focus/motion and responsive layout pass manual review.

**Commit group:** secondary workflows; privacy lifecycle; visual system and responsive polish.

### Day 9 — Quality hardening and end-to-end proof

**Build:** API/UI/worker/extension integration tests, accessibility and responsive review, migration rehearsal, load/security checks, error telemetry, and demo seed data that is synthetic and reproducible.

**Acceptance:** build/lint/tests pass; critical end-to-end flows pass in clean environment; no high-severity unresolved issue in the issue register; backups/rollback and deployment config reviewed; test evidence links are recorded.

**Commit group:** integration coverage; security/privacy hardening; accessibility/performance fixes.

### Day 10 — Deployment, demo, and submission package

**Build:** deploy stable demo, verify production-like config and provider gating, run smoke tests, prepare short demo script/video/screenshots, architecture/product README, and reviewer guide.

**Acceptance:** external reviewer can understand the problem, watch a complete capture-to-search journey, inspect failure/degraded state, and understand what is original to this hackathon build. Submission claims are backed by evidence; no benchmark, feature, or provider claim is invented.

**Commit group:** deployment and evidence; demo materials; final submission tag/release notes.

## Daily operating rhythm

1. Start with one short dependency/decision review from the issue register.
2. Implement no more than two or three coherent changes before a focused review and commit.
3. Update source-to-feature traceability, tests, and demo proof in the same change group.
4. End the day with a runnable branch, notes on blockers, and a prioritized next-day list.
5. Never merge knowingly broken work to meet a commit-count target.

## Ten-day risk controls

- **Scope risk:** the full source-backed feature inventory is the parity target. Schedule pressure does not reduce it. If access or capacity makes completion infeasible, keep the gates, document the conflict, and obtain an explicit user decision before changing scope.
- **Provider risk:** reserve a deterministic demo route; obtain keys/credits only through authorized project setup; avoid provider-dependent critical paths.
- **Data risk:** synthetic content for demo and automated tests; no production IScraper database export.
- **Review risk:** maintain architecture decisions and source mapping; every inherited feature is labeled parity or a described redesign. Deferral requires explicit user approval.
- **Judging risk:** explain fresh implementation through honest source history and a concise provenance note. Commit cadence is for reviewability, not to misrepresent prior work.

## Go/no-go checkpoints

- End Day 2: tenant isolation and local setup proven.
- End Day 4: durable capture-to-ready pipeline proven without AI.
- End Day 6: extension independently saves through supported auth/API flow.
- End Day 8: full in-scope screen and workflow matrix reconciled.
- End Day 9: no unresolved critical/high security or data-loss issue.
- End Day 10: reviewer path and deployment evidence are reproducible.


## Related documents

- [Phase roadmap](phase-gated-roadmap.md)
- [Feature acceptance matrix](feature-and-acceptance-matrix.md)
- [Screen/workflow phase matrix](screen-workflow-phase-matrix.md)
- [UI screen specifications](../screens/ui-surface-and-screen-specifications.md)
