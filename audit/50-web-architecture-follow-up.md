# Web architecture follow-up

## Scope

Reviewed the React app entry and route composition, the authentication/profile flow, protected app shell, library and graph pages, landing page composition, and browser storage access. Checked large web modules and their imports to separate mixed responsibilities from large but focused screens. This was a focused architecture and correctness pass, not a line-by-line audit of every web module or a browser/device QA run.

## Findings and fixes

- **WEB-ARCH-001 — App entry mixed unrelated responsibilities.** `App.tsx` contained route declarations, authentication UI, session loading, the protected shell and Terms gate, quick add, navigation, breadcrumbs, and profile setup. Moved those into focused app/auth modules. `App.tsx` now only composes routes and global tooltips.
- **WEB-ARCH-002 — Library module combined separate pages.** Moved `KnowledgeGraphPage` out of `features/library/pages.tsx` into `features/knowledge/KnowledgeGraphPage.tsx`.
- **WEB-ROUTE-001 — Existing accounts could reach profile setup before accepting updated Terms.** Login could redirect incomplete-profile accounts directly to setup, and setup did not enforce the Terms version. Login now sends those accounts through the protected route first, and setup redirects outdated sessions to that Terms gate.
- **WEB-ROUTE-002 — Auth screen could show stale login/register mode.** It read `?mode=` only on mount. It now updates mode when the URL's `mode` value changes.
- **WEB-STORAGE-001 — Landing could fail when browser storage is blocked.** Local-storage reads and writes are now guarded so private or restricted browser contexts still render the page.

The landing page was also split into header, hero, and content-section modules. Other large files reviewed are individually scoped screens or specialized visual components; line count alone was not treated as a defect.

## Verification

- Full `rtk npm run check`: typecheck, lint, API tests, and API/web production builds.
- Browser-level route and storage behavior was not exercised because this workspace has no web interaction test harness. Production visual and device behavior remain unverified by this pass.
