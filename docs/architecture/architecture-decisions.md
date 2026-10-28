# Rembr architecture decisions for the rebuild

These are planning decisions for the new Rembr implementation. They do not alter the IScraper reference. Where a decision is inherited from historical Notion/Obsidian material, that provenance is identified. Revisit any decision when a tracked source or acceptance requirement contradicts it.

## ADR-R01 — Build a fresh Rembr project with independent history

**Status:** Accepted for this hackathon project.  
**Context:** The user wants an independent implementation based on the IScraper product and code logic, with a different project name and a distinct visual design. The parent IScraper repository must remain unchanged.  
**Decision:** Create a new project and Git history named Rembr. Use the IScraper repo as read-only reference and cite only public-safe source paths and behavior. Do not import the source repository history, production secrets, private customer data, or private deployment state.  
**Consequences:** Every inherited feature must have a traceable source note and a Rembr acceptance criterion. Commit cadence records actual implementation progress and is not evidence of prior creation or copying. The README describes Rembr as a fresh build and gives accurate provenance.

## ADR-R02 — Treat saved content as the shared product core

**Status:** Proposed for acceptance before implementation.  
**Context:** Product notes describe a general private saved-content memory, while code also includes creator/marketing workflows. A marketer-specific data model could fragment capture and search.  
**Decision:** Build a shared saved-item, content-artifact, collection, search, and processing-job core. Specialized workflows consume those contracts and add workflow-specific state without duplicating base content ownership or indexing.  
**Consequences:** Every capability found in the current reference inventory remains in the parity ledger. No schedule-based feature cut is implied; any exclusion or deferral requires an explicit product decision recorded in the matrix. The core remains useful when optional AI providers are unavailable.

## ADR-R03 — Keep long-running work in a durable database-backed job model

**Status:** Accepted as an inherited reliability constraint; exact Rembr schema remains to be designed.  
**Context:** Notion ADR-001 and current migration history describe durable processing jobs, lease claims, retries, and bounded backoff. Local JSON is not safe for concurrent workers.  
**Decision:** Persist processing work and lease state in the database. Require claim fencing, bounded attempts, visible terminal state, and idempotent phase writes. Keep local persistence only for isolated development/test cases.  
**Consequences:** More schema and migration work up front; significantly clearer recovery and concurrency semantics. The supabaseStore storage-import defect in the reference is documented as a known issue and should not be inherited.

## ADR-R04 — Keep deterministic baseline usable without AI

**Status:** Accepted as an inherited ML-first indexing principle.  
**Context:** Notion ADR-010 and Obsidian’s ML-first decision describe deterministic extraction as a base with optional local OCR/ASR/visual extraction and optional provider enrichment. Provider and local model availability cannot be assumed in the hackathon environment.  
**Decision:** Capture, deterministic extraction, browse, and baseline search must work when every model/local extraction service is disabled. AI may produce additive, versioned derived artifacts and a partial-ready state.  
**Consequences:** Provider adapters are isolated behind timeouts, rate budgets, provenance, redaction, and graceful degradation. Demo proof must include the deterministic path.

## ADR-R05 — Use one domain/worker contract across deployment units

**Status:** Accepted as a historical architecture constraint.  
**Context:** Notion ADR-002 recommends sharing application/runtime contracts between API and worker rather than splitting business behavior into divergent deployments. A worker process already exists as an operational boundary.  
**Decision:** Share job types, domain service rules, store interfaces, retry classification, and authorization assumptions between request and worker paths. The API and worker may deploy separately for operations, but not maintain duplicate workflow logic.  
**Consequences:** Package boundaries and explicit injected dependencies matter. Do not split or merge deployment topology without observed workload, reliability, or cost evidence.

## ADR-R06 — Enforce owner isolation in every layer that can bypass RLS

**Status:** Proposed security requirement.  
**Context:** Service-role Supabase access may bypass ordinary client RLS, background workers do not carry browser auth, and search/child-resource joins can leak even when common routes are guarded.  
**Decision:** Derive actor or job owner from trusted auth/job state; require explicit owner predicates in the store; use composite tenant foreign keys where valuable; retain RLS as defense in depth; test two-user adversarial cases for every resource type and worker operation. Treat database grants and RLS as separate controls: RLS does not remove SQL/API privileges. For `SECURITY DEFINER` functions, pin a safe `search_path`, schema-qualify referenced objects, check ownership/authority inside the function, and revoke broad `EXECUTE` grants before granting only the required role.
**Consequences:** A store contract must not expose ownership-ambiguous writes. Admin and support access must use separate policy and redacted projections. Verify actual grants and execute behavior under each deployed role, not only migration text or mocks.

## ADR-R07 — Treat user URL capture as an outbound network security boundary

**Status:** Proposed security requirement.  
**Context:** Capture and import accept user-controlled URLs. Redirects, DNS resolution, private IP ranges, oversized responses, and hostile content can turn the fetcher into an SSRF or resource-exhaustion path.  
**Decision:** Centralize URL normalization and fetch safety. Validate every destination and redirect hop at request time; resolve and reject non-public IP addresses; bind the validated address to the connection to prevent DNS rebinding/time-of-check-to-time-of-use gaps; disable automatic redirects unless each hop is validated; enforce network egress controls; cap response bytes and elapsed time; constrain content types; and isolate HTML parsing from active content.  
**Consequences:** Some sites may fail to import; expose clear retry/unsupported behavior. Test parser logic, DNS/redirect behavior, and deployed egress configuration. A source audit alone cannot establish provider-host protections.

## ADR-R08 — Make extension consent, credential lifecycle, and origin policy explicit

**Status:** Proposed after source-confirmed EXT-01–06 findings.  
**Context:** The reference extension has a mismatch between passive status checks and the visible preference, local disconnect without server revocation, and a configurable origin inconsistent with its manifest allowlist. The exact off-origin network behavior needs browser verification.  
**Decision:** User save is deliberate; passive page-status checks require an explicit preference; extension credentials are scoped, short-lived, revocable, and removed server-side on disconnect where possible; one supported origin policy is enforced consistently across UI, manifest, worker, and API.  
**Consequences:** Design and tests must cover consent states, expiry/revocation, unsupported origins, browser permission boundaries, and error recovery. No off-origin credential exfiltration claim is made about the source implementation without runtime proof.

## ADR-R09 — Treat source and derived content as separate privacy artifacts

**Status:** Proposed data-lifecycle requirement.  
**Context:** Indexing may create extracted text, thumbnails, OCR/transcripts, summaries, embeddings, feedback, logs, exports, and provider copies. A single row delete may not remove every dependent representation.  
**Decision:** Record artifact type, source item, version/provenance, storage location, retention/deletion state, and provider boundary. Deletion and export use one lifecycle map that includes outstanding jobs and vectors.  
**Consequences:** New data types require deletion/export review before merge; retries must not recreate deleted content; external provider retention must be disclosed as an unverified/configured boundary until proven.

## ADR-R10 — Complete functional traceability before visual restyling

**Status:** Accepted for the build sequence.  
**Context:** User requested full functionality documentation and a later visual change so Rembr reads as an original project. Visual design work can obscure missing feature parity if it starts before the workflows are mapped.  
**Decision:** Freeze a Rembr screen/flow/data/security acceptance matrix first. Build interaction behavior with accessible, consistent primitives; apply and refine the Rembr visual identity after core route and state coverage exists.  
**Consequences:** Visual distinction is a separate workstream with its own review. Do not copy IScraper assets or public branding into Rembr without an explicit rights and brand decision.

## ADR-R11 — Use a durable local SQLite adapter for Phase 1 (superseded)

**Status:** Accepted for Phase 1; revisit before hosted deployment.  
**Context:** The Rembr workspace has no app scaffold or configured database credential, and the local Docker database engine is unavailable. Phase 1 still needs durable, reproducible persistence so the authenticated capture-to-library journey can run without a hosted provider.  
**Decision:** Use SQLite with a stable native driver for local development and a versioned SQL migration path. Put queries behind a narrow persistence interface. Use owner predicates and foreign keys for every user-owned row; do not rely on database-level RLS in this adapter. Keep data at a documented local path and out of Git.  
**Consequences:** SQLite is suitable for the local single-node Phase 1 flow but does not prove PostgreSQL/RLS behavior or hosted multi-instance concurrency. Before deployment, select and implement the PostgreSQL/Supabase adapter, add real role/ACL/RLS tests, and rehearse migration/backup behavior. The user-facing domain/API contract must not depend on SQLite-specific behavior.

## Unresolved decisions before implementation

- Default to a modular monolith for domain/API code, with a distinct worker process only for durable long-running jobs. Revisit split services only when measured deployment, isolation, or scaling needs justify them.
- Before Phase 9, select the hosted PostgreSQL/Supabase target and complete a parity/security review of its store adapter, grants, RLS and migration behavior.

## ADR-R12 — Use Supabase Postgres as Rembr's only database

**Status:** Accepted, 2026-10-29. Supersedes ADR-R11.

**Decision:** Store all Rembr API and worker data in the connected Supabase Postgres project. Apply versioned SQL from `supabase/migrations/`; use async `pg` pooling in the server processes. Keep private application file bytes in the existing private filesystem storage paths. Use PGlite with the same Postgres schema for isolated local database tests. Do not keep a SQLite fallback or SQLite data files.

**Consequences:** Both API and worker require `DATABASE_URL` in their server environment. The secret must remain server-side. Supabase tables have RLS enabled with no direct client policies because the app accesses them only through its authenticated API using the server database connection. Keep user ownership checks in the API query layer. Review advisors and grants whenever schema exposure changes.
- Which source behaviors require a redesigned interaction contract because of product, privacy, or security findings? (This changes design while preserving the feature unless the user explicitly approves a scope change.)
- Whether user-supplied provider credentials are a required Rembr capability. Current backend audit found helper/table presence but no production end-to-end orchestration path.
- Exact storage provider, auth provider, deployment targets, model provider, and browser support matrix for Rembr.
- Whether user data deduplication is private per-account or global; default to per-account until privacy review supports another approach.
- How many engineers and demo devices are available, and can the full source-backed inventory be completed before the official submission deadline? Re-estimate immediately; schedule pressure does not authorize unrecorded scope cuts.


## Related documents

- [System boundaries](system-design-and-boundaries.md)
- [Phase roadmap](../rebuild-plan/phase-gated-roadmap.md)
- [Final review checklist](../quality/final-review-checklist.md)
