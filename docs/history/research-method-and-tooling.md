# Research method, skills, and analysis tools

## Review method

The audit separates current checked-out behavior, historical product intent, external deployment claims, verified findings, and Rembr proposals. Current source and tests take precedence over historical notes. Every source observation is anchored to a path and line/function range where practical. No IScraper code, tests, migrations, deployment, database, browser session, or provider action was changed or executed as part of this documentation pass.

## Skills reviewed

The repository-research pass consulted the local skills that best matched the work:

- `audit-context-building` and `code-documentation-code-explain` for source/context reconstruction and feature-to-code tracing.
- `architecture`, `c4-architecture`, `architecture-decision-records`, `database-design`, and `monorepo-architect` for system boundaries, data/worker contracts, and decision records.
- `docs-architect`, `documentation`, `api-documenter`, and `documentation-templates` for structured, linkable docs and API/coverage organization.
- `threat-modeling-expert`, `security-audit`, and `ux-audit` for trust boundaries, security findings, and screen/accessibility observations.
- `brainstorming` for separating inherited behavior from candidate product improvements.

The `reverse-engineer` skill discovered in the local catalog focused on binary/firmware analysis and was not appropriate for this JavaScript/TypeScript source repository. The `production-code-audit` skill includes automatic code fixes and was not used because the user explicitly asked for documentation only. Existing local skills were adequate; no new skills were downloaded or installed.

## Agents and independent review slices

The user explicitly asked to initialize subagents. Four independent review workstreams were used, followed by a focused backend-service trace:

1. UI/screens: all 116 tracked `apps/ui` paths classified; all 38 tracked JS/JSX files under `src` mapped with numbered-range logic traces; 37 behavior-bearing modules and the app entrypoint detailed. Styling/assets were classified by role. No tracked UI tests were found.
2. Orchestration/backend: route handlers, store/worker/service contracts, test assertion maps, and SQL migration review. Coverage is recorded in `backend-source-coverage.md`; any rows still labeled pending must be finished before claiming source-complete.
3. Browser extension/security: all 25 tracked paths individually reviewed; five runtime JS files and supporting API/auth/token paths receive function-level traces; markup/styles and assets are classified by review type.
4. Support code/reference documents: seven scripts, three load-test scenarios, API entrypoint and deployment manifests, and all 33 tracked repository docs were inventoried.
5. Remaining backend services: a dedicated full-file pass traced 21 remaining service, repository, and extractor-entrypoint paths and closed the source-file ledger.

The final backend inventory is 85/85 orchestration source files traced, all 37 test files read and mapped at assertion level, and all 38 migration bodies summarized. No tests were executed. The global 370-file ledger records status and appropriate review depth for each tracked path.

The primary agent reviewed the delegated docs, checked high-impact line references, reconciled the extension publish approval path against its backend gate, and independently confirmed the Supabase storage-import claim defect.

## REA static analysis

REA `rea-agents@6.8.0` completed successfully on an explicit selection of 181 tracked JS/TS files. Evidence ID, digest, coverage statement, runtime mismatch, and tool limitations are captured in [REA static analysis record](../source-audit/rea-static-analysis.md). The summary reported incomplete graph coverage and 5,683 inventoried files outside the selected view; large store/test relationship projections exceeded the parent result budget. This structural result is a cross-check, not proof every file was semantically analyzed.

## Plugin availability and scan status

- No CodeRabbit plugin/connector was available in the configured plugin/tool inventory. The local GitHub connector is available for repository metadata/reviews but does not substitute for the requested local source inspection.
- Codex Security was available and a Standard scan was started for the reference worktree. At the latest status check it remained at `preflight` with zero execution threads, zero worklist rows, and no preflight issue/error. It produced no completed findings/report, so this is recorded as **inconclusive and not a successful scan**. Do not treat the manual review's issues as plugin-generated findings.
- Previous Codex Security sessions recorded in history include failed launches due to `spawn EPERM`; they were not used as current scan evidence.

## Work not performed

- No test, lint, typecheck, build, extension validator, database script, k6 probe, deployment, browser install, or provider integration was run. This is a read-only source/documentation pass; presence of tests is not a claim they pass.
- No hosted Supabase ACL/RLS state, Vercel/Render configuration, Chrome/Edge store status, model/provider credentials, or live telemetry was checked.
- Asset pixel/license/provenance and dependency-by-dependency lockfile review remain separate gaps unless expressly covered by the per-area ledger.


## Related documents

- [Cross-source context](cross-source-context.md)
- [Reference documentation inventory](reference-documentation-inventory.md)
- [Support-code coverage](../source-audit/support-code-coverage.md)
- [Phase roadmap](../rebuild-plan/phase-gated-roadmap.md)
