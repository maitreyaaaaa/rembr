# Phase 2 — Identity, tenancy, and library lifecycle

**Status:** In progress. The architecture design passed sequential skeptic, constraint-guardian, user-advocate, and integrator/arbiter review on 2026-10-28. This is not a Phase 2 gate pass.

## Scope

Complete the approved Phase 2 scope in the [roadmap](phase-gated-roadmap.md): account status, profile/onboarding/session lifecycle, owner-scoped library and metadata edits, notes/private images/links, tags, manual collections and membership, app routes/deep links, pagination/filter/sort, migration compatibility, and the approved regression/accessibility gate. Dynamic smart-collection rules and privacy/export/deletion/billing settings remain later-phase work.

## Accepted design

- [Phase 2 architecture design](../architecture/phase-2-architecture-design.md)
- [Feature and acceptance matrix](feature-and-acceptance-matrix.md)
- [Screen/workflow matrix](screen-workflow-phase-matrix.md)

Architecture decisions are accepted in the design record. Keep the reference checkout read-only. SQLite remains the current adapter. Asset metadata remains durable until private-file deletion succeeds.

## Implementation slices and evidence

| Slice | Status | Evidence / notes |
|---|---|---|
| Additive migration and owner-safe schema | In progress | Preserve populated Phase 1 `001` data; test fresh and upgrade paths. |
| Account status, profile, onboarding, and session gates | In progress | Disabled accounts rejected on every protected request; profile-incomplete gate has a stable response. |
| Library edit/list, filters, sorting, cursor pagination | In progress | Owner-derived queries, per-sort keyset cursor and metadata override preservation. |
| Tags, manual collections and memberships | In progress | Composite ownership constraints and idempotent membership changes. |
| Notes and private assets | In progress | Bounded links/body/images, `staging → ready → deleting`, retryable cleanup. |
| Routed app surfaces | In progress | Deep links, refresh, Back/Forward, account setup, library/detail/edit, notes, organization and settings. |
| Consolidated Phase 2 gate | Not run | Run after implementation is integrated. |

## Required verification before passing

- [ ] `npm run check` passes, including Phase 1 regression.
- [ ] Migration applies on a fresh DB and upgrades a populated Phase 1 `001` DB without loss.
- [ ] Two-user tests cover item, child, collection, asset, search, and job projection isolation.
- [ ] Disabled-account session rejection, profile gate, session expiry, username collision, URL dedupe, and metadata override preservation pass.
- [ ] Note body/link/image bounds, tag/collection CRUD, membership idempotency, pagination/filter/sort, and delete races pass.
- [ ] Asset storage failure/crash cases preserve `ready`-only reads and retryable cleanup.
- [ ] Browser walkthrough covers register → profile → onboarding → save/edit/list/filter/page → note/image → tag/collection → refresh/deep link/history → delete.
- [ ] Keyboard and narrow viewport review covers each completed surface.
- [ ] Phase 1 regression remains green; hosted CI and hosted database behavior are labeled separately if unavailable.

## Gate decision

**Not passed.** Update this record with exact test/browser evidence, defects and fixes, unresolved risks, and a date before advancing to Phase 3.
