# Phase 4 — Search, knowledge, and optional AI

- Status: **In progress; exit gate not passed.**
- Scope and feature-matrix rows: Search and semantic retrieval; grounded answers and summaries; OCR/ASR/visual enrichment; Smart Collections; Library Checkup; Knowledge Graph and Obsidian export. See [`feature-and-acceptance-matrix.md`](feature-and-acceptance-matrix.md) and [`screen-workflow-phase-matrix.md`](screen-workflow-phase-matrix.md).
- Source/design references: [`phase-4-architecture-design.md`](../architecture/phase-4-architecture-design.md); read-only IScraper implementation references recorded there. The reference checkout was not modified.
- Decisions and assumptions: Phase 3 live Meta API-key checks remain deferred by the user. The user chose to keep the semantic embedding provider open. No provider is selected; the fake-backed contract is not production semantic search. The user previously authorized history-only reconciliation of the hosted migration ledger. The user confirms `DATABASE_URL` is configured on Render, but no supported shell/CLI route was available in this pass.
- Implementation commits: current branch `feat/phase-4-search-knowledge-ai`; latest commits `be09e85` (search evaluation and library diagnostics) and `86f7868` (provider-neutral embedding contract and expanded synthetic evaluation), both pushed.

## Acceptance evidence

| Requirement | Status | Evidence and remaining gap |
|---|---|---|
| Deterministic owner-scoped lexical search, filters, ranking and feedback | **Passed locally** | API coverage in `apps/api/test/phase-two.test.ts`; whole-token, multilingual and term tests in `apps/api/test/search-terms.test.ts` and `apps/api/test/smart-collection-matching.test.ts`. No production-scale latency claim. |
| Search quality/evaluation reporting | **Passed for harness plumbing only** | `apps/api/test/retrieval-evaluation-synthetic-api.test.ts` runs four explicitly synthetic queries over nine synthetic notes through the authenticated API and CLI. MRR@10, nDCG@10 and recall@10 are 1.0 on this deliberately separable fixture. Representative human-reviewed judgments remain **not run**; the fixture is not quality proof. |
| Semantic retrieval | **Incomplete** | `apps/api/src/library/semantic-embeddings.ts` and `apps/api/test/semantic-embeddings.test.ts` cover bounded orchestration with fake provider/repository adapters. No selected provider, database adapter, migration, API route or UI exists. The user chose to leave provider selection open. See [`embedding-provider-contract.md`](../architecture/phase-4-embedding-provider-contract.md). |
| Provider-off deterministic search and grounded answer fallback | **Passed locally** | Mocked/provider-disabled cases in `apps/api/test/phase-two.test.ts`, `apps/api/test/meta-client.test.ts`, and `apps/api/test/phase-three-ai-budget.test.ts`; no live provider authorization proof. Phase 3 Meta key checks remain deferred. |
| Grounded answers, citations and saved summaries | **Passed locally with mocked provider** | Owner scope, consent, citation mapping, bounds, accounting and stale-source cases in `apps/api/test/phase-two.test.ts`. Hosted migrations and live provider success remain **not run**. |
| Smart Collections and Library Checkup | **Passed locally for available source item types** | Owner-scoped collection corrections, analysis-derived rules, reminders, and duplicate-import diagnostics are covered in `apps/api/test/phase-two.test.ts`. Hosted migration/runtime evidence remains **not run**. Screenshot groups depend on Phase 5 extension capture; the IScraper source has no standalone voice-note creation workflow to port. |
| Knowledge Graph and Obsidian export | **Passed locally** | Graph/export ownership, completeness and archive coverage in `apps/api/test/obsidian-export.test.ts` and related Phase 2/API tests. Browser and production-size runtime evidence remain **not run**. |
| OCR/ASR/visual enrichment boundaries | **Passed with mocks; live proof not run** | Bounded Muse Spark/Voice payload, MIME/duration rejection, usage reporting and provider-failure cases in `apps/api/test/meta-client.test.ts`, `apps/api/test/phase-three-media-parity.test.ts`, and `apps/api/test/phase-three-ai-budget.test.ts`. Live provider checks are deferred with Phase 3. |
| Responsive and keyboard/browser review | **Partially passed** | [`phase-4-local-browser-review-2026-10-29.md`](../quality/phase-4-local-browser-review-2026-10-29.md) records seven signed-in routes at 390px/1440px and axe A/AA scans with zero reported violations after the graph-scroller fix; later keyboard/AX review includes notes, Imports, Tags empty state and Profile. Tag edit/import detail with records, a screen-reader session, and runtime reduced-motion emulation remain **not run**. |
| Hosted migration and runtime state | **Not run / incomplete** | [`phase-4-hosted-migration-review-2026-10-29.md`](../quality/phase-4-hosted-migration-review-2026-10-29.md) records matching SQL body hashes for 11 hosted entries, nine hosted/local version-ID differences, and two unapplied local migrations. No history repair or schema migration was applied; supported authenticated Render Shell/CLI access is still required. |

## Checks

- `npm.cmd run check` passed on `86f7868`: API/web typecheck, API/web lint, 113 API tests, and API/web production builds. Vite reports the existing large-bundle warning.
- The current working tree also passed `npx.cmd --yes --package=node@22.22.0 --call "npm.cmd run check"`: API/web typecheck, API/web lint, all 113 API tests (including the provider-off fallback assertions), and API/web production builds. Vite still reports the existing large-bundle warning.
- Focused semantic-contract and synthetic-qrels tests passed 8/8. The consolidated provider-off summary/answer fallback test passed in isolation. `git diff --check` passed on the final working tree.
- No production provider call, hosted migration write, or performance benchmark was performed.

## Defects, risks, and next steps

- Semantic retrieval is an agreed Phase 4 capability and remains unimplemented in production. Resume after selecting a provider/storage approach or explicitly revising its scope; then implement consent, usage controls, indexing lifecycle, owner-scoped persistence/query, API/UI states, and provider failure behavior.
- Perform the already-authorized history-only migration repair through an authenticated supported Supabase CLI or Render Shell path. Do not apply the two pending schema migrations without explicit approval because they invalidate older consent and cancel eligible queued analysis jobs.
- Obtain representative human-reviewed owner-local qrels before making retrieval-quality claims. Keep them out of the repository.
- Complete the remaining accessibility states and screen-reader/reduced-motion evidence when an authenticated review environment and assistive tooling are available.
- The Phase 4 exit gate from [`phase-gated-roadmap.md`](phase-gated-roadmap.md#phase-4--search-knowledge-and-optional-ai) remains **open**: all agreed search/knowledge features are not yet proven complete.
