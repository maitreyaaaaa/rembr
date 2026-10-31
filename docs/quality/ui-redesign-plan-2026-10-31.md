# Rembr UI redesign plan — 2026-10-31

## Reference and boundaries

- Reference resolved from the available source and Notion pages: Ice Scraper / IScraper (`D:\IScraper-main\IScraper-main`, `https://iscraper.vercel.app`). Keep the reference checkout read-only.
- Preserve Rembr's name and logo. Reuse the reference's visual language and information architecture; write Rembr copy and avoid unsupported feature, pricing, privacy, or performance claims.
- Frontend-only scope. Preserve current Rembr API behavior. Mark source-only workflows/admin behavior as unavailable or planned unless a matching Rembr API already exists.

## Screens to redesign or add

### Shared system

- Responsive navigation/shells, buttons, fields, tabs, cards, banners, dialogs, toasts, focus/keyboard patterns, reduced-motion behavior.
- Shared session checks, route transitions, loading skeletons, empty states, inline errors/retry, success feedback, not-found states, and destructive confirmations.

### Public and account pages

- Existing: `/`, `/features`, `/about`, `/contact`, `/login`, profile setup.
- Add reference-shaped Rembr pages: `/how-to-use`, `/help`, `/pricing`, `/terms`, `/privacy`, `/security`, `/data-deletion`, `/cookies`.
- How-to content covers current Rembr link saving and supported Instagram/Pinterest export paths, plus the tour where available.

### Signed-in application

- Existing routes: library/search, saved item detail/edit, add/import, import history/detail/progress, notes, collections/detail, Smart Collections/detail, tags, knowledge graph, library checkup, profile/preferences settings.
- Preserve all API-backed search modes, consent/provider notices, pagination, item/job actions, import cancellation/retry, summary/AI states, profile/avatar upload, and preferences.
- Reference-only Workflows/admin surfaces require separate product/API support; no fake execution or external actions in this visual pass.

## Implementation sequence

1. Establish reference-aligned tokens and shared app/marketing primitives while preserving Rembr identity.
2. Rebuild public and account page compositions; add missing public routes with accurate Rembr-specific content.
3. Rework the authenticated shell and existing routes, including all state treatments, without changing API contracts.
4. Review accessibility, reduced motion, responsive layouts, and all routes; run the repository's documented checks.

## Reference observations

- Black canvas, white type, Space Grotesk, acid-lime primary action (`#A5FF18` brand-kit value; runtime uses perceptually similar OKLCH), orange accent (`#FF6900`), faint grid and restrained green radial glow.
- Marketing uses a large editorial headline, simple split CTA hierarchy, content-format ticker, and outcome-led feature sections.
- How-to uses selectable guide cards and image-led step walkthroughs; help groups support by task; pricing communicates the current pilot state; legal pages are separate routes.
- The Notion landing interaction specification is explicitly a draft; treat its motion direction as optional. Runtime prefers keyboard access, readable states, and reduced motion.

## Delivery status

- Implemented the frontend redesign across shared tokens, responsive navigation, marketing, account shells, existing app routes, error/loading/empty/feedback styling, and added how-to, help, pricing, legal, and source-only workflow states.
- Kept the IScraper reference checkout read-only and did not change backend/API code. Preserved Rembr naming and logo; guide screenshots were copied from reference assets and cropped to exclude its logo.
- Validation on 2026-10-31: `npm run typecheck --workspace @rembr/web`, `npm run lint --workspace @rembr/web`, `npm run build --workspace @rembr/web`, and `git diff --check` passed. Earlier full `npm run check` also passed (129 API tests and builds).
- Build remains successful but reports a 1.66 MB minified `PasswordStrengthField` chunk (zxcvbn language dictionary); public pages and guide assets are split into small chunks.
- Pricing/legal pages are preparation placeholders pending approved policy and billing details. Workflows is clearly unavailable; no Rembr admin surface was added because this repo has no corresponding auth/API contract. Live signed-in browser validation remains limited by unavailable account credentials.
