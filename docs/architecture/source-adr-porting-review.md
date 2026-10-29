# IScraper architecture decisions — Rembr porting review

**Evidence date:** 2026-10-30. **Reference:** `D:\IScraper-main\IScraper-main`, inspected read-only. The low-level architecture document is a source snapshot dated 2026-10-03; it is a map of code boundaries, not proof of current hosted behavior.

| Source decision | Status in source | Rembr treatment |
|---|---|---|
| ADR-001 — Durable indexing reliability | Accepted | Preserve database-backed jobs, lease fencing, bounded attempts/backoff, and retry-safe writes. Rembr has these contracts; test them against its own stores and workers. |
| ADR-002 — Worker runtime boundary | Accepted | Preserve shared domain/job contracts across API and worker. Rembr's separate worker process is operational; do not duplicate business logic. |
| ADR-003 — Worker operations readiness | Accepted; later deployment decision supersedes parts | Keep preflight, smoke, and operations evidence practices. Do not inherit source deployment constraints as Rembr architecture. |
| ADR-004 — Render worker pilot | Accepted for IScraper | Not a direct deployment copy. IScraper used Vercel for API/web and Render for its worker; Rembr's approved hosting runs both API/web and worker on Render with Supabase. |
| ADR-005 — Vercel-compatible scale readiness | Accepted for IScraper | Keep general portability and distributed-rate-limit cautions. Do not copy Vercel routing/runtime assumptions; verify Rembr's actual Render and Supabase behavior. |
| ADR-006 — Vercel runtime latency tuning | Accepted for IScraper | Platform-specific Fluid Compute, region, and warmup choices do not transfer. Separate platform/network timing from handler timing if Rembr later profiles latency. |
| ADR-007 — Authenticated and region evidence before migration | Accepted for IScraper | Retain the evidence-first principle for any future hosting or region change; the source's Vercel region evidence does not justify changing Rembr's Render setup. |
| ADR-008 — Authenticated data-path latency tuning | Accepted for IScraper | Do not copy caching changes without current Rembr measurements. Preserve per-request authorization and deletion safety checks. |
| ADR-009 — Supabase evidence before infrastructure change | Accepted | Aligns with Rembr's Supabase use: inspect RLS, grants, query plans, and indexes; keep production DB changes separately reviewed. Rembr's API-only access model still requires explicit server-side owner checks. |
| ADR-010 — ML-first indexing and enrichment | Accepted, but some proposed local extractors are not proven as packaged/deployed in the source snapshot | Preserve deterministic/provider-off usefulness and bounded optional AI. Treat local OCR/ASR/vision runtime parity as unimplemented until Rembr code and runtime evidence prove it. |
| Automation runtime V1 — Chat-led Gmail | Accepted for first slice | Source design is read-only Gmail with bounded manual/interval runs, a Composio boundary, server-side tools, and redacted history. Treat it as a later connected workflow only if present in the Rembr accepted inventory; never add Gmail write actions without an explicit approval gate. |

## Porting rules

- Use source files and ADRs to recover capability and contracts, then port only modules that fit Rembr's TypeScript modular monolith, Supabase-only database, and existing API/worker boundaries.
- Preserve Rembr's own ADR-R06 owner-isolation, ADR-R09 artifact lifecycle, ADR-R12 Postgres-only decisions, and user-approved Render hosting.
- Do not copy implementation defects or infer production behavior from source tests, documentation, or a dated architecture snapshot.
- Phase 5 remains deferred by user direction; its extension and connected-workflow scope stays in the inventory for later.
- Keep any port traceable from source capability to Rembr files and acceptance evidence. The IScraper checkout remains read-only.

## Source references

- `docs/architecture/adr-001-indexing-reliability.md` through `docs/architecture/adr-010-ml-first-indexing-and-enrichment.md`
- `docs/architecture/adr-automation-runtime-v1.md`
- `docs/architecture/iscraper-low-level-architecture.md`
