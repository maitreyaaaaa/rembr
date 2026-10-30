# Phase 2 Architecture Design — Identity, Tenancy, and Library Lifecycle

**Status:** Accepted after sequential skeptic, constraint-guardian, user-advocate, and integrator/arbiter review.  
**Scope:** Full Phase 2 of the [phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md).  
**Related acceptance sources:** [capability matrix](../rebuild-plan/feature-and-acceptance-matrix.md), [screen/workflow matrix](../rebuild-plan/screen-workflow-phase-matrix.md), [current UI specifications](../screens/ui-surface-and-screen-specifications.md), [API route/source audit](../backend/api-routes-and-contracts.md), [current system design](./system-design-and-boundaries.md), and [Phase 1 evidence](../rebuild-plan/phase-1-record.md).

**Current architecture note:** This design records the originally approved Phase 2 SQLite baseline. ADR-R12 later superseded that persistence choice: current Rembr uses Supabase Postgres only and PGlite for local schema-matched tests. The historical Phase 2 decisions below are not the active database configuration.

## User approval record

The user approved the full Phase 2 roadmap scope, selected the modular-monolith direction, and then answered “Looks right” to each of the seven sequential design sections below. The question/approval record is also preserved in the Obsidian decision note `2026-10-28 Rembr Phase 2 Architecture Approvals`.

1. **Module boundaries:** one modular monolith with account, library, and organization domains; route/service/repository layering; SQLite retained; private local asset storage behind an interface; no microservice split or dynamic smart-collection evaluation in Phase 2.
2. **Schema:** additive migration `002`; preserve Phase 1 records; profile and account status; notes as typed library items; normalized note links/assets, tags, collections, and memberships; composite owner foreign keys; user metadata overrides; fresh-install and upgrade migration coverage.
3. **Account flow:** retain email/password and opaque HttpOnly hashed-token cookie with 12-hour expiry; check account status on each authenticated request; normalized unique usernames; validated avatar upload or HTTPS URL reference; allowlisted, skippable onboarding; profile-incomplete route gate.
4. **Library contract:** preserve existing item endpoints and per-owner canonical URL deduplication; add title/description overrides; allowlisted filter/query/sort and bounded keyset pagination; notes remain in the item list; derive ownership from session and conceal cross-owner IDs; hard-delete with worker resurrection guard.
5. **Private assets:** source limits and MIME/signature validation; server-generated storage keys outside `public/`; authenticated owner-scoped reads; local filesystem adapter; `staging → ready → deleting` lifecycle with compensation and startup recovery; never fetch avatar URLs server-side.
6. **Application shell:** React Router for `/app/*` deep links and history while preserving marketing routes; implement the listed account, library, item, note, organization, and settings screens; keep server state authoritative and URL-backed list state; use accessible Daybreak controls and defer final visual polish.
7. **Acceptance gate:** fresh and upgrade migrations preserve Phase 1 data; API isolation, lifecycle, CRUD, pagination, and failure-injection checks; browser walkthrough through registration, capture, notes/assets, organization, history, and deletion; keyboard/narrow viewport and Phase 1 regression gates; hosted DB/CI remain separately labeled.

## 1. Understanding and scope lock

Phase 2 completes identity, tenant ownership, and the user-owned library lifecycle after the authenticated Phase 1 capture-to-library slice. Build the server/data contracts and minimum usable screens first. Keep the accepted Daybreak app primitives for legibility and access; defer the final visual pass, marketing-style motion, and decorative UI refinement.

In scope:

- Session restore, expiry, logout, profile completion, onboarding preferences and skip, and account active/disabled access checks.
- Owner-scoped library item listing, detail, metadata overrides, canonical URL duplicate behavior, filtering, sorting, and pagination.
- Notes and note links as first-class library records, with private image assets.
- Owner-scoped tags, collections, and item memberships.
- App routes and deep links for account setup, library, item detail/edit, notes, collections, tags, and settings.
- Phase 2 settings/preferences are limited to source-backed profile and onboarding preferences (content types and referral source). Account security activity, privacy/data controls, exports, deletion, billing, and other sensitive settings are Phase 6. The source-backed screen specification does not identify another persistent app-preference contract for Phase 2; do not invent toggles. Library query/layout state remains URL/UI state, not a new account preference.
- Additive migration from the existing Phase 1 schema, database constraints, transaction boundaries, tests, and browser-level verification.

Explicit Phase 2 boundaries:

- Dynamic smart-collection rules/evaluation remain Phase 4. Phase 2 provides manually managed collections and safe ownership/membership operations.
- Account deletion/export, billing, admin UI, hosted Postgres/Supabase/RLS and deployment remain later phases.
- No Google/OTP/OAuth migration: Rembr retains its current email/password account model.
- Do not modify the IScraper reference checkout. Its current uncommitted files are unrelated and remain untouched.

## 2. Requirements and non-functional assumptions

- **Scale:** no user/data/traffic target has been specified. Treat Rembr as a single-node hackathon app; design bounded queries and owner indexes without inventing performance guarantees.
- **Database:** SQLite remains the current runnable adapter. Contracts should avoid depending on SQLite-only behavior so the future Postgres/Supabase adapter can match them.
- **Security:** every private operation obtains `owner_id` from the verified session. Request bodies never supply an authoritative owner. Parent and child ownership is checked in application code and reinforced with composite foreign keys.
- **Reliability:** database migrations run transactionally; item/note changes have explicit transactions; asset storage is recoverable across a process crash.
- **Maintenance:** modular monolith, TypeScript, Zod request validation, focused domain services and repositories. No service split or general-purpose framework buildout.
- **External effects:** Phase 2 adds no email sending, publication, provider AI, or other user-surprising action.

## 3. Architecture and module boundaries

Use one modular monolith in `apps/api` with the existing HTTP server and SQLite connection:

```text
HTTP routes (validate / map response)
  -> application services (authorization-aware use cases and transactions)
    -> repositories (parameterized SQL and row mapping)
      -> SQLite adapter

Asset service -> AssetStorage port -> private local filesystem adapter
```

### Account module

Own registration/login/logout/session resolution, account status enforcement, profile read/update, and onboarding state. Reuse the existing opaque random session cookie, SHA-256 token hash, HttpOnly/SameSite cookie, and 12-hour expiry. A `disabled` account is denied on login and on every subsequent protected request, even when an older cookie is present. Phase 2 defines no public self-disable/delete endpoint; the destructive account lifecycle remains Phase 6.

### Library module

Own saved web pages, notes, item metadata overrides, list/detail, canonicalization, duplicate handling, and deletion. Keep extracted source title/text/status/provenance separate from user-editable title/description overrides. Notes are library items with a note child record; they do not create a parallel unowned content store.

### Organization module

Own tags, manual collections, memberships, and collection assignment. Dynamic collection candidate generation, refresh, and rule evaluation are explicitly Phase 4.

### Composition and layering

`createApp` composes routers and dependencies. Route modules validate and serialize but do not issue SQL. Services apply product rules and coordinate transactions. Repositories own SQL. Avoid mandatory BaseController/DI/Sentry infrastructure from generic backend templates when this small codebase does not need them; errors continue through the existing structured response boundary. Share the database handle and small interfaces rather than introducing microservices or an ORM.

## 4. Proposed HTTP and application contracts

Existing auth and item endpoints remain compatible. All new routes use the existing `/api` base and `{ error: { code, message, requestId? } }` envelope.

| Surface | Contract |
|---|---|
| Auth | Keep `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`; extend session projection only with additive account/profile state. |
| Profile | `GET /api/profile`, `PATCH /api/profile`; normalized globally unique username, optional HTTPS avatar URL, or multipart private avatar asset. |
| Onboarding preferences | `GET /api/onboarding`, `PUT /api/onboarding`; validate only source-defined content/referral values; save or skip. Skip is persisted and is not conflated with profile completion. Content types are a de-duplicated subset of the audited source allowlist; referral source is one audited enum value or empty. |
| Items | Keep `POST/GET /api/items`, `GET/DELETE /api/items/:id`; add `PATCH /api/items/:id` for user-editable overrides. |
| Notes | `POST /api/notes`, `PATCH /api/notes/:id` multipart/form-data; `DELETE` through the library item route. Plain-text body max 20,000 characters; up to 20 normalized unique HTTP(S) links; up to five images, 5 MiB each. |
| Tags | `GET/POST /api/tags`, `PATCH/DELETE /api/tags/:tagId`; idempotent `PUT/DELETE /api/items/:itemId/tags/:tagId` membership routes. Names are trimmed, normalized, bounded, and unique per owner; an existing membership `PUT` succeeds without duplication. |
| Collections | `GET/POST /api/collections`, `GET/PATCH/DELETE /api/collections/:collectionId`, `GET /api/collections/:collectionId/items`; idempotent `PUT/DELETE /api/collections/:collectionId/items/:itemId`. Collections are manual in Phase 2. Deleting a tag/collection cascades only its membership rows, not library items. |
| Assets | `GET /api/assets/:id`, only after authenticated owner verification and `ready` state. No public/static file route. |

Use Zod for body, query, route, and enum validation. Default private behavior: 401 unauthenticated/expired, 403 disabled, 404 for both missing and another user's resource, 409 unique-name/state conflicts, 413 bounded upload overflow, and 428 `{ error: { code: "PROFILE_INCOMPLETE", ... } }` for gated routes. The response never echoes private profile data. The browser stores a validated same-app `returnTo` route while showing setup, returns there after a successful profile save, and displays username conflicts inline without losing the entered value. A failed profile save stays on setup with a retryable error; route guards recognize setup/session paths to prevent loops. Preserve request IDs; never log password, cookie, note body, avatar URL query, or asset bytes.

### Identity and gates

Registration creates an `active` user and the existing session, then the user completes a profile. Profile username follows the source constraint `[a-z0-9_]{3,24}` after trim/lowercase. Username collision returns 409 without leaking another user's profile. Only session/profile/onboarding/logout routes are usable before profile completion; all other private routes apply a shared server-side completion gate. Onboarding may be skipped and then the user can proceed. The same policy is used in UI and API; UI routing alone is never authorization.

### Item list and duplicate rules

`GET /api/items` retains title/URL search and adds validated type, status, tag, collection, sort, and `limit` filters (default 25, range 1–100). Supported sorts are `created_desc` and `created_asc` keyed by `(created_at,id)`, and `title_asc`/`title_desc` keyed by `(effective_normalized_title,id)`; each key has a unique ID tie-breaker and direction matching its sort. Include `nextCursor`/`hasMore`. The opaque cursor encodes its version, owner, sort, normalized query/filter fingerprint, and last key tuple; reject malformed, wrong-owner, or mismatched-query cursors with a validation error. Changing query/filter/sort resets the cursor in the UI. Map sort values to fixed SQL expressions, never concatenate arbitrary input. Keep per-user URL deduplication and existing fragment removal; do not globally dedupe accounts. Note URIs use generated IDs and never enqueue a fetch job. Search uses the same session-derived owner predicate; job state is exposed only in that owner's item projection in Phase 2, with no new public job-ID route.

## 5. Relational model and ownership invariants

Migration `002_phase2_account_library.sql` is additive and transactional. Preserve the Phase 1 `users`, `sessions`, `saved_items`, `processing_jobs`, and `extracted_artifacts` rows. Existing saved items default to `page`; no existing URL, session, job, or artifact is dropped or rewritten. `createDatabase` registers migrations in deterministic order and supports applying `001` then `002`.

Proposed entities:

- `users`: current credentials and identity, plus `account_status IN ('active','disabled')` defaulting to active. Password hash never enters public projections.
- `profiles`: one row per `user_id`, unique normalized `username`, nullable HTTPS `avatar_url` or owned `avatar_asset_id`, timestamps. The user can clear either avatar value; private uploaded avatar storage follows the asset lifecycle below.
- `onboarding_preferences`: one row per user for referral/status timestamps; `onboarding_content_types` stores validated choices as one row per `(user_id, content_type)` rather than an unvalidated JSON blob.
- `saved_items`: add `item_kind IN ('page','note')`, `title_override`, and `description_override`. Keep the extractor's source values unchanged.
- `notes`: one-to-one `(owner_id,item_id)` child of a `note` item, with body limited to 20,000 characters and timestamps. `note_links` stores at most 20 normalized unique HTTP(S) links per note and excludes local/private destinations.
- `asset_objects`: owner, generated storage key, detected MIME, byte size, hash, timestamps, and `staging|ready|deleting` lifecycle state.
- `note_assets`: owner/item/asset/position relation. `tags`, `item_tags`, `collections`, and `collection_items` each carry `owner_id` and use composite foreign keys to their owner-scoped parent rows.

Every child row uses a composite `(owner_id, parent_id)` reference where applicable. Unique constraints enforce `(owner_id, normalized_tag_name)`, `(owner_id, collection_name)`, `(owner_id, item_id, tag_id)`, and collection membership uniqueness. Index owner plus the list/filter/sort columns actually queried. Item hard delete cascades jobs and relational children; it must preserve the Phase 1 in-flight-worker fence. Tag and collection deletion cascades membership rows only. Asset metadata is deliberately not cascaded until its physical file is gone.

### Canonicalization and edit rules

Canonical URLs use WHATWG URL normalization, lowercase hostname/default-port normalization and fragment removal already present in Phase 1. Preserve query strings because they can identify content. Do not strip tracking parameters without a source-backed, documented decision. User title/description edits write override fields; extraction never overwrites them. Duplicate page capture returns the existing owner's item; another owner with the same URL gets an independent record.

## 6. Asset lifecycle and storage

Preserve audited limits: at most five note images, 5 MiB each; profile image at most 250 KiB; PNG/JPEG/WebP/GIF for note images and PNG/JPEG/WebP for avatars. Validate multipart count/size, MIME allowlist, filename extension, and magic bytes. Generate UUID paths server-side; never use client filenames as paths. Store files under configured private `data/assets`, outside `apps/web/public` and outside any static server mount. Remote HTTPS avatar values are stored as references only and are never fetched by the API.

Uploads enter a recoverable state machine:

```text
metadata row staging -> bounded temp write -> atomic rename -> metadata ready
metadata ready -> inaccessible state deleting -> unlink -> metadata removed
```

Only `ready` assets are readable. Authenticated `GET /api/assets/:id` verifies owner and serves the stored detected type with `X-Content-Type-Options: nosniff` and private/no-store caching. The asset metadata row and generated key remain durable in `deleting` until unlink succeeds; only then may the row be deleted. Item/child cascade must never cascade-delete an asset row with a physical object. Startup recovery retries `deleting`, removes stale `staging` rows/files, and prunes unreferenced `ready` rows/files after a conservative grace period. A `staging` asset becomes `ready` after validated atomic rename; an unreferenced ready asset is not exposed in the UI and is later pruned if the note-reference transaction never commits. Orphan scanning is scoped to the configured asset directory and generated key format. Run recovery before listening and log only sanitized IDs/error classes. This is single-node local SQLite; a future multi-instance adapter needs distributed leases or object-store lifecycle rules.

Deleting an item first marks its assets `deleting` in a committed DB transaction and detaches note references while retaining asset metadata. It then unlinks local objects and deletes each metadata row only after successful unlink. Failed unlinks remain unavailable and are retried at startup. Note edit protocol: (1) stage and atomically write new files, making them `ready` but not yet linked; (2) in one DB transaction update body/links, switch note-asset associations to the new ready assets, and mark old assets `deleting`; (3) after commit, unlink old files and remove metadata. A crash before step 2 leaves the old note usable and new assets eligible for grace-period orphan cleanup; a crash after step 2 leaves the new note usable and old assets durably queued for cleanup. A failure before step 2 preserves old content and references, compensating only new files/rows. This is an atomic user-visible version switch, not a cross-resource transaction.

## 7. Web routes and state behavior

Add React Router for stable browser history/deep links while keeping the public marketing routes unchanged. Proposed app paths: `/app`, `/app/setup/profile`, `/app/setup/onboarding`, `/app/items/:itemId`, `/app/items/:itemId/edit`, `/app/add`, `/app/notes/new`, `/app/collections`, `/app/collections/:collectionId`, `/app/tags`, and `/app/settings/profile` / `/app/settings/preferences`. Settings/preferences are the profile and onboarding fields described above; no Phase 2 behavior toggle is presented without a source-backed effect. The item detail has a clear Edit action; save updates the returned canonical item, cancel discards only unsaved local form state, and errors retain inputs. Collection detail supports adding/removing the current user's items; tag controls support applying/removing tags. Duplicate membership is a no-op success; empty states explain the next available action; delete confirms and reports completion/error.

Build usable Daybreak-based screens for account setup, onboarding, paginated/filterable library, page detail/edit, note editor with image preview/removal, collection/tag management, and settings. This is functional acceptance work, not the final Phase 7 visual treatment. Persist filters/search/sort/cursor in URL search parameters. Session restore runs before private routes render; incomplete profiles redirect to setup; skipped onboarding does not loop. After mutations, refetch canonical server data or update from returned canonical records. Clear user-scoped UI state on logout or account change. Every screen has real loading/empty/error/success/disabled states; no fake server responses.

Keyboard focus, form labels, status announcements, focus restoration after dialogs, narrow viewport reflow, and reduced motion remain acceptance criteria. No hover-only action is allowed. Expired sessions clear cached private data, show sign-in, and preserve a validated same-app return path; after sign-in, restore the requested route. Disabled-account responses clear private UI state and show a stable access-denied state instead of retrying or looping.

## 8. Data flow and transaction rules

1. Session middleware resolves the opaque cookie hash to an active user and attaches `{id,email}`. Account status and session expiry are checked on every protected call.
2. A shared profile gate runs after authentication for library/organization calls. The owner ID always comes from this principal.
3. Route schemas parse bounded input. Services apply canonicalization/duplicate/ownership rules and open the transaction required by that use case.
4. Repositories issue parameterized owner-scoped SQL; API projections exclude password hashes, storage keys, and internal lifecycle fields.
5. For note creation, stage and atomically write image files first, then one DB transaction creates the `note` item, note row, links, ready asset metadata/references, and memberships. If the transaction fails, compensate new rows/files. A crash after file write but before row commit leaves a recognizable orphan, removed by grace-period startup cleanup.
6. For note edit, validate existing parent ownership first. Stage/promote new images without changing existing references; in one DB transaction replace body/link rows and asset associations and mark old assets `deleting`. After commit, unlink old files and remove metadata. Startup recovery follows the pre/post-commit invariants in §6.
7. On page delete, mark related assets `deleting` in a committed transaction, then cascade the item, job, note, links, and membership rows while preserving asset metadata; unlink files and remove asset metadata on success. A running worker rechecks the item and cannot restore it. Startup retries failed cleanup.

## 9. Options considered and trade-offs

| Option | Benefits | Costs/risks | Disposition |
|---|---|---|---|
| Keep one flat `app.ts` and one growing repository | Lowest immediate file count; no module setup | Auth, ownership, CRUD, notes and storage would share route code; transactions and tests become harder to isolate; Phase 3–6 complexity compounds | Rejected after design discussion |
| **Modular monolith with account/library/organization modules** | Fits current single API and SQLite; explicit owner and transaction boundaries; services/repositories test without adding infrastructure; future adapter can follow ports | More files and module wiring; requires clear contracts | **Selected** |
| Split services and deploy separate databases/object storage now | Independent scale/security boundaries are possible | New operational failure modes, credentials, deployment, data consistency, and latency before any measured need; conflicts with local-first Phase 1 | Rejected as premature |

## 10. Decision log

| ID | Decision | Alternatives | Rationale / consequence |
|---|---|---|---|
| P2-D1 | Use a modular monolith | Flat `createApp`; microservices | Explicit domains and test boundaries with current small deployment footprint. |
| P2-D2 | Preserve SQLite and add migration `002` | Replace database now; rewrite `001` | Retains working Phase 1 flow and permits reproducible clean/upgrade migration tests. |
| P2-D3 | Enforce owner IDs in session, queries and composite FKs | Client-supplied owner; application checks alone | Reduces IDOR/cross-tenant risk even with direct child IDs. |
| P2-D4 | Represent notes as typed saved items with child content/assets | Separate note-only library | Keeps one retrieval, ownership, detail and delete lifecycle. |
| P2-D5 | Normalize tags/collections/memberships; defer dynamic rules | JSON arrays on each item; implement all smart-rule engine now | Consistent CRUD and ownership; rule engine is explicitly Phase 4. |
| P2-D6 | Use private local storage behind `AssetStorage`, with staged lifecycle | Public static files; SQLite blobs; remote object store now | Protects assets and supports crash recovery without requiring hosting credentials. |
| P2-D7 | Keep opaque hashed sessions and add account/profile gates | JWT/provider migration | Preserves working auth and fulfills source-backed profile workflow with minimal new risk. |
| P2-D8 | Use React Router for app deep links/history | One giant component/manual pathname state | Replaces app routing hacks as Phase 2 adds several workflows; keep marketing route behavior intact. |
| P2-D9 | Build functional Daybreak screens now; final polish later | Fully defer UI or finish marketing-like visual pass now | The user asked for a working whole app before the aesthetic pass. |

## 11. Risks and mitigations

- **Scope size:** Phase 2 has multiple CRUD workflows. Implement in small end-to-end slices and gate each before moving on; do not silently omit approved capabilities.
- **Profile gate lockout:** keep profile/session/onboarding/logout endpoints available; onboarding is skippable; test expired and disabled sessions separately.
- **Cross-user child access:** composite owner foreign keys plus adversarial tests for every item/tag/collection/note/asset ID.
- **Migration breakage:** apply from empty DB and from a populated Phase 1 database, preserving sessions and queued jobs; test migration failure rollback.
- **Filesystem/database boundary:** staged states, compensation, startup recovery, and injected-failure tests. Future multi-instance deployment must replace local recovery assumptions.
- **Remote avatar URL:** do not fetch server-side; explain browser third-party request behavior and allow clearing the reference.
- **Cursor stability:** deterministic tie-breakers and fixed sort allowlist; reset cursor on any query/filter change.
- **Source defects:** the source audit identifies partial note asset storage compensation risk and limited upload validation. Rembr adds signatures, owner-gated access, staged cleanup, and parent-derived ownership.

## 12. Implementation sequence and phase gate

1. **Migration/data model:** add `002`, repositories, ownership constraints, clean/upgrade fixtures.
2. **Account foundation:** active/disabled check, profile/onboarding APIs and completion gate; test auth lifecycle and username conflict.
3. **Library lifecycle:** metadata overrides, list query schemas, cursor pagination, filters, sort, and existing item mutation regression.
4. **Organization:** tag/collection CRUD and owner-scoped memberships with composite FKs.
5. **Notes/assets:** multipart limits, private storage lifecycle, note links, upload recovery and delete compensation.
6. **Functional app routes:** session/setup, library, detail, add, notes, collections/tags and settings; preserve marketing pages.
7. **Consolidated verification:** full `npm run check`, fresh and populated-001 migration, migration failure atomicity/repair evidence, two-user integration suite, local browser walkthrough, responsive and keyboard review, docs/evidence update.

The Phase 2 gate includes explicit cross-user item, child, collection, asset, search, and job-projection checks; disabled-account rejection; canonical URL duplicate behavior; metadata edit preservation; note body/link/image limits; membership idempotency and deletion behavior; every allowed sort's pagination boundary and cursor mismatch rejection; fresh/populated-001 migration preservation; storage failures and crashes before/after note-edit commit; and worker-delete races. Browser walkthrough covers register → profile → skip/complete onboarding → save page → edit/list/filter/paginate → note+image → tag/collection → refresh/deep link/back/forward → delete, plus expired-session recovery. Keyboard and narrow viewport checks cover each completed surface. Phase 1 regression must remain green. Hosted Postgres/RLS, production object storage, hosted CI and final visual polish remain explicitly unverified/later-phase.

## Related implementation files

- Current HTTP composition: `apps/api/src/app.ts`
- Current DB/migration runner: `apps/api/src/db/database.ts`
- Current owner-scoped item repository: `apps/api/src/items/repository.ts`
- Current hashed session logic: `apps/api/src/auth/sessions.ts`
- Current web root: `apps/web/src/App.tsx`
- Original Phase 1 migration: `apps/api/src/db/migrations/001_initial.sql`

## 13. Structured peer review and resolution

Reviews were performed sequentially by the skeptic, constraint guardian, and user advocate. Findings are recorded below; no reviewer edited the proposal or introduced product scope.

| Finding | Decision | Resolution |
|---|---|---|
| High: delete cascade could erase the retry record before failed asset unlink | Accepted | Asset rows remain `deleting` until unlink succeeds; item/child deletion does not cascade asset metadata. Startup retries by generated storage key. See §§5–6. |
| High: note edits lack a crash-safe boundary across SQLite and disk | Accepted | Stage files first; atomically switch note references and mark old assets deleting in one SQLite transaction; preserve old version before commit and new version after commit. See §§6, 8. |
| High: Phase 2 preferences scope is ambiguous and settings routes are generic | Accepted | Explicitly limit Phase 2 to profile and source-defined onboarding preferences. Defer privacy/security/export/deletion to Phase 6; do not invent preference toggles. See §§1, 4, 7. |
| Medium: note bounds and tag/collection membership contracts were missing | Accepted | Record body/link/image bounds, REST routes, idempotency, owner uniqueness and membership cascade behavior. See §§4–5. |
| Medium: item edit and tag/collection UI journeys were underspecified | Accepted | Add explicit edit route/action, save/cancel/error handling, organization interactions, duplicate/empty/delete states. See §7. |
| Medium: profile gate and session recovery could loop or strand the user | Accepted | Specify 428 `PROFILE_INCOMPLETE`, validated `returnTo`, inline username conflict, retryable failure, expiry restore, and disabled-account denial. See §§4, 7. |
| Medium: cursor did not match configurable sort order or bind query/owner | Accepted | Define allowed sorts and per-sort tuple, bounded limit, opaque cursor owner/query fingerprint, and mismatch rejection. See §4. |
| Medium: Phase 2 gate omitted roadmap cross-user search/job checks | Accepted | Explicitly add tenant isolation for search and job projections. No public job-ID route is added. See §12. |

**Integrator/arbiter decision:** Accepted. The independent integrator confirmed the objections are resolved and scope matches the approved Phase 2 roadmap. Implementation invariant: persist each asset's `staging` record before writing its file, then mark it `ready` only after atomic rename.
