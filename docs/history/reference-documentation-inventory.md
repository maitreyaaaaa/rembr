# Tracked IScraper repository documentation inventory

## Scope and evidence rule

This inventory covers the 33 Markdown files returned by `git ls-files 'docs/**'` in the reference checkout. Current source and tests outrank the intent in these documents. ADRs and architecture notes explain prior decisions; phase reports describe snapshots at their recorded dates; draft plans and specs are not proof of implementation. Large historical Android and generated implementation-plan documents are classified for scope and purpose; their checklists are not automatically accepted as Rembr requirements. A separate low-level architecture note was present as an untracked parent-worktree file; it is not counted among these 33 tracked documents and remains reference-only.

## Product and application direction

| Tracked document | Classification and main use for Rembr |
|---|---|
| `docs/product-direction-ml-first-pivot.md` | Product direction draft: private searchable memory, deterministic/ML-first processing, hybrid retrieval, reduced dependency on routine LLM enrichment. Compare every capability to present source and distinguish optional model interfaces from provisioned runtimes. |
| `docs/architecture/adr-010-ml-first-indexing-and-enrichment.md` | Accepted but partially implemented decision dated 2026-10-03. Defines deterministic baseline, content hashes, optional local extraction, visual embeddings/ranking, and optional AI synthesis. Source audit confirms the gap between interface/code and deployed runtimes. |
| `docs/android-app-z-ai-build-brief.md` | Long Android-only implementation brief for a potential independent native mobile client. The reviewed source checkout has no corresponding app implementation; do not treat this historical brief as current behavior or a Rembr app requirement, and do not copy its external-agent instruction text. |
| `docs/demo-script.md` | Two-minute campaign-memory/workflow narrative and product claims. Useful for understanding intended pitch; verify each behavior against the current API/UI and rewrite as Rembr rather than copying promotional statements. |

## Architecture decisions (accepted history, not deployment proof)

| Tracked document | Decision recorded | Rebuild treatment |
|---|---|---|
| `docs/architecture/adr-001-indexing-reliability.md` | Durable DB-backed processing jobs, lease ownership, retries/backoff, and recovery instead of a fragile local queue. | Preserve durable jobs, fencing and bounded recovery; compare current migrations and worker code. |
| `docs/architecture/adr-002-worker-runtime-boundary.md` | Keep API/workflow behavior on one runtime contract; separate worker deployment only after code boundary is established. | Share domain/store/job contracts between API and worker; topology remains evidence-led. |
| `docs/architecture/adr-003-worker-operations-readiness.md` | Prepare preflight, CLI, smoke tests and operations without premature deployment splitting. | Preserve explicit worker startup/preflight; verify actual hosting separately. |
| `docs/architecture/adr-004-render-worker-pilot.md` | Pilot a single background worker on Render while keeping API/UI on Vercel. | Render YAML is intended config, not proof the pilot is still deployed or healthy. |
| `docs/architecture/adr-005-vercel-compatible-scale-readiness.md` | Keep Vercel as current web/API platform while removing hidden platform lock-in and adding security/scale gates. | Avoid copying platform assumptions; design adapters and maintain host-specific routing boundaries. |
| `docs/architecture/adr-006-vercel-runtime-latency-tuning.md` | Tune Vercel runtime based on recorded warm/cold measurements before migration. | Historical latency is not a current benchmark; preserve reproducible cold/warm evidence methods. |
| `docs/architecture/adr-007-authenticated-and-region-evidence-before-migration.md` | Require valid authenticated-route and region evidence before hosting/region change. | Keep migrations tied to repeatable signed-in traffic and actual workload evidence. |
| `docs/architecture/adr-008-authenticated-data-path-latency-tuning.md` | Optimize authenticated Supabase data paths before infrastructure relocation. | Re-measure current API/data flow and use explain plans before infra conclusions. |
| `docs/architecture/adr-009-supabase-evidence-before-infrastructure-change.md` | Collect database query/index/security evidence before changing provider/region. | Keep effective ACL, RLS and query-plan checks separate from migration source claims. |
| `docs/architecture/adr-automation-runtime-v1.md` | Add chat-led Gmail-read automation as a separate domain, with schedules/run history and a worker; defer writes, plan gating, agency structures and user model keys. | Keep automation separate from content-publishing workflows; honor explicit approval before external writes. Verify read-only scopes and connected-provider behavior. |

## Operations, evidence, and cutover documents

| Tracked document | Type and intended use | Limits to preserve |
|---|---|---|
| `docs/worker-operations.md` | Commands, worker modes, preflight, runtime operations and troubleshooting. | Operational commands must be reconciled with package scripts and current config; source text does not prove a live worker. |
| `docs/scalability-readiness.md` | Readiness criteria for current Vercel app/API, worker, database and multi-instance scaling. | Proposed thresholds are not evidence of current load capacity. |
| `docs/migration-ready-cutover.md` | Future API cutover sequence; explicitly says do not migrate without readiness evidence. | Not a current hosting plan; no move was made by this audit. |
| `docs/security-scale-gates.md` | Required security and privacy gates before traffic expansion. | Compare against current migrations, route auth, extension token lifecycle and live ACLs. |
| `docs/rate-limiting-rollout.md` | Deployment order, local and shared budgets, edge/Auth limits, staging validation. | Contains dated, environment-specific claims and old rotation instructions. Never copy secret values or assume a key remains exposed; verify current state. A deployment rollout requires explicit approval and current evidence. |
| `docs/route-inventory.md` | Documents the generated route table and review dimensions (access, auth, rate limits, body limits). | The script is regex/heuristic-based, so table output is a navigation aid, not proof of runtime policy. |
| `docs/automations-v1-setup.md` | Local mock setup and Gmail OAuth/provider/migration configuration for automation V1. | Contains staging/production status claims and deployment steps that are date-sensitive; verify before any execution. Keep user action approval and least-privilege Gmail scope. |
| `docs/phase-6e-baseline-report.md` | Historical test/build/lint/security/route-inventory checks after scale readiness. | Reported checks are tied to a 2026-05-26 checkout. They were not re-run for this documentation task. |
| `docs/phase-6f-latency-report.md` | Historical request timing and load-test evidence. | Must be paired with exact source revision, credentials, traffic profile, warm/cold state and endpoint before citing. |
| `docs/phase-6g-vercel-runtime-tuning.md` | Historical cold/warm Vercel timing and tuning conclusions. | Historical measurement only; does not prove current host behavior. |
| `docs/phase-6h-authenticated-region-evidence.md` | Signed-in route and edge/function region measurement plan/results. | Authenticated and routing measurements are time-sensitive; do not infer current residency or performance. |
| `docs/phase-6i-authenticated-latency-tuning.md` | Historical authenticated data-path tuning report. | Recorded latency and index behavior require current query-plan/deployed verification. |
| `docs/phase-6j-supabase-security-query-readiness.md` | Describes local static SQL checks and read-only management API evidence; says it does not apply live changes. | Static parser limits are documented in support-code coverage; no static pass proves hosted ACL/RLS. |
| `docs/phase-6k-reproducible-authenticated-latency-evidence.md` | Adds test-user password sign-in, API preflight and k6 authenticated tests to avoid invalid tokens. | Use dedicated synthetic test credentials only; this audit did not sign in or run k6. |

## UI/product specifications and generated plans

| Tracked document | Type and relationship to current UI | Rebuild handling |
|---|---|---|
| `docs/superpowers/specs/2026-05-05-insta-index-design.md` | Early Instagram indexing harness spec using parser/downloader/model analysis. | Historical architecture; compare with later durable processing and source. |
| `docs/superpowers/specs/2026-05-07-landing-interaction-design.md` | Draft landing visual direction with GSAP/ScrollTrigger/Lottie/interactive showcase. | Intent only; current rendering and accessibility source win. Do not copy visuals/assets as Rembr identity. |
| `docs/superpowers/plans/2026-05-07-landing-interaction-system.md` | Detailed task plan for splitting landing interactions into components. | Historical plan; current code already contains multiple sections/components. Use it only to explain provenance and historical tradeoffs. |
| `docs/superpowers/plans/2026-05-26-library-chat-panel.md` | Plan for grounded read-only library chat. | Current source may differ; use the UI/API audit for exact behavior. |
| `docs/upload-indexing-redesign.md` | Upload/indexing UX redesign notes about review, processing and related states. | Match it to current Upload/Quick Add APIs and backend job state; do not assume mock design is implemented. |

## Coverage, contradictions and remaining uncertainty

- The 33-file count is the Git-tracked `docs/` inventory. Root `.gitignore` excludes some local document paths; untracked/ignored documents are outside this repository-document ledger and are not included in the Rembr copy.
- The repository has both an older general private-memory narrative and a marketer/content-workflow pitch. Rembr must explain the shared memory core and the specialized marketer workflow separately.
- Documentation has changed release and hosting status over time (extension “coming soon”, Render worker pilot, Vercel settings, staging migration statements). Current source defines contracts; live service/store/deployment state requires authenticated evidence.
- Several documents include operational commands for migrations, credentials, OAuth, or production release. They are not authorization to execute those commands. No external action was taken in this audit.
- Landing, chat, Android, import and ML documents include plans that may be partially implemented, superseded or out of scope. Current UI/API/worker source maps determine parity.
- No product marketing, personal contacts, investor material, private messages or customer records were copied into Rembr documentation.


## Related documents

- [Cross-source context](cross-source-context.md)
- [Research method](research-method-and-tooling.md)
- [Support-code coverage](../source-audit/support-code-coverage.md)
- [Phase roadmap](../rebuild-plan/phase-gated-roadmap.md)
