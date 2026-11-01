# IScraper UI code port plan — 2026-11-01

## Goal

Port IScraper's actual frontend component and style implementation into Rembr so the public site, account pages, signed-in shell, and interaction states share the same typography, layout rules, transitions, loading and error treatment. Preserve Rembr's name/logo and current Rembr API/auth contracts. Do not alter backend code or edit the reference checkout.

## Source and constraints

- Reference source: `D:\IScraper-main\IScraper-main\apps\ui\src` (React 19, JSX, Tailwind CSS 4, GSAP, Lucide). The reference worktree already contains unrelated uncommitted documentation and lockfile changes; keep it read-only.
- Target: `D:\meta hacks\Rembr\apps\web\src` (React 19, strict TypeScript, React Router, custom CSS, Rembr API routes).
- Port source-owned UI files/assets into Rembr and adapt only the seams that require Rembr-specific routes, copy, auth, and API calls. No Supabase client, source API calls, source brand name, or source logo should ship in Rembr.

## Screen inventory

- Public: marketing landing, feature/about/contact pages, help center, how-to guides, pricing, legal pages, 404.
- Auth/setup: sign-in/register, account setup.
- Product: library/search, save/upload/import, item details and editing, notes, collections, smart collections, tags, graph, checkup, settings, workflows state.
- Shared states: app-shell loading, route loading, data loading/skeletons, empty results, API errors/retry, import progress and failure, success feedback, session required, not-found, mobile navigation and drawers.

## Implementation plan

1. Port the reference design runtime and exact foundation tokens, font setup, Tailwind utilities, responsive rules, and motion primitives into a copied Rembr-owned UI foundation; remove conflicting approximation overrides as each target screen adopts the foundation.
2. Port the actual public-page component structure and animations (landing, features, about, contact, help, how-to, pricing, and legal), replacing reference claims/brand strings with accurate Rembr content while keeping the layout and motion implementation.
3. Port the reference app shell, dashboard navigation, page surfaces, dialogs, loading/skeleton, error, empty, progress, and responsive interaction components; connect each surface to the existing Rembr route components/API calls instead of source integrations.
4. Review every current route and state, check keyboard/reduced motion/mobile behavior, run web typecheck/lint/build and full repository checks, and inspect the production build locally. Keep the reference checkout unchanged.

## Feasibility

- Architecture fit: 2/5 (JSX/Tailwind reference vs. strict TS/custom-CSS target; map the components at UI boundaries).
- Reuse: 4/5 (same React major and compatible GSAP/Lucide; much of the UI is directly portable).
- Performance: 3/5 (code-split page families and defer heavy motion/illustration modules).
- Complexity load: 1/5; maintenance cost: 2/5.
- Overall: 6/15 (risky/complex) because dashboard behavior uses source-specific auth/API functions; proceed as a staged frontend-only port and keep Rembr API contracts authoritative.

## Validation notes

- The reference worktree is dirty before this task and is read-only.
- The prior redesign is deployed at `37caee1`; this request is a new source-code port. Do not deploy it unless the user asks.

## Current port status

- Copied the source Tailwind 4 token/theme layer, responsive stylesheet, source LoadingStates and Common components, actual animated Landing page, and source How-to, Help, Pricing, and Legal page components into `apps/web/src/ported/`.
- Replaced the signed-in Rembr icon-only header with the source collapsible desktop rail and five-slot mobile navigation, mapped to existing Rembr routes. Kept Rembr cookie-session and backend API contracts.
- Connected the source application shell skeleton and source error banner to Rembr route states; the library initial load now uses source skeleton cards.
- Ported the LibraryTab card presentation into `apps/web/src/ported/LibraryCards.tsx`: source-style pin, gallery, and list layouts, status chips, search feedback controls, media previews, and navigation back to the current filtered library state. Cards use Rembr `SavedItem` data and existing callbacks.
- Styled the Rembr library query/filter controls to use the source black-glass composer and grid language. Existing Rembr keyword/semantic/image search, consent disclosures, and grounded-library-answer behaviors remain connected.
- Ported source-style item details into `RembrDetailDrawer.tsx`, wired to Rembr item, AI analysis, summary, tag, and job endpoints; preserves keyboard dismissal/focus trap, reduced-motion behavior, safe original-page links, and return routes.
- Ported the save/import surface into `RembrAddFlow.tsx`; the caller retains current URL capture, idempotent chunked upload, cancellation, file limits, parser support, and navigation to import history or guides.
- Ported source-style graph and checkup surfaces into `RembrKnowledgeGraphPanel.tsx` and `RembrCheckupPanel.tsx`; the existing Rembr graph/export, link-check, and reminder APIs remain authoritative.
- Kept Rembr-specific note, collection, tag, smart-collection, import-history, preferences, and account flows on their existing routes and APIs; the shared source token layer gives them consistent typography, color, motion-reduction, surface, focus, and loading treatment. Workflows remain explicitly planned because Rembr has no corresponding service/API.
- Browser review on the local public route found a token-ordering conflict with Rembr's Arc foundation. Reordering the CSS imports restored the source white-on-black foreground. Authenticated product route visual review remains unavailable without an account session; no account was created.
- Verification: local sign-in and marketing routes were visually reviewed at desktop/mobile sizes; the production landing was visually reviewed after deploy. Authenticated product routes were not browser-reviewed because no session was available; no account was created. Typecheck, lint, build, Render deploy, live landing, and `/api/health` passed. Workflows/admin-only source routes remain unsupported in Rembr and are not presented as working features.
- Delivery: commit `71abed5735da52fa5fc304dab08de10003625048` is pushed to `master`. Render workspace Rembr reports both `rembr-web` and `rembr-worker` live on this commit; `https://rembr-web.onrender.com/api/health` returned `{"status":"ok"}`. The web build retains the existing `PasswordStrengthField` chunk warning above 500 kB.
