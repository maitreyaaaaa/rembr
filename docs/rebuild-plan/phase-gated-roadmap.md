# Rembr phase-gated rebuild roadmap

## Purpose

This document is the controlling implementation sequence for rebuilding Rembr from the IScraper evidence set. Work proceeds one phase at a time. Each phase ends with a review of the running product, test evidence, known issues, and documentation. If a gate fails, work returns to the responsible phase, the design or implementation is corrected, and the gate is rerun before the next phase starts.

## Current progress — 2026-10-28

- **Phase 1: Passed locally.** See [Phase 1 record](phase-1-record.md); hosted CI and production database behavior are not claimed as verified.
- **Phase 2: Passed locally.** See [Phase 2 record](phase-2-record.md); hosted CI and hosted database behavior remain unverified.
- **Phase 3: Approved and implementation in progress.** Product decisions and upload limits are recorded in [Phase 3 architecture design](../architecture/phase-3-architecture-design.md); implementation evidence will be recorded before the phase gate is evaluated.

This is a plan, not evidence that any feature exists or has passed. The IScraper repository remains a read-only reference. Rembr gets a new repository and history, synthetic development data, and its own visual identity. Every feature found in the audited source remains in scope unless the user explicitly approves a change; no phase may quietly drop a capability. Any redesigned behavior or approved scope change must be recorded in the feature matrix and screen/workflow map.

## How to run the phases

For each phase, maintain a short phase record with: scope and owner; source-to-Rembr trace links; decisions and assumptions; changed files; commits for real coherent work; checks and their environment; screenshots or logs where relevant; defects found; fixes and rerun evidence; unresolved risks; and gate decision. Mark checks `passed`, `failed`, or `not run`; do not count a code review or mocked response as runtime proof.

The phase gate is binary for progression (`passed` or `failed/rework`). Checks themselves use `passed`, `failed`, or `not run`. A phase cannot pass while an acceptance check is unrun unless the criterion explicitly requires external live evidence and the unavailability is recorded as a non-blocking accepted limitation by the product owner.

Use this severity mapping consistently in the issue register and phase records: **P0/Critical** means an active or near-certain severe security/privacy breach, cross-tenant exposure, irreversible data loss, or blocked core path; **P1/High** means a major safety/correctness failure or important workflow failure with no safe workaround; **P2/Medium** means a bounded defect with a documented workaround and no material safety/data-integrity impact; **P3/Low** means polish, minor usability, or low-impact follow-up. P0/P1 prevent progression. P2/P3 require an owner, impact, mitigation and explicit acceptance before a gate may pass.

1. Compare the implementation with the phase deliverables and feature matrix.
2. Run the phase checks plus the relevant regression checks from earlier phases.
3. Review security, privacy, accessibility, data lifecycle, and failure states affected by the phase.
4. Fix blockers. Never pass with an unresolved P0/P1 safety, privacy, data-loss, or core-correctness issue. A P2/P3 may remain only with a named owner, impact, mitigation, and explicit product-owner acceptance; rerun affected checks.
5. Record residual issues, evidence, owner, and the gate decision.
6. Advance only when the exit criteria pass. A failed gate loops to implementation and verification in that phase.

“Complete” means the documented acceptance criteria pass in a reproducible environment. External provider or hosted behavior remains `not run` until verified against that real environment. If time, access, or capacity makes a gate infeasible, stop and re-plan openly; do not relabel a partial build as full parity.

## Phase overview

| Phase | Name | Result that must be proven | Primary dependencies |
|---|---|---|---|
| 0 | Scope, evidence, and design contract | Every audited capability has an owner phase and a testable outcome; high-risk decisions are resolved or explicitly gated | Existing audit documentation |
| 1 | Core foundation and vertical slice | A user can securely save one supported URL, process it deterministically, retrieve it, and delete it | Phase 0 |
| 2 | Identity, tenancy, and library lifecycle | Authenticated users can manage their own items and organization data with tenant isolation | Phases 0–1 |
| 3 | Ingestion, durable jobs, and content processing | Import and capture paths recover safely through retries, failures, and worker restarts | Phases 1–2 |
| 4 | Search, knowledge, and optional AI | Core retrieval works without providers; optional enrichment is evidenced and degrades safely | Phases 2–3 |
| 5 | Browser extension and connected workflows | Explicitly initiated extension capture and source-backed integrations work through secured, auditable contracts | Phases 1–4 as applicable |
| 6 | Account, privacy, admin, and billing | Export, deletion, settings, support, and billing surfaces have explicit authority and lifecycle rules | Phases 2–5 |
| 7 | Complete screen parity and Rembr visual system | Every in-scope screen and state is implemented and visually distinct, accessible, and responsive | Phases 1–6; UX can be built incrementally, final visual pass follows functional coverage |
| 8 | Full-system verification and hardening | Cross-surface flows, security boundaries, migrations, accessibility, and failure recovery pass with recorded evidence | Phases 1–7 |
| 9 | Deployment, demo, and submission | A reviewer can reproduce the demo and understand the product, evidence, and limitations | Phase 8 |

The “core phase” is **Phase 1**: the smallest end-to-end product slice across UI, API, persistence, and deterministic processing. It proves the architecture with real behavior before the team expands into breadth. The detailed screen, workflow, and backend ownership by phase is in the [screen/workflow phase matrix](screen-workflow-phase-matrix.md). Phase 1 does not replace the complete parity goal; it provides the stable spine on which the later phases depend.

## Current deadline and schedule reality

The official [Meta Global AI Developer Hackathon page](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon) lists the build window as October 26–November 4, 2026 and submission deadline as November 4 at 9:00 PM ET. As of October 28, the original ten-day window is already underway and about seven calendar days remain. The [ten-day plan](ten-day-rebuild-plan.md) is therefore a historical planning baseline, not a current promise or feasible estimate. Rebaseline capacity, team availability, access to required services, and every source-backed feature before starting Phase 1. The phase gates stay intact; do not compress verification or silently reduce parity. If full scope cannot fit, surface the conflict and get an explicit product decision.

The accessible official event page lists two tracks and broad themes and links the Muse Spark/Meta model resources. It does not expose binding judging weights or prove that one particular model is mandatory. Verify final submission requirements and any Meta AI usage rule against published official rules before implementation/demo; do not turn inferred judging assumptions into requirements.

## Phase 0 — Scope, evidence, and design contract

### Work

- Read the source audit, screen inventory, API and worker contracts, extension review, issue register, feature matrix, and architecture decisions as one connected specification.
- Reconcile every feature row to one or more phases, source evidence, data/API dependencies, security/failure acceptance, and user-visible outcome.
- Confirm the full source-backed parity inventory, record any intentional redesigns, and obtain explicit user approval for any scope change.
- Resolve implementation-blocking choices: team capacity and ten-day feasibility; auth and database; hosting; supported browser; provider and challenge integration; upload/storage; data retention; and the handling of unfinished or unverified reference behavior.
- Turn the screen list into workflow maps and contracts. Identify owners, external boundaries, synthetic fixtures, and demo evidence for each vertical slice.
- Convert confirmed defects into Rembr requirements where they affect correctness or security. Keep suspected/live-hosted questions clearly marked as unknown.

### Verification

- Every row in the feature matrix names a phase, a specific acceptance outcome, and evidence needed to prove it.
- Every screen has its trigger, user goal, states, navigation, data/API needs, authorization, errors, and accessible interaction documented.
- Every API/worker/extension boundary has an owner, authentication mode, request/response/error contract, and relevant tests identified.
- Architecture decisions list rationale, trade-offs, consequences, and revisit triggers; no unresolved decision silently becomes an implementation assumption.
- Time and scope are capacity-checked. If complete parity cannot fit, record the resourcing or schedule change instead of hiding a scope cut.

### Exit gate

The team can explain the complete in-scope product and its dependencies from the docs alone, and has approved a traceable feature-to-phase acceptance matrix. If not, remain in Phase 0.

## Phase 1 — Core foundation and vertical slice (core phase)

### Work

- Create the independent Rembr repository, package layout, development instructions, safe environment template, formatting/type/lint/build commands, CI checks, and local database/migration path.
- Define the initial domain and API contracts for user identity, saved item, processing job, extracted artifact, timestamps, and typed errors. Keep framework and storage details behind clear boundaries.
- Implement verified authentication/principal resolution and owner-scoped access before exposing private data. Add request IDs, safe errors, security headers, CORS allowlist, configuration validation, and health status.
- Deliver one thin vertical journey: establish a verified user principal; submit one supported public URL; validate it; persist an item and durable job; run deterministic extraction; show status and item detail; find it in the basic library; delete the item and cancel/neutralize its queued job so removed content cannot be recreated. Full session/profile/onboarding lifecycle and broad library/child CRUD are Phase 2; import formats and robust job recovery are Phase 3.
- Use synthetic fixtures. Do not require an AI provider for this journey.

### Verification

- Fresh setup instructions work from a clean checkout; secrets are absent from tracked files and frontend bundles.
- Unauthenticated access and cross-user item/job access are denied by API and persistence-level checks.
- The capture request does not claim success before durable acceptance; refresh recovers canonical server state.
- A valid fixture reaches a deterministic ready state; invalid or unsafe URL cases fail safely with a useful message.
- Delete prevents a queued/in-flight worker from resurrecting removed content, or the documented state transition proves a safe alternative.
- CI build, type/lint, migration apply, and core automated tests pass; screenshots show loading, success, and failure states.

### Exit gate

The complete core journey passes on a clean environment, including negative tenant and failure-path cases. No critical/high blocker in identity, URL safety, persistence, or job correctness remains.

## Phase 2 — Identity, tenancy, and library lifecycle

### Work

- Complete session restore/expiry/sign-out, profile and onboarding gates, account status, user-owned library and child-resource CRUD, metadata editing, duplicate rules, notes/assets, and owner-scoped collection/tag operations. Phase 1 only requires the minimum verified principal and one item lifecycle needed by the vertical slice.
- Define URL and item canonicalization, item and child ownership, soft/hard deletion semantics, query pagination and filtering, and migration compatibility.
- Implement responsive workspace navigation and shared route/deep-link behavior for the library, item detail, add/save, collections, and settings entry points.
- Add transaction and concurrency rules so child rows cannot be written under a foreign owner or invalid parent.

### Verification

- Two-user tests cover item, child, collection, search, and job access; direct object identifiers cannot bypass parent ownership.
- CRUD, duplicate, pagination, sort/filter, reload, Back/Forward, empty, loading, error, and no-results behavior is deterministic.
- Keyboard-only use, focus order/return, responsive navigation, and screen-reader names/status messages are reviewed for the completed surfaces.
- Database migrations apply from an empty database and from the declared supported prior state; rollback/repair steps are documented.

### Exit gate

All Phase 2 feature rows and screen states pass, ownership rules agree across UI/API/store/database, and the Phase 1 regression suite remains green.

## Phase 3 — Ingestion, durable jobs, and content processing

**Status (2026-10-28):** Design approved; implementation in progress. Current checkpoint and remaining gate work are tracked in [Phase 3 architecture](../architecture/phase-3-architecture-design.md). The local workspace check currently passes, but media downloads, fault/restart/concurrency coverage, and browser/accessibility review remain open; do not proceed to Phase 4 or mark Phase 3 complete yet.

### Work

- Add all in-scope import/capture formats and upload flows, parsing, normalization, deduplication, private storage, and the audited source auto-queue behavior after successful parsing.
- Implement durable job creation/claim/lease/fencing, bounded retries and backoff, idempotent writes, pause causes, terminal failures, cancellation, restart/reprocess, and stale-job recovery.
- Build deterministic extraction and content artifacts first. Add supported metadata, text, media, and provenance paths only with bounded resource use and clear partial-ready states.
- Implement internal worker health, sanitized diagnostics, correlation across request/import/job/item, owner-scoped per-item recovery actions, and no owner-visible global worker-health projection.
- Address known reference defects deliberately; do not reproduce accidental source behavior when it conflicts with correctness or security.

### Verification

- Concurrent workers cannot commit the same attempt; stale leases cannot overwrite newer results; retry count and delay are bounded.
- Tests cover duplicate enqueue, worker crash/restart, timeout, malformed/oversized files, unsupported input, partial extraction, storage failure, cancellation, and deletion during processing.
- Uploaded files and derived assets are private, size/type constrained, owner-scoped, and covered by export/deletion policy.
- Every state shown to users is backed by persisted state and recovers correctly after refresh or process restart.

### Exit gate

Every in-scope ingestion path completes or fails predictably under injected faults, and no job/data-loss blocker remains. Baseline extraction does not depend on AI.

## Phase 4 — Search, knowledge, and optional AI

### Work

- Implement library keyword/metadata search, filters, result ranking rules, search state, feedback, and any required semantic/visual/Lens/graph/smart collection features from the accepted feature matrix.
- Build model/provider interfaces separately from deterministic retrieval. Add only the challenge-relevant AI integration after checking current requirements, access, limits, and source documentation.
- Define prompt/input limits, provider timeout and quota states, response provenance, citation mapping, caching, rate budgets, sensitive-data redaction, and degraded-mode behavior.
- Implement every source-backed grounded library chat or summary capability represented in the feature matrix; returned citations must map to actual user-owned source artifacts.

### Verification

- Search and core browsing remain available with all providers disabled and return tenant-scoped deterministic results.
- Provider success, timeout, invalid output, quota/credential absence, stale cache, and partial result behavior are tested or explicitly marked not run if external proof is required.
- AI outputs and citations are distinguishable from source facts; citation URLs and model output are treated as untrusted input.
- Search latency/quality evidence states fixture size, environment, and measurement method; no unsupported performance claim is made.

### Exit gate

All agreed search/knowledge features meet acceptance; provider-off and provider-failure cases preserve the usable core; no ungrounded output is presented as authoritative.

## Phase 5 — Browser extension and connected workflows

### Work

- Implement the audited extension surfaces and explicit page-save action, login/connection handoff, token issuance/refresh/revocation, popup/overlay states, supported-origin policy, and API error recovery.
- Align manifest permissions, extension UI, API CORS/origin checks, and server-side authorization. Keep passive page inspection behind the agreed explicit privacy preference.
- Add only integrations present in the source inventory and matrix (for example agent/MCP, Telegram, Gmail, or automation/publishing workflows) with signed/verified callbacks, idempotency, audit logging, and explicit approval before consequential side effects. Billing and credit lifecycle belongs to Phase 6.
- Treat integrations as adapters around Rembr contracts; do not duplicate core library ownership or indexing logic.

### Verification

- Browser tests cover supported origins, denied origins, permissions, login, token expiry/revocation, explicit save, duplicate, API unavailable, and truthful success feedback.
- Extension does not announce save before server acceptance; disconnect revokes server credentials as designed and clears local credentials.
- Integration callbacks resist replay/invalid signatures; automation/publication actions cannot execute without the required approval record.
- Browser/runtime/provider checks are captured on the supported matrix; source or unit tests alone do not prove live extension behavior.

### Exit gate

Each enabled integration has a complete authorization and failure contract plus runtime evidence or an explicit disabled/not-run state. No external side effect is possible outside its approval and audit boundary.

## Phase 6 — Account, privacy, admin, and billing surfaces

### Work

- Build profile/settings, data map, account summary, export request/status/download, deletion request/cancel/approval/process, security activity, and user-facing privacy controls.
- Build admin/support capabilities only to the documented role and safe-projection contract; separate support metadata from private content and protect privileged mutations with audit events. Cross-cutting health, metrics, alerting, and runbooks are verified in Phase 8 and deployed/evidenced in Phase 9.
- Implement billing and credit surfaces only where approved, including signed callbacks, idempotent ledger behavior, and correct access policy. Keep optional/unsafe functionality disabled until live configuration is verified.
- Complete retention and lifecycle rules across source data, derived artifacts, vectors, logs, exports, tokens, provider copies, and in-flight jobs.

### Verification

- Export is owner-scoped, time-limited, statusful, and complete against the data map; deletion is idempotent, recoverable after partial failure, and prevents new processing.
- Admin access and every privileged action have negative authorization tests, sanitized response checks, and durable audit evidence.
- Billing callbacks are signature-verified, replay-safe, and ledger-idempotent; if live credentials are unavailable, production behavior is not claimed as passed.
- Privacy settings visibly control the corresponding behavior, and no user-facing toggle gives false assurance.

### Exit gate

Every account/admin/billing capability in scope has a tested authority model and end-to-end data lifecycle. Critical deletion/export or privileged-access findings are fixed before proceeding.

## Phase 7 — Complete screen parity and Rembr visual system

### Work

- Reconcile all public, workspace, modal, drawer, responsive, admin, and extension screens against the UI inventory and feature matrix. Functional screen work may be delivered earlier; this phase closes remaining gaps and validates the whole visual system.
- Apply Rembr-specific visual language, naming, iconography, typography, color, spacing, motion, and components. Do not reuse IScraper branding/assets without a rights decision.
- Complete every screen’s loading, empty, error, partial, disabled, success, confirmation, and permission states. Verify all navigation and cross-screen state transitions.
- Provide keyboard access, focus management, semantic labels, contrast, zoom, reduced motion, and desktop/tablet/mobile behavior.

### Verification

- Every screen row has screenshot or recorded manual review evidence at agreed viewports; visual checks use a fresh running build.
- Complete journeys work via mouse, keyboard, and supported assistive interaction; overlays trap/return focus correctly and status changes are announced.
- No interaction is a dead end; back/forward and deep links restore intended state; responsive layouts have no clipped controls or horizontal overflow.
- Distinct visual identity is reviewed alongside usability and accessibility; branding work has not removed essential status, safety, or provenance cues.

### Exit gate

All in-scope screens and states map to acceptance evidence, and functional completeness remains intact after the visual pass.

## Phase 8 — Full-system verification and hardening

### Work

- Run the complete build, lint, typecheck, unit, API, persistence-adapter, migration, worker-concurrency, extension, and end-to-end suites.
- Perform threat-based review of auth, tenant isolation, URL fetch, uploads, extension messages/tokens, SSRF/redirect behavior, provider prompts/outputs, callbacks, admin, deletion/export, and rate budgets.
- Test backup/restore or recovery, data migrations, clean install, provider-off mode, degraded dependencies, observability, and privacy-safe logs.
- Conduct accessibility, responsive UI, synthetic-load, and performance checks. Resolve issues by severity and rerun impacted regression tests.
- Reconcile every issue-register item as fixed with evidence, accepted residual risk with owner, or blocking. No unresolved critical/high security or data-loss issue may pass silently.

### Verification

- All required checks have command/version/environment/date/result and artifact links; unavailable checks are `not run` with reason.
- Critical journeys pass from a clean environment with synthetic data, including failure injection and recovery.
- Data access, migrations, RLS/RPC ACLs, logs, provider boundaries, and destructive actions have been reviewed against the final deployed configuration.
- Accepted residual risks are visible to the team and reviewer; tests/mock success is not presented as live-provider proof.

### Exit gate

The final quality checklist is complete with no critical/high blocker. Any gate failure loops to the phase responsible, then all impacted regressions are rerun.

## Phase 9 — Deployment, demo, and submission

### Work

- Deploy only after Phase 8 passes; configure Production and Preview independently and keep unverified providers/billing off.
- Run authorized deployment smoke checks and verify auth, database migrations, worker health, extension/API connectivity, and provider gating in the actual demo environment.
- Prepare synthetic seeded demo data, a reviewer guide, architecture summary, known-limitations note, short demo script/video/screenshots, and submission narrative.
- Explain Rembr’s fresh implementation and source-informed lineage honestly. Commit history records actual work and is not used as artificial proof of origin.

### Verification and exit gate

- A reviewer can follow capture → processing → browse/search → organization → privacy/delete/export as applicable, including at least one useful degraded or error state.
- Demo setup is reproducible and contains no production/customer data or secrets; public claims link to current evidence.
- Submission requirements and deadlines are checked against current official hackathon instructions; deployment and provider claims are live-verified or explicitly qualified.
- Final repository state, release notes, limitations, and evidence links are reviewed. Only then mark the rebuild complete.

## Scheduling relationship

The phases define quality gates; calendar estimates never authorize skipping a gate. The original ten-day schedule is superseded as a current forecast because the event window is already underway; see [current deadline and schedule reality](#current-deadline-and-schedule-reality) and the [ten-day baseline](ten-day-rebuild-plan.md). Re-plan with actual team capacity and current date before Phase 1. If full parity cannot fit, preserve the gates and obtain an explicit product decision about schedule or scope.

## Phase progression record template

```markdown
## Phase N — [name]
- Status: not started | in progress | failed/rework | passed
- Scope and feature-matrix rows:
- Source/design references:
- Decisions and assumptions:
- Implementation commits (actual work only):
- Checks run (command, environment, date, result):
- Visual/runtime evidence:
- Defects found and fixes:
- Regression checks rerun:
- Open issues and accepted risks:
- Gate decision and reviewer:
```

## Source documents

- [Feature and acceptance matrix](feature-and-acceptance-matrix.md)
- [Ten-day rebuild plan](ten-day-rebuild-plan.md)
- [Final review checklist](../quality/final-review-checklist.md)
- [Architecture decisions](../architecture/architecture-decisions.md)
- [Issues and improvements](../registers/issues-and-improvements.md)
- [Screen specifications](../screens/ui-surface-and-screen-specifications.md)
- [Backend rebuild sequence](../backend/backend-rebuild-sequence.md)
- [Screen/workflow phase matrix](screen-workflow-phase-matrix.md)
- [Rembr design-system brief](../screens/rembr-design-system-brief.md)


## Related documents

- [Feature acceptance matrix](feature-and-acceptance-matrix.md)
- [Screen/workflow phase matrix](screen-workflow-phase-matrix.md)
- [UI screen specifications](../screens/ui-surface-and-screen-specifications.md)
- [Final review checklist](../quality/final-review-checklist.md)
