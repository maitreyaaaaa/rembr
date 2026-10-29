# Feature and acceptance matrix

Use this matrix as the capability-level implementation ledger and map each row to a gate in the [phase-gated rebuild roadmap](phase-gated-roadmap.md). Screen routes and state-level slices are mapped in the [screen/workflow phase matrix](screen-workflow-phase-matrix.md). “Reference evidence” should link to current source-trace docs, not merely old product notes. “Rembr outcome” records parity or a specific redesigned behavior. Scope deferral requires explicit user approval; schedule pressure alone is not approval. Fill and refine every row before treating the rebuild as complete.

| Capability | Phase | User outcome | UI/workflow evidence | API/data/worker evidence | Security and failure acceptance | Rembr outcome |
|---|---|---|---|---|---|---|
| Sign in/session | 1–2 | Phase 1: verified principal for core slice; Phase 2: complete session/profile lifecycle | Sign-in, session restore, expiry, sign-out | Principal resolution and protected routes | no session => no protected data; cross-user tests deny access | parity; Rembr-specific visual design |
| Capture URL in web app | 1, 3 | Phase 1: one direct URL/item/job/delete journey; Phase 3: remaining import formats and durable recovery | Add URL, validation, duplicate, pending feedback | Create endpoint, saved-item/job transaction | URL safety, bounded inputs, idempotent retry, no false success | parity plus URL controls |
| Browser page capture | 5 | Save current page deliberately | Toolbar/popup/overlay and auth/error states | Extension API client, accepted response | least permissions, origin policy, token storage/revocation, XSS/CSP | parity; test browser integration |
| Processing status | 1, 3 | Understand whether content is ready, partial, or failed | List/detail status, retry action where allowed | Job state machine, lease/retries, persisted artifacts | stale workers fenced; bounded retries; actionable terminal reason | parity with explicit states |
| Content extraction | 1, 3 | Read useful title/text/metadata | Detail page and processing progress | Fetch/extract pipeline and content storage | SSRF/redirect/size/time limits; hostile HTML treated as data | deterministic baseline required |
| Media/OCR/ASR extraction | 3–4 | Phase 3: bounded private image metadata/downloads and truthful partial media status. Phase 4: OCR/ASR/visual interpretation and any model-backed enrichment. Audio/video download parity remains to be reconciled against the source inventory before Phase 3 closes. | Item detail shows saved images and media failure status; processing may complete partially | Safe image fetch, private media artifact/provenance, later OCR/ASR adapters | SSRF/redirect/size/type/signature controls; stale files cleaned; unsupported media remains explicit | no model dependency in Phase 3; verify provider/runtime separately; do not claim live support without proof |
| Organization | 2 | Group and retrieve saved items | Collections/tags/filters/sort | Ownership-scoped CRUD and joins | child rows cannot escape parent ownership | parity; normalize overlapping storage only if no user-visible capability is removed |
| Search | 4 | Find saved content with predictable results | Search input, filters, empty/no-results/loading, per-result helpfulness | owner-scoped lexical retrieval, result-event feedback, later semantic pipeline | tenant isolation; provider outage does not break baseline; do not store raw query text | hand-calculated fixture at `docs/quality/phase-4-search-retrieval-evaluation.md`; executable ranking/tenant checks and semantic improvements remain unrun |
| Item detail | 1–2 | Inspect source and derived information | Metadata, content, transcript/summary, source link | read endpoints and derived-artifact tables | sanitize rendered content; avoid leaking source in logs | parity; provenance visible where useful |
| Delete | 1, 2, 6 | Phase 1: delete core item and neutralize queued work; Phase 2: regular item/child deletion; Phase 6: full account deletion lifecycle | Confirmation and completion feedback | ownership-checked delete and job cancellation | in-flight worker rechecks; cascade and provider retention documented | parity with full lifecycle |
| Export | 6 | Retrieve personal data | Export request/progress/download/error | export job, archive generation, access expiry | authenticated, scoped, expiring download; audit event | preserve source-backed export behavior; verify exact coverage and hosted storage separately |
| Preferences/account | 2, 6 | Manage profile and app behavior | Settings and account flows | preference/profile contracts | sensitive changes reauthenticate as required | parity for every source-backed preference/account behavior |
| Marketer workflows | 5–7 | Collect/review web intelligence efficiently | Research-oriented views and actions | shared saved-item/indexing contracts | do not fork tenant or privacy boundaries | parity across all source-inventoried workflow behavior, redesigned where findings require |
| Observability | 1, 3, 8 | Diagnose system behavior without exposing user content | user-safe error states | correlation IDs, metrics, worker/job history | redact URL/query/private text and secrets | preserve source-backed operational capability; document improvements and accept them explicitly |
| Accessibility/responsive | 1–2, 7–8 | Use all major flows across devices/input modes | Keyboard, focus, screen reader, narrow viewport | n/a | reduced motion and contrast requirements | Rembr design system acceptance |

## Acceptance evidence format

Each implemented row should link to: source component or endpoint; schema/migration; positive and negative test; visual proof for UI/extension; relevant threat control; and deployed/demo proof when external services are involved. A unit test is not proof of hosted auth, permissions, provider behavior, or visual quality. Mark unverified external behavior explicitly.


## Related documents

- [Phase roadmap](phase-gated-roadmap.md)
- [Screen/workflow phase matrix](screen-workflow-phase-matrix.md)
- [UI screen specifications](../screens/ui-surface-and-screen-specifications.md)
- [Final review checklist](../quality/final-review-checklist.md)
