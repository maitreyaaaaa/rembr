# Rembr final design and implementation review checklist

This checklist is a gate for the rebuild, not evidence that any check has already passed. Record command, environment, date, owner, and artifact link for each check. Mark unavailable checks as not run; do not substitute source inspection for runtime evidence.

## Product and workflow coverage

- [ ] Every row in `../rebuild-plan/feature-and-acceptance-matrix.md` has an explicit parity/redesign/defer outcome.
- [ ] Each screen specifies purpose, visual hierarchy, components, interaction state, API calls, data dependencies, failure states, accessibility, and responsive behavior.
- [ ] Every current source behavior needed for parity is separated from historical intent and proposed Rembr improvements.
- [ ] All external-facing claims in README/demo are supported by current Rembr evidence.

## Architecture and data

- [ ] C4/system context, package boundaries, API contracts, schema/relationships, worker state machine, provider adapters, and extension message contracts agree.
- [ ] Every user-owned table, object-storage path, derived artifact, vector, job, feedback row, and search response has an explicit ownership/deletion/export rule.
- [ ] Each migration has forward application, rollback/repair, compatibility, permissions/RLS/RPC ACL, and data migration notes.
- [ ] Database grants are checked separately from RLS; every privileged `SECURITY DEFINER` function pins `search_path`, schema-qualifies objects, enforces caller/record authority, and has narrowly scoped `EXECUTE` grants verified under real target roles.
- [ ] Store interface has explicit capabilities or compile-time contract; local and Supabase adapters have parity tests for required capabilities.
- [ ] Jobs have tested lease fencing, idempotency, bounded retries, timeout handling, terminal recovery, and stale-job repair.

## Security and privacy

- [ ] Auth identity is derived only from verified session or authorized workload credentials.
- [ ] Every route and child-resource lookup has negative cross-tenant coverage; worker paths are tested with mixed-owner fixtures.
- [ ] User URL fetch has DNS/IP and redirect validation, content-type/size/time limits, safe parsing, and deploy egress verification.
- [ ] Fetch validation is bound to the actual connection address; DNS rebinding and every redirect hop are covered, and unchecked automatic redirects are disabled.
- [ ] Upload paths enforce file type, size, ownership, and private storage; signed download URLs expire and are owner-scoped.
- [ ] AI provider keys, prompts, URLs, page text, and outputs are excluded or redacted in logs; credentials use documented key rotation and deletion policy.
- [ ] All `SECURITY DEFINER` functions have explicit `search_path`, function-level ACL review, input checks, narrow grants, and deployment ACL verification.
- [ ] Extension permissions, supported origins, messaging sender checks, storage, token scope/expiry/revocation, and consent toggles match documented behavior.
- [ ] Account deletion and export are approval-gated where required, idempotent, recoverable after partial failure, and complete across derived data.

## Functional verification

- [ ] Static analysis/lint, typecheck, unit tests, API tests, worker tests, extension tests, and production builds pass in documented versions.
- [ ] End-to-end capture -> durable job -> deterministic extraction -> browse/search -> delete/export works from a clean environment.
- [ ] Provider-off/degraded mode still supports core capture, view, search baseline, delete, and export.
- [ ] Browser extension connects, captures, searches, undoes, disconnects/revokes, and fails gracefully in the supported browser matrix.
- [ ] Accessibility checks cover keyboard, focus order/return, screen-reader names/status announcements, contrast, reduced motion, and zoom.
- [ ] UI is reviewed at agreed narrow, tablet, and desktop viewports; screenshots are retained as proof.
- [ ] Load/performance checks use synthetic fixtures and record data size, concurrency, region, and cold/warm conditions.

## Operations and submission

- [ ] Secrets/configuration are externalized and `.env.example` contains names and safe placeholders only.
- [ ] Production and Preview configurations are independently reviewed; provider/checkout features default off until verified.
- [ ] Database backup/restore and migration rollback/repair have been rehearsed on non-production data.
- [ ] Logs, metrics, trace/request correlation, alert conditions, operator runbooks, and service health ownership are documented.
- [ ] Deployment smoke tests and demo environment use synthetic data and a reproducible setup path.
- [ ] Rembr source history reflects actual incremental implementation work; no commit is fabricated as provenance proof.
- [ ] Final reviewer guide links product flow, architecture, privacy, known limitations, tests, demo proof, and submission artifacts.


## Related documents

- [Documentation architecture review](documentation-architecture-review.md)
- [Phase roadmap](../rebuild-plan/phase-gated-roadmap.md)
- [Feature acceptance matrix](../rebuild-plan/feature-and-acceptance-matrix.md)
- [Screen/workflow phase matrix](../rebuild-plan/screen-workflow-phase-matrix.md)
