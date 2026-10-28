# Documentation and architecture review

**Review date:** October 28, 2026  
**Scope:** Documentation-only review of the 45 Markdown planning/audit documents present before this pass, their source-coverage ledgers, the IScraper checkout evidence referenced from those documents, and current official hackathon instructions. This pass added three supporting documents, bringing the set to 48 Markdown files. No product code was changed. The reference IScraper checkout remains untouched.

## Result

The documentation is useful as a source audit, but its implementation roadmap was not ready to serve as a reliable build contract without corrections. The review linked the document set, made screen-to-phase ownership explicit, corrected scope and timing assumptions, and tightened several security/accessibility requirements. This is not proof that the source repository, hosted service, or any planned Rembr behavior is correct; those require the phase-specific implementation evidence.

## Material issues corrected

| Finding | Correction |
|---|---|
| Unsupported mobile-app exclusion | The reviewed checkout shows `apps/orchestration` and `apps/ui`, with no separate Expo/mobile app. Removed the claim that an existing separate mobile app was excluded; made the inventory caveat explicit in the UI and system docs. |
| Old ten-day forecast read as current | The official event page says October 26–November 4, 2026, with submission by November 4 at 9 PM ET. On October 28, the remaining time is about seven calendar days. The ten-day schedule is now labeled an original baseline, and the roadmap requires a capacity re-estimate without compressing gates or silently cutting scope. |
| Hackathon judging/required-model assumptions | The accessible official event page describes tracks/themes and Meta model resources, but does not establish the exact scoring weights or that a specific model is mandatory. The roadmap now requires verification against published official rules and avoids inventing requirements. |
| Scope cuts allowed implicitly by schedule | Removed schedule-based permission to prioritize away parity. Every source-backed capability stays in the feature ledger unless the user explicitly changes scope; product/privacy/security redesigns are documented separately from omissions. |
| Coarse phase assignments hid screen/API ownership | Added the screen/workflow phase matrix covering 18 web surfaces, extension surfaces, API/worker domains, state rules and evidence expectations. Clarified the Phase 1 minimum auth/item/delete slice versus Phase 2 account/session and CRUD lifecycle; Phase 1 item deletion versus Phase 6 account deletion; and Phase 5 integrations versus Phase 6 billing. |
| Phase 6 mixed account work with operations | Renamed Phase 6 to account/privacy/admin/billing. Cross-system observability, runbooks and deployment verification remain in Phases 8–9. |
| URL/SSRF checks underspecified | Added per-redirect revalidation, reject non-public resolved addresses, validated-IP binding to avoid DNS rebinding/TOCTOU, no unchecked auto-redirects, and egress policy. This follows OWASP SSRF guidance. |
| Visual system could be mistaken for decided tokens | Added a design-system brief distinguishing fixed design principles from values still unchosen. It makes Phase 1 accessible primitives mandatory but reserves brand/palette/type/token values for Phase 7 evidence-based design. |
| Security acceptance mixed RLS, grants and function execution | Future implementation gate must inspect grants separately from RLS, test actual role behavior, and narrowly scope privileged database function execution; database function security-definer routines require a pinned search path and narrow execute grants. See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database functions](https://supabase.com/docs/guides/database/functions). |
| Accessibility goal lacked a standard boundary | Design brief specifies WCAG 2.2 AA as an engineering target, expressly not a present conformance claim or certification; the final gate requires automated and manual evidence. |

## Review method and skill application

Read and applied the instructions from architecture, architecture-patterns, architect-review, C4 architecture, full review, documentation, design-md, brainstorming, deep-research, API design, database design, privacy-by-design, accessibility audit, and product planning skills. Used official-source web research for time-sensitive event, security, browser-permission, database and accessibility claims. The deep-research skill's separate credential-dependent runner was not used; this review's cited claims are directly sourced to primary/official material instead. Their key constraints were used: distinguish evidence from proposals, use diagrams only where they clarify boundaries, make decisions/revisit triggers explicit, avoid speculative visual tokens, define accessibility as testable criteria, and ground external facts in authoritative sources.

Reviewed document families: source-audit coverage ledgers and REA limits; current-system/context and architecture decisions; all web screen specifications; backend routes, stores, migration/RPC, workers, service contracts and test assertion ledgers; extension architecture and security findings; issue/improvement register; capability and phase plans; quality checklist; history/context/reference inventories; and cross-links/index. External research was kept to official/primary sources for requirements and security controls.

The project folder did not provide a Git remote/repository context or a CodeRabbit capability in the enabled plugin inventory, so no hosted PR review was available. Since the task changes Markdown only, the audit used local document-level checks instead. A broad REA/static-analysis result is treated as auxiliary evidence, not a substitute for reading source or validating runtime behavior.

## Research references

- [Official Meta Global AI Developer Hackathon page](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon) — date/deadline, track/theme and linked resources; accessed October 28, 2026. Rules/waiver details were not fully exposed in the accessible page and remain a verification item.
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — network-layer defense, DNS pinning/validation and redirect controls for user-directed fetches.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Database Functions](https://supabase.com/docs/guides/database/functions) — RLS is distinct from grants; privileged functions require narrowly scoped execution and safe function configuration.
- [Chrome extension permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) — use least privilege and optional permissions where user flow allows; the extension design now requires a permission-by-feature matrix and browser evidence.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) — design/verification target reference.
- [C4 model diagrams](https://c4model.com/diagrams) — use context/container diagrams as the baseline; add deeper levels only when they clarify a real responsibility boundary.
- [OWASP ASVS](https://asvs.owasp.org/) — possible security verification checklist baseline; no compliance claim is made.
- [Meta Model API overview](https://dev.meta.ai/docs/overview), [quickstart](https://dev.meta.ai/docs/quickstart), and [models](https://dev.meta.ai/docs/models) — confirm current account access, model identifiers, limits and pricing/credits during a short implementation feasibility check; do not hard-code a changing model catalog in planning architecture.

## Remaining gates before Phase 1

1. Re-estimate full parity against the remaining event window with actual implementer count, work hours, service access, and demo target. No estimate or staffing evidence is present in the docs.
2. Check official hackathon rules/waiver and confirm Meta AI requirements using currently published organizer instructions. The event page alone does not establish detailed scoring/mandatory-model policy.
3. Approve unresolved implementation choices in the architecture ADR: deployment topology, auth/storage, extension browser matrix, AI/provider access, retention, and per-account dedupe. Default to a simple modular application plus a worker boundary where durable processing requires it; do not introduce microservices without a concrete need.
4. Complete a live Meta API feasibility spike only once account access and current rules are confirmed. Preserve the deterministic product route if provider limits or access fail.
5. Before implementation, update this review with any new source branch or user-approved scope changes and re-run link/screen-to-phase validation.

## Related documents

- [Documentation index](../INDEX.md)
- [Phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md)
- [Screen/workflow phase matrix](../rebuild-plan/screen-workflow-phase-matrix.md)
- [Rembr design-system brief](../screens/rembr-design-system-brief.md)
- [Final review checklist](final-review-checklist.md)
