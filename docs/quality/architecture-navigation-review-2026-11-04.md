# Architecture and navigation review — 2026-11-04

## Scope

Reviewed the Rembr web/API/worker boundaries, route declarations, marketing and public support links, app shell brand navigation, authentication return-path handling, URL-fetch security boundary, job routes, deployment branch configuration, and the existing architecture and quality reviews. The source and tests describe local behavior; this review does not claim hosted or production verification.

## Architecture map

- `apps/web` is a React/Vite single-page app. React Router serves marketing pages, authentication, and the protected `/app/*` workspace from one web origin.
- `apps/api` is the authenticated Express API and modular application layer. It owns request validation, authorization, service workflows, and persistence access.
- Supabase Postgres and private Supabase Storage persist application data and assets. The browser calls the API; server credentials stay out of the client.
- A separate Node worker advances durable capture/import/media/enrichment jobs. It shares API domain services and database contracts rather than duplicating workflow rules.
- The Chromium extension is another client of the API, with its own permission and credential boundary.
- Render configuration describes a web service and worker. The checked-out branch is `codex/production-graph-d3-2026-11-03`, while `render.yaml` names `master`; this local checkout alone does not establish which revision is live.

## Findings

| Priority | Finding | Evidence and outcome |
| --- | --- | --- |
| P1 | The authenticated app wordmark navigated to `/`, which is the marketing homepage. | `apps/web/src/App.tsx` app-shell brand links now return to `/app`. |
| P1 | Marketing and help/guide links into `/app` replaced the marketing page, including app settings and import destinations. | Marketing-site, help, guide, and callback-based app-entry actions now open a new tab with `noopener,noreferrer`; the original marketing page remains open. |
| P2 | Hosted end-to-end behavior is not established by local typecheck, lint, unit tests, or builds. | Treat local verification separately from hosted checks; no deployment or external state was changed in this review. |

## Checks of related boundaries

- Auth return destinations are sanitized to app paths (or the WorkOS consent path), limiting open redirects.
- URL fetching validates public destinations, validates redirects, pins the selected address, and applies response/time bounds in `apps/api/src/items/safe-fetch.ts`.
- Job mutations use POST routes in `apps/api/src/jobs/routes.ts`.
- No additional confirmed high-impact backend bug was found during this focused architecture review. This is not a claim that every source line or every hosted configuration was exhaustively verified.

## Verification

`npm run check` passed after the navigation fixes: typecheck, lint, all 145 API tests, and API/web production builds. Vite reports the existing large chunks (908 kB main and 1,663 kB password-strength bundle); splitting them remains performance work. `git diff --check` passed. Browser behavior across all supported browsers and the currently deployed revision still requires hosted/browser evidence.
