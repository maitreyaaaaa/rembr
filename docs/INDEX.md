# Rembr Documentation Index

## Purpose and scope

This documentation reconstructs IScraper's current product and implementation so Rembr can be rebuilt from a new, isolated project. It documents current behavior, source references, historical decisions, unresolved facts, defects, and proposed improvements. It is not permission to copy private data or credentials, and it does not modify the reference repository.

## Evidence rules

1. Current source and tests establish repository behavior.
2. Git history, Notion, Obsidian, and prior chats explain intent and historical choices; they do not prove deployed behavior.
3. Hosted provider/deployment claims require current evidence and are labeled unverified when unavailable.
4. Every observation includes a source path and line range where practical.
5. Every proposed improvement is labeled as a proposal and separated from confirmed behavior.

## Documents

- Complete tracked-file coverage ledger: [source-audit/source-coverage-ledger.csv](source-audit/source-coverage-ledger.csv)
- Product, decisions, and source history: [history/cross-source-context.md](history/cross-source-context.md)
- Skills, agents, REA, and plugin review: [history/research-method-and-tooling.md](history/research-method-and-tooling.md)
- Tracked repository documentation inventory: [history/reference-documentation-inventory.md](history/reference-documentation-inventory.md)
- Current system context: [architecture/current-system-context.md](architecture/current-system-context.md)
- System design and trust boundaries: [architecture/system-design-and-boundaries.md](architecture/system-design-and-boundaries.md)
- Rebuild architecture decisions: [architecture/architecture-decisions.md](architecture/architecture-decisions.md)
- Screen specifications: [screens/ui-surface-and-screen-specifications.md](screens/ui-surface-and-screen-specifications.md)
- Rembr design-system brief: [screens/rembr-design-system-brief.md](screens/rembr-design-system-brief.md)
- API routes and contracts: [backend/api-routes-and-contracts.md](backend/api-routes-and-contracts.md)
- Backend architecture: [backend/backend-architecture.md](backend/backend-architecture.md)
- Data, persistence, and worker: [backend/backend-data-and-worker.md](backend/backend-data-and-worker.md)
- Indexing worker state contract: [backend/indexing-worker-contract.md](backend/indexing-worker-contract.md)
- Supabase store contract: [backend/supabase-store-contract.md](backend/supabase-store-contract.md)
- Critical migration and RPC contracts: [backend/critical-migration-contracts.md](backend/critical-migration-contracts.md)
- Complete SQL migration ledger: [backend/sql-migration-ledger-detailed.md](backend/sql-migration-ledger-detailed.md)
- Deletion, billing, and exports: [backend/deletion-billing-exports.md](backend/deletion-billing-exports.md)
- Handler-by-handler route audit: [backend/route-handler-audit.md](backend/route-handler-audit.md)
- Service, security, and queue contracts: [backend/service-contracts-security-queue.md](backend/service-contracts-security-queue.md)
- Provider and credential integration: [backend/providers-and-credentials.md](backend/providers-and-credentials.md)
- Automation service deep trace: [backend/automations-service-deep-trace.md](backend/automations-service-deep-trace.md)
- AI search service deep trace: [backend/ai-search-service-deep-trace.md](backend/ai-search-service-deep-trace.md)
- Local store, downloader, and one-shot worker: [backend/local-store-downloader-run-once.md](backend/local-store-downloader-run-once.md)
- Remaining backend services and repositories: [backend/remaining-service-contracts.md](backend/remaining-service-contracts.md)
- Local extractor service boundary: [backend/local-extractor-service-deep-trace.md](backend/local-extractor-service-deep-trace.md)
- Orchestration repositories and entrypoints: [backend/repositories-and-entrypoints.md](backend/repositories-and-entrypoints.md)
- Store/billing test audit: [backend/test-audit-supplement-stores-billing.md](backend/test-audit-supplement-stores-billing.md)
- Focused test assertion ledger: [backend/focused-test-assertion-ledger.md](backend/focused-test-assertion-ledger.md)
- Additional test audit: [backend/test-audit-supplement-small.md](backend/test-audit-supplement-small.md)
- Storage import flow: [backend/storage-import-flow.md](backend/storage-import-flow.md)
- Backend rebuild sequence: [backend/backend-rebuild-sequence.md](backend/backend-rebuild-sequence.md)
- Extension architecture and rebuild: [extension-security/extension-architecture-and-rebuild.md](extension-security/extension-architecture-and-rebuild.md)
- Security review: [extension-security/security-review-and-findings.md](extension-security/security-review-and-findings.md)
- Findings and improvements: [registers/issues-and-improvements.md](registers/issues-and-improvements.md)
- Final review gates: [quality/final-review-checklist.md](quality/final-review-checklist.md)
- Feature acceptance matrix: [rebuild-plan/feature-and-acceptance-matrix.md](rebuild-plan/feature-and-acceptance-matrix.md)
- Phase-gated rebuild roadmap: [rebuild-plan/phase-gated-roadmap.md](rebuild-plan/phase-gated-roadmap.md)
- Phase 1 implementation record: [rebuild-plan/phase-1-record.md](rebuild-plan/phase-1-record.md)
- Screen/workflow phase matrix: [rebuild-plan/screen-workflow-phase-matrix.md](rebuild-plan/screen-workflow-phase-matrix.md)
- Ten-day rebuild plan: [rebuild-plan/ten-day-rebuild-plan.md](rebuild-plan/ten-day-rebuild-plan.md)
- REA tracked JavaScript source selection: [source-audit/rea-source-selection.json](source-audit/rea-source-selection.json)
- REA static analysis record and limits: [source-audit/rea-static-analysis.md](source-audit/rea-static-analysis.md)
- Remaining support code and delivery coverage: [source-audit/support-code-coverage.md](source-audit/support-code-coverage.md)
- UI source coverage: [source-audit/ui-source-coverage.md](source-audit/ui-source-coverage.md)
- Backend source coverage: [source-audit/backend-source-coverage.md](source-audit/backend-source-coverage.md)
- Extension source coverage: [source-audit/extension-source-coverage.md](source-audit/extension-source-coverage.md)
- Documentation and architecture review: [quality/documentation-architecture-review.md](quality/documentation-architecture-review.md)

The final review checklist is a build gate; it is not evidence that implementation, deployment, or runtime verification has passed.

## Completion gates

- All 370 tracked reference files are classified; every in-scope logic-bearing source and test has a completed, evidence-linked review entry.
- Every screen and major workflow links to its frontend, API, backend, data, security, and test evidence.
- Architecture diagrams match actual source boundaries.
- Findings separate confirmed behavior, historical intent, external unknowns, and proposals.
- Cross-source links, high-impact line references, delegated findings, and current-vs-historical claims have been checked by the main agent.
