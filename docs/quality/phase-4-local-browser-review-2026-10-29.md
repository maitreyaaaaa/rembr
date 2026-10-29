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

- No screen reader session was run. Settings switches were checked for accessible names but were not toggled by keyboard in this review.
- Other Phase 4 screens and states, reduced-motion behavior, full keyboard journeys, production-size graph/export behavior, hosted migrations, and real provider behavior remain unreviewed here.
- The graph fixture’s “Waiting to process” statuses are expected because no worker was running; they are synthetic local state.
