# Phase 1 — Core foundation and vertical slice

**Status:** Passed — 2026-10-28. This records the local Phase 1 gate. A later full local check also passed after the marketing/UI changes on 2026-10-28; hosted CI status was not inspected during that rerun.

## Scope

Deliver the narrow authenticated journey defined in the [phase roadmap](phase-gated-roadmap.md): register/sign in, submit one public URL, durably store a user-owned item and job, deterministically extract a readable copy, show it in the library, and delete it without allowing an in-flight worker to restore it.

## Architecture choices for this phase

- Fresh npm workspace with a React/Vite UI and TypeScript/Express API; no IScraper code or history copied.
- Durable local SQLite adapter with migrations, owner-specific predicates, foreign keys, and a worker process. PostgreSQL/Supabase remains a required pre-deployment adapter decision; this phase does not claim hosted RLS proof.
- Server-side opaque sessions in HttpOnly/SameSite cookies; only a hash of the random token is stored. Passwords use bcrypt.
- Public HTTP(S) capture only. Resolve and reject non-public destinations, pin the selected validated address for connection, manually revalidate redirects, cap response size, require HTML/XHTML/plain text, and extract without executing page scripts.
- UI tokens are provisional and functional. Phase 7 owns Rembr branding and the final design system.

## Implemented work

- Root workspace, environment example, Git ignore rules, README and CI workflow.
- User registration, sign-in, session lookup/logout, safe errors, request IDs, rate limits, security headers and origin checks.
- SQLite migration for users, sessions, saved items, processing jobs, and extracted artifacts; composite foreign keys prevent a job/artifact owner from differing from its item owner.
- URL capture API, account-scoped duplicate detection, list/search/detail and delete.
- Separate worker process with claim lease, bounded retry, deterministic extraction, owner/lease-fenced writes, and deletion-race protection.
- Responsive login/account/library UI with progress, status, empty/error states, search, source links and delete confirmation.
- Twelve automated tests cover unauthenticated access, hostile origins, hashed session storage/expiry/logout, two-user isolation, durable capture acceptance, duplicate canonical URLs, worker extraction/deletion races, private URL blocking, redirect revalidation, bounded response handling, retry/expired-lease recovery, and script removal.

## Evidence recorded so far

| Check | Result | Notes |
|---|---|---|
| Clean install (`npm ci`) | Passed | Clean workspace install; 0 vulnerabilities reported. npm emitted upstream package deprecation notices. |
| `npm run check` | Passed | Same command used by the repository CI workflow: API/web typecheck and lint, all 12 tests, and both production builds. |
| Local DB migrations | Passed | In-memory tests and persistent local SQLite API/worker smoke. |
| Live API + worker + browser UI | Passed | Browser account creation/sign-in/out, URL submission, queued status, ready content, refresh persistence, and unsafe URL feedback were exercised. Worker was paused to hold a queued job, then restarted; the item recovered to ready. |
| Visual states and responsive layout | Passed | Screenshot review at 390px and 320px covered queued/loading, ready, and private-URL failure. At 320px a 15px horizontal overflow was found, fixed by removing the forced body minimum width, and rechecked: `scrollWidth === clientWidth === 305`. Screenshot captures are present in the task run; no separate image files were saved in the repository. |
| Cross-user persistence and deletion race | Passed in automated tests | Uses two synthetic users and a controlled in-flight worker; cross-user read/delete are denied, and deleted content cannot be recreated. |
| Live public-site extraction | Passed | Authenticated browser UI submitted `https://example.com/`; worker persisted `ready` with title “Example Domain” and readable text. Synthetic accounts and rows were removed after smoke runs. |
| GitHub CI | Not verified | The initial gate record was written before an `origin` remote was configured. The remote is now configured and receives pushes; this review did not inspect the GitHub Actions result. |

## Follow-up verification — 2026-10-28

After the marketing routes and typography changes, `npm run check` passed again: API/web typecheck and lint, 12 API tests, API build, and web production build. This confirms the Phase 1 regression suite remains green in the current checkout. The Phase 1 browser walkthrough and local API/worker acceptance evidence above remains the recorded end-to-end smoke evidence.

## Defects found and fixed during Phase 1

- The initial `body { min-width: 320px }` caused horizontal overflow when a 320px viewport's vertical scrollbar reduced the usable client width to 305px. Removed the forced minimum and rechecked both the rendered page and document scroll width at 320px.
- Node 24's HTTP request lookup callback uses a different callback shape when `options.all` is true. The pinned-address fetch now handles both forms; live public capture completed successfully afterward.
- Remote servers that ignored `Accept-Encoding: identity` could return compressed bytes that would be decoded as text. The fetch now rejects non-identity encodings explicitly, with a regression test.

## Residual limits (not Phase 1 blockers)

- Hosted GitHub Actions has not run because the local repository has no remote. The exact workflow commands passed from a clean `npm ci` installation.
- Production Postgres/Supabase, hosted RLS, deployment egress restrictions, and production deployment remain later-phase decisions/checks; this phase proves the local SQLite adapter only.
- Screenshot evidence was reviewed through the active browser session but is not committed as image files. Repeat visual captures when preparing the reviewer/demo artifact.

## Related documents

- [Phase roadmap](phase-gated-roadmap.md)
- [Feature acceptance matrix](feature-and-acceptance-matrix.md)
- [Screen/workflow phase matrix](screen-workflow-phase-matrix.md)
- [System design and boundaries](../architecture/system-design-and-boundaries.md)
- [Final review checklist](../quality/final-review-checklist.md)
