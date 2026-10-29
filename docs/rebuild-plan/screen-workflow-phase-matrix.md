# Screen and workflow phase matrix

This is the screen-level companion to the [capability acceptance matrix](feature-and-acceptance-matrix.md) and controlling [phase roadmap](phase-gated-roadmap.md). Screen names and route references are transcribed from the source-backed [UI specification](../screens/ui-surface-and-screen-specifications.md). The phase number identifies the primary completion gate; shared shell, auth, accessibility primitives, and regression checks apply wherever a screen is touched.

Phase allocation describes when each screen's user-visible behavior is completed, not permission to postpone essential security or accessibility. Phase 1 contains only the narrow vertical slice. Each phase must record its source reference, accepted Rembr behavior, state coverage, owning API/data contracts, authorization, failure behavior, and verification evidence. Phase 7 reconciles complete visual parity after functional slices are already built.

## Web application screens

| UI surface from source specification | Primary phase | Work and exit evidence |
|---|---:|---|
| Landing (`/`) | 7 | Complete public product explanation, responsive navigation and links; Rembr copy and identity; route and accessibility review. |
| Login and profile setup (`/login`) | 1, 2 | Phase 1 establishes authenticated principal for private vertical slice. Phase 2 completes session restore/expiry/sign-out, profile completion, callbacks, invalid credentials, and account-state transitions. |
| Pricing (`/pricing`) | 6, 7 | Phase 6 aligns plan/credit presentation with actual billing/entitlement contracts; Phase 7 finalizes public presentation and responsive states. No plan/price claim without verified configuration. |
| Help and support (`/help`) | 7 | Help content, contact/support path, empty/error and responsive states; no disclosure of private content to support roles. |
| How to Use (`/how-to-use`) | 7 | Accurate workflow guide tied to implemented states; avoid describing planned/unavailable behavior as shipped. |
| Legal/privacy routes (`/terms`, `/privacy`, `/security`, `/data-deletion`, `/cookies`) | 6, 7 | Phase 6 reconciles statements with actual collection, retention, provider, export, deletion, and billing behavior; Phase 7 builds navigable public pages. Claims require owner/legal review where appropriate. |
| Admin support (`/admin`) | 6 | Role-gated safe projections, privileged action confirmation, audit history, denied/empty/loading/error states; test unauthorized access and sensitive-field redaction. |
| Workspace shell/access gate (`/app`) | 1, 2 | Phase 1 app frame and protected route for core slice; Phase 2 completes deep links, callback/session restoration, navigation, account status, and responsive workspace shell. |
| Library and search (`/app?tab=library`) | 1, 2, 4 | Phase 1 list/detail for one captured item. Phase 2 complete filters, sort, pagination, empty/loading/error and item actions. Phase 4 text search and feedback; a distinct image/Lens-like flow lets an authenticated user select and preview a bounded image, then search only their own saved library after enabling its separate versioned, off-by-default consent and submitting. Include provider/budget unavailable, upload validation, error, empty and result states. The initial evidence panel is exact-phrase, extractive, and cites owner-retrieved items. Grounded answers, follow-ups, and summaries are implemented locally with mocked provider coverage; live Meta behavior remains unverified under the deferred Phase 3 checks. Image search implementation and mocked API acceptance pass locally; authenticated browser review remains unverified. |
| Smart Collections (`/app?tab=smart`) | 2, 4 | Phase 2 collection CRUD and ownership; Phase 4 source-backed rule evaluation and search integration. |
| Content Workflows (`/app?tab=workflows`) | 5 | Full workflow lifecycle, approval/readiness/dispatch distinction, audit evidence and integration failure states; external actions remain approval-gated. |
| Automations (`/app?tab=automations`) | 5 | Automation creation, scheduling/paused/failed states, explicit approval for consequential actions, audit and retry controls. |
| Library Checkup (`/app?tab=care`) | 4 | Diagnostics, suggested actions, dismiss/undo or remediation outcomes, deterministic behavior when optional AI is unavailable. |
| Knowledge Graph (`/app?tab=graph`) | 4 | Graph query/data ownership and useful accessible alternative to visual-only graph; loading/empty/error/large-data states. |
| Add content (`/app?tab=upload`, Quick Add) | 1, 3 | Phase 1 one direct URL submit with persisted status. Phase 3 other source-backed inputs, upload/import review, validation/size/progress/cancel/retry states. |
| Item detail drawer | 1, 2, 3, 4 | Phase 1 canonical source/title/status. Phase 2 full item/child CRUD. Phase 3 extracted/media artifacts and provenance. Phase 4 summaries, citations, and enrichment when source-backed. |
| Settings/account/privacy center (`/app?tab=settings`) | 2, 4, 6 | Phase 2 profile/preferences/session. Phase 4 includes distinct versioned, off-by-default image-search consent with a clear disclosure of the selected image and provider use; it is separate from import-media analysis and grounded-answer consent. Phase 6 security activity, export, deletion, data controls, billing/account status. Toggles must correspond to actual behavior. |
| Guided workspace tour | 7 | Build only after route/navigation selectors stabilize; replay, skip, focus, responsive and reduced-motion checks. |

### Shared screen states and cross-screen rules

- Phase 1 must define and verify the shared design primitives needed for a usable shell, including keyboard focus, semantic status announcements, reduced motion, and responsive operation. Visual identity work is still deferred to Phase 7.
- Each screen specifies loading, empty, error, partial, disabled, success, permission-denied, and confirmation states as applicable; avoid fake states that cannot arise from server contracts.
- Item state is canonical server data. Mutations update or re-fetch authoritative state; browser Back/Forward, refresh, deep link, and session expiry have explicit outcomes.
- Destructive actions identify what will be removed and whether downstream jobs, derived artifacts, or provider copies are affected. An item delete in Phases 1–2 is not the full account deletion/export lifecycle in Phase 6.
- External integrations show received/classified/drafted/pending approval/approved/executed/failed/logged states where applicable; approval is checked on the server at execution time.

## Browser extension surfaces

| UI surface | Primary phase | Work and exit evidence |
|---|---:|---|
| Toolbar/popup, login/connection | 5 | Deliberate connect/save flow, token expiry/revoke, supported origin, unavailable API and truthful acceptance feedback. |
| Page overlay/selection capture | 5 | Explicit user gesture, page-content untrusted, safe DOM boundary, permission and consent states, hostile-page behavior. |
| Side panel and options/settings | 5 | Preferences match actual behavior; unsupported origin rejected before credential use; permission-by-feature matrix and browser tests. |

See the [extension architecture and rebuild](../extension-security/extension-architecture-and-rebuild.md) and [security review](../extension-security/security-review-and-findings.md) for source specifics.

## API and worker workflow ownership

| Workflow/domain | Primary phase | User-visible screen connections | Contract and gate |
|---|---:|---|---|
| Auth principal and protected-resource checks | 1, 2 | Login, app shell, every private route | Phase 1 denies unauthenticated and cross-user core access; Phase 2 completes account/session lifecycle and resource-wide ownership matrix. |
| Saved item + durable job acceptance | 1 | Quick Add, library, item detail | Transactional durable acceptance, canonical status, request correlation, item delete prevents job resurrection. |
| Collection/tag and item child CRUD | 2 | Library, detail, Smart Collections | Owner/parent invariants, pagination/filter rules, direct-ID adversarial checks. |
| Import, upload, extraction, job lifecycle | 3 | Add, item detail, status/progress | Redirect/DNS-safe fetch, bounded inputs, durable leases/fencing, retries, partial/terminal status and restart recovery. |
| Search, semantic retrieval, AI artifacts | 4 | Library/search, graph, checkup, detail | Tenant-scoped deterministic baseline; optional models remain additive, attributable and failure-tolerant. |
| Visual/image library search | 4 | Library image-search flow and Settings consent | Dedicated consent gate; bounded image size/type validation; provider and budget checks before analysis; no raw image/provider payload or visual query text in persistent logs/events; owner-scoped retrieval; useful-result feedback; safe unavailable/failure response. Semantic embedding provider selection remains open and does not gate this separate image-search scope. |
| Extension credentials/capture API | 5 | Popup/overlay/side panel | Permission/origin, token lifecycle, input trust, revocation and browser proof. |
| Workflow/automation/integration dispatch | 5 | Content workflows, automations | Server-side approval gate, signed/idempotent callbacks, audit log and no duplicate side effect. |
| Billing, credits, export, account deletion, admin | 6 | Pricing, settings, legal/data-deletion, admin | Signature/ACL/tenant gates, ledger idempotency, export completeness, deletion lifecycle, audited privileged actions. |
| Cross-system quality, operations and deployment | 8, 9 | All surfaces | Phase 8 security, accessibility, failure, migration and recovery evidence; Phase 9 deployed smoke/demo/submission evidence. |

### Completion rules

1. Map every screen and workflow row above to source evidence and the capability ledger. A route listed here is not complete merely because it renders.
2. Record the backend contract, role/owner rule, state transitions, error taxonomy, and test/evidence artifact for each interaction.
3. Any source behavior that is intentionally redesigned must name the user problem or source defect and describe the replacement acceptance test.
4. No row can be marked complete with a mock where the acceptance requires real persistence, real browser behavior, or live external verification.

## Related documents

- [UI screen specifications](../screens/ui-surface-and-screen-specifications.md)
- [Rembr design-system brief](../screens/rembr-design-system-brief.md)
- [Feature and acceptance matrix](feature-and-acceptance-matrix.md)
- [Phase-gated roadmap](phase-gated-roadmap.md)
- [Final review checklist](../quality/final-review-checklist.md)
