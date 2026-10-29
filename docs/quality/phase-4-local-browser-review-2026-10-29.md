# Phase 4 local browser and accessibility review

**Status:** Partial local evidence; not a Phase 4 gate pass.

## Environment

- Checkout: `feat/phase-4-search-knowledge-ai` at `80c763e`.
- Local Vite app on `127.0.0.1:5173`; API used an in-memory PGlite database built from the current migrations. The fixture included two synthetic owner saves with typed brand, tool, person, and repository labels.
- Edge headless `156.0.4314.50`. No hosted database, real account data, model request, or external page fetch was used.

## Coverage and results

- `/app/graph` inspected at 390×844 and 1440×900. `document.documentElement.scrollWidth` matched the viewport at both sizes. At 390px the graph map remains internally scrollable; the grouped concept/item list remains the complete text interaction surface.
- `/app/settings/preferences` inspected at 390×844. Page width matched the viewport. The v5 disclosure text and both off-by-default media-analysis and grounded-AI switches were visible with accessible names.
- Keyboard Tab review on Connections reached the top navigation, native More disclosure, sign-out and export buttons, the named concept search, and saved-item links. Links, buttons, and disclosure showed visible focus indicators. The accessibility tree exposed the concept filter as a `searchbox` named “Filter concepts.”
- axe-core 4.14.0 ran WCAG 2.0/2.1 A and AA tags. Settings at 390px: 24 passed rules, zero violations. Connections at 1440px: 23 passed rules, zero violations.
- axe marked color-contrast checks incomplete for a decorative arrow, the onboarding button’s pseudo-element background, and SVG graph labels that overlap other graphic elements. These are indeterminate checks, not passes. Sampled Graph text and controls measured ratios from 6.64:1 to 17.97:1; Settings contrast was not exhaustively measured.

## Remaining review

- No screen reader session was run. Settings switches were checked for accessible names but were not toggled by keyboard in the first review.
- Reduced-motion behavior, import/note-edit/tag/settings-profile screens, production-size graph/export behavior, hosted migrations, and real provider behavior remain unreviewed here.
- The graph fixture’s “Waiting to process” statuses are expected because no worker was running; they are synthetic local state.

## Follow-up route and keyboard review

- Follow-up source: `feat/phase-4-search-knowledge-ai` after `b92d3e3`, with the graph scroll-focus fix described below. Edge headless `156.0.4314.50`; axe-core `4.14.0` was installed from the local npm cache. The existing Vite server was reused; a temporary API used current migrations and an in-memory PGlite database.
- Synthetic fixture: one ready page, one failed page, one note, a tag, a manual collection, and a due reminder under one synthetic account. Provider availability was disabled. No hosted database, live model, or external page fetch was used.
- At 390×844 and 1440×900, reviewed `/app` (Library), `/app/collections`, `/app/smart-collections`, `/app/checkup`, `/app/graph`, a ready page detail, and a failed page detail. Every route rendered without an alert. Document scroll width did not exceed the viewport; on desktop the browser's reserved scrollbar reduced the document width below `innerWidth`.
- On mobile, Tab traversal reached the visible links, actions, filters, and item controls on each reviewed route with visible focus at each checked focusable stop. On Connections it now reaches a named “Scrollable graph map” region; browser arrow keys can scroll that focused region. No link probe, export, retry, AI request, or data-changing action was triggered.
- axe-core scanned WCAG 2.0/2.1 A and AA tags at both viewports. Results after the graph fix:

| Route | Passed rules, 390px / 1440px | Violations, 390px / 1440px | Incomplete contrast nodes, 390px / 1440px |
| --- | ---: | ---: | ---: |
| Library | 23 / 23 | 0 / 0 | 5 / 5 |
| Collections | 22 / 22 | 0 / 0 | 2 / 2 |
| Smart Collections | 22 / 22 | 0 / 0 | 4 / 4 |
| Checkup | 23 / 23 | 0 / 0 | 1 / 1 |
| Connections | 27 / 26 | 0 / 0 | 6 / 6 |
| Ready item detail | 22 / 22 | 0 / 0 | 1 / 1 |
| Failed item detail | 21 / 21 | 0 / 0 | 1 / 1 |

- The first mobile Connections scan found axe rule `scrollable-region-focusable` on the graph map's horizontal scroller. The scroller now has `role="region"`, the accessible name “Scrollable graph map”, `tabIndex={0}`, and a visible `:focus-visible` outline. A focused rerun at both viewports found zero violations. Contrast nodes remain indeterminate on decorative arrows, pseudo-element button backgrounds, status markers, and SVG text; these are not reported as passes.
- The temporary API, browser profile, screenshots, axe install, and review scripts were removed after inspection. The user-owned Vite server on port 5173 was left running.
