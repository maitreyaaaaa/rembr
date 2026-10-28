# Phase 1 — Core foundation and vertical slice

**Status:** In progress. This record tracks implementation and evidence; it does not mark the Phase 1 gate as passed.

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
- Nine automated tests cover unauthenticated access, hostile origins, session cookie/logout behavior, two-user isolation, duplicate canonical URLs, worker extraction, deletion during processing, private URL blocking, redirect revalidation, and script removal.

## Evidence recorded so far

| Check | Result | Notes |
|---|---|---|
| `npm install` | Passed | 0 reported vulnerabilities. |
| `npm run typecheck` | Passed | API and web. |
| `npm run lint` | Passed | API and web. |
| `npm test` | Passed | 9 tests. |
| `npm run build` | Passed | API TypeScript and web production build. |
| Local DB migrations | Passed in tests | In-memory migration path; persistent file path still needs runtime smoke. |
| Live API + worker + browser UI | Partial | Dev API and UI started; account creation and capture acceptance were exercised in the browser. The login screen was visually reviewed at the desktop viewport. Browser interaction did not advance the page during this final review, so loading/success/failure captures and narrow viewport review remain open. |
| Cross-user persistence and deletion race | Passed in automated tests | Uses two synthetic users and a controlled in-flight worker. |
| Live public-site extraction | Passed | Authenticated local API submitted `https://example.com/`; worker persisted `ready` with title “Example Domain” and 156 characters of extracted text. Temporary synthetic test account was removed after the smoke. |
| GitHub CI | Not run | Workflow added; first hosted run requires a push/PR. |

## Open Phase 1 work

1. Complete a visual browser review of loading, success, failure, and narrow viewport states; the browser automation channel timed out on inspection.
2. Expand the automated security and reliability matrix for session expiry, unsupported/oversized responses, and worker retry/expired-lease recovery.
3. Verify a private-address rejection and redirect pivot through the live worker path (the current private-address and redirect checks are controlled automated tests).
4. Repeat the full check after addressing any newly found issues.
5. Evaluate all Phase 1 gate criteria before starting Phase 2; this record does not mark the gate as passed.

## Related documents

- [Phase roadmap](phase-gated-roadmap.md)
- [Feature acceptance matrix](feature-and-acceptance-matrix.md)
- [Screen/workflow phase matrix](screen-workflow-phase-matrix.md)
- [System design and boundaries](../architecture/system-design-and-boundaries.md)
- [Final review checklist](../quality/final-review-checklist.md)
