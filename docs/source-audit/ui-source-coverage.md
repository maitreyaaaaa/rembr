# IScraper UI Source Coverage Ledger

**Purpose.** This ledger records the tracked `apps/ui` files used for the Rembr rebuild specification in [`../screens/ui-surface-and-screen-specifications.md`](../screens/ui-surface-and-screen-specifications.md). It distinguishes behavior-bearing implementation from packaging, styling, and static assets. It is an audit map, not a claim that every byte of every binary asset was semantically inspected.

**Source checkout:** `D:\IScraper-main\IScraper-main`  
**Scope:** all **116 tracked files** under `apps/ui/**` at the inspected checkout (`git ls-files apps/ui`); ignored/untracked `node_modules`, `dist`, and workspace output are excluded.  
**Method:** route and component tracing, targeted reads of page/dashboard/API/auth/analytics code, searches for state transitions, API calls and accessibility/responsive signals, package/test inventory, and tracked-file inventory. Existing dirty files in the source checkout were left untouched.

## Review depth

- **D — behavior traced:** source was read and its principal responsibilities, state transitions, navigation/API contracts, and known branches are represented in the screen specification. Line references there point into the current checkout and must be refreshed if the source changes.
- **S — structural review:** exports, call sites, styles, selectors, or relevant references were inspected to understand role and relationship; not every function/line was individually explained.
- **I — inventory only:** tracked path/type and its relationship to UI were recorded; behavior was not inferred from the file name.
- **A — static asset:** treated as image/vector/font-like content, not application logic. Filename/use was inventoried; binary pixels were not audited as source behavior.
- **G — generated/vendor metadata:** lock/config/generated support file; relevant only to build/runtime contract, not product behavior.

## Behavior-bearing implementation ledger

| Tracked path | Depth | Responsibility and coverage note |
|---|---:|---|
| `src/App.jsx` | D | Browser-history router, route dispatch, page composition, global route state. |
| `src/AppShared.jsx` | D | Shared UI, tab/route constants, navigation helpers, import parsing/normalization, extension/auth/profile shared logic. Broad file; screen spec points to route and key helper ranges. |
| `src/api.js` | D | UI API client, auth headers, request/correlation IDs, errors and telemetry hooks; endpoint usage mapped at surface level. |
| `src/main.jsx` | D | React StrictMode root, global stylesheets, PostHog side-effect import, and Vercel Analytics mount. |
| `src/supabaseClient.js` | D | Supabase client configuration and auth/session integration boundary. |
| `src/posthog.js` | D | Analytics initialization and property sanitization/redaction behavior. |
| `src/pages/AdminSupportPage.jsx` | D | Admin login, user search/detail/support metadata and activity timeline surface. |
| `src/pages/HelpCenterPage.jsx` | D | Support navigation, topic form and mailto behavior. |
| `src/pages/HowToUsePage.jsx` | D | Instagram/Pinterest guides, guide selection, images, tour entry and motion handling. |
| `src/pages/Landing.jsx` | D | Marketing landing page sections, CTAs, animation and responsive composition. |
| `src/pages/LegalPage.jsx` | D | Terms/privacy/security/data-deletion/cookies route content selection and legal navigation. |
| `src/pages/LoginPage.jsx` | D | Google/OTP auth, profile completion/edit, validation and local fallback behavior. |
| `src/pages/PricingPage.jsx` | D | Static pricing/pilot claims and CTA navigation; no checkout observed. |
| `src/dashboard/AccountSettingsModal.jsx` | D | Account/privacy/security/requests tabs, export/delete flows, profile/tokens/logout; page and modal modes. |
| `src/dashboard/AutomationWorkspace.jsx` | D | Automation chat, saved automations, schedules, run history and approval/action states. |
| `src/dashboard/Dashboard.jsx` | D | Workspace shell, shared data/state, route/tab composition, navigation, responsive shell, data loaders and cross-tab orchestration. |
| `src/dashboard/DetailDrawer.jsx` | D | Saved-item detail, source metadata, generated analysis, verification suppression, archive/retry/reminder/review actions. |
| `src/dashboard/Filters.jsx` | D | Search/filter controls and state handoff; exact option semantics should be validated against API/data contract during rebuild. |
| `src/dashboard/GraphTab.jsx` | D | Relationship graph construction, limits, layout and graph interaction surface. |
| `src/dashboard/GuidedWorkspaceTour.jsx` | D | First-run/explicit tour lifecycle, persisted seen state, target-tab preparation, step navigation. |
| `src/dashboard/LibraryCheckupTab.jsx` | D | Library care/checkup state, recommendations and reminder interactions. |
| `src/dashboard/LibraryTab.jsx` | D | Library list/grid, search modes, pagination, filters, layouts, AI/search result actions and item selection. |
| `src/dashboard/QuickAddModal.jsx` | D | Quick-add entry modes and transfer into full upload flow. |
| `src/dashboard/UploadTab.jsx` | D | Link/note/file import, file classification/validation, progress and review entry. |
| `src/dashboard/WorkflowsTab.jsx` | D | Workflow configuration and explicit approval/dispatch controls. |
| `src/components/Antigravity.jsx` | D | Decorative Three.js instanced particle interaction, seeded initial positions, pointer attraction, idle motion, per-frame geometry updates. |
| `src/components/Common.jsx` | D | Shared feedback select, auth-required/profile-required panels and notice/error banner. |
| `src/components/FeaturePillsSection.jsx` | D | Landing feature popovers, Lottie, desktop magnetic hover, scroll reveal and reduced-motion behavior. |
| `src/components/GradualBlur.jsx` | D | Layered CSS backdrop blur math and parent/page positioning. |
| `src/components/LandingHero.jsx` | D | Landing hero animation, CTA callbacks, lazy Antigravity effect and blur. |
| `src/components/LoadingStates.jsx` | D | Reusable progress/skeleton/deferred/app-shell loading treatments and timer cleanup. |
| `src/components/PixelSnow.jsx` | D | Decorative Three.js snow textures, buffer setup, visibility pause, resize, frame loop and resource disposal. |
| `src/components/ShowcaseSection.jsx` | D | Marketing showcase selection/preview, focus/hover behavior and scroll/reduced-motion animation. |
| `src/components/SmartCollectionsView.jsx` | D | Smart collection browsing/selection/rendering used within workspace. |
| `src/components/SystemMapSection.jsx` | D | Landing system-map stage selection, detail content and scroll/reduced-motion animation. |
| `src/components/TargetCursor.jsx` | D | Desktop-only cursor lifecycle, target detection, corner tracking, pointer/scroll state, GSAP timelines and cleanup. |
| `src/components/VirtualLibraryGrid.jsx` | D | Responsive column/card sizing, ResizeObserver, TanStack virtualization, near-end paging trigger and loading skeleton. |
| `src/components/featurePulseLottie.js` | D | Full animation-data object: 160×160, 60fps/120-frame pulse with ring/core/spark layers. |
| `src/dashboard/guided-workspace-tour.css` | S | Tour overlay, tooltip/pointer, focus, viewport and reduced-motion styling. |
| `src/components/PixelSnow.css` | S | Decorative visual styling. |
| `src/components/TargetCursor.css` | S | Pointer effect styling. |

## Styling, entry, and build support

| Tracked path | Depth | Responsibility and coverage note |
|---|---:|---|
| `src/App.css` | S | App-level visual rules; inspected for global component/layout contribution. |
| `src/index.css` | S | Base styles/tokens and global reset contribution. |
| `src/mobile.css` | D | Mobile-specific shell, safe-area, navigation, sheets, overlay and reduced-motion behavior. |
| `src/styles.css` | S | Shared typography/theme/utility layer. |
| `index.html` | S | Browser document shell, metadata and mount root. |
| `package.json` | D | UI scripts, framework/dependency/build metadata; no dedicated UI test script identified. |
| `vite.config.js` | S | Vite build/dev configuration. |
| `eslint.config.js` | S | Lint configuration. |
| `.env.example` | S | Documented client environment-variable names; values are placeholders. |
| `.gitignore` | I | UI package ignore rules. |
| `README.md` | S | UI package setup/documentation; treated as project instructions, not runtime behavior. |
| `package-lock.json` | G | Dependency lock; inventory only, not dependency-by-dependency security audit. |

## Static public and source assets

All entries below are **A** unless otherwise marked. They are accounted for as UI resources and are not logic-bearing code. Their actual rendered appearance, source licensing, dimensions, contrast, and content accuracy require visual/content review when Rembr finalizes its design.

| Tracked paths | Depth | Use recorded |
|---|---:|---|
| `src/assets/hero.png` | A | Bundled source asset; exact route/use should be confirmed against imports. |
| `src/assets/react.svg`, `src/assets/vite.svg` | A | Starter/vendor logos; inventory only. |
| `public/favicon.png`, `public/favicon.svg` | A | Browser/app icon. |
| `public/logo.png`, `public/logo.original-bg.png` | A | Product logo variants. |
| `public/hero/lose-circle.png` | A | Landing hero visual resource. |
| `public/icons.svg` | A | SVG icon collection. |
| `public/platforms/facebook.svg`, `public/platforms/instagram.svg`, `public/platforms/linkedin.svg`, `public/platforms/pinterest.svg`, `public/platforms/reddit.svg`, `public/platforms/substack.svg`, `public/platforms/tiktok.svg`, `public/platforms/x.svg`, `public/platforms/youtube.svg` | A | Platform/source icons referenced by product/public UI. |
| `public/how-to/1000347058.jpg`, `public/how-to/1000347059.jpg`, `public/how-to/1000347060.jpg`, `public/how-to/1000347061.jpg`, `public/how-to/1000347062.jpg`, `public/how-to/1000347063.jpg`, `public/how-to/1000347064.jpg`, `public/how-to/1000347065.jpg` | A | Earlier Instagram guide screenshots; opaque names retained as source names. |
| `public/how-to/instagram-09-processing.jpg`, `public/how-to/instagram-10-email-progress.png`, `public/how-to/instagram-11-email-ready.png`, `public/how-to/instagram-12-email-download-link.png`, `public/how-to/instagram-13-available-download.jpg`, `public/how-to/instagram-14-zip-saved.png`, `public/how-to/instagram-15-add-saves.png`, `public/how-to/instagram-16-upload-files.png` | A | Later Instagram export/download/import guide screenshots. |
| `public/how-to/pinterest-01.png` through `public/how-to/pinterest-14.png` | A | Pinterest guide screenshots, numbered sequence. |
| `public/how-to/openrouter-01.png` through `public/how-to/openrouter-12.png` | A | OpenRouter setup screenshots; presence recorded, exact display/use should be confirmed against current component references. |
| `public/manifest.webmanifest` | S | PWA/browser install metadata. |
| `public/robots.txt`, `public/sitemap.xml` | S | Crawler/indexing metadata and public route declarations. |

## Tests and verification coverage

- No `apps/ui` test/spec files or UI-specific test script were identified in the tracked inventory and package metadata reviewed. This means source inspection documents current implementation, not behavioral proof.
- Existing project checks are not treated as evidence of rendered correctness. This audit did not run app tests, browser acceptance, screenshots, accessibility scans, or live backend flows.
- Screen-spec recommendations for viewport, keyboard/focus, reduced-motion, loading/error/empty/success and connected-service flows are Rembr verification requirements/proposals, not claims of current passing behavior.
- Historical conversation notes mention prior viewport checks, but those are not current-turn evidence and are deliberately excluded from this ledger's verification claims.

## Coverage gaps and questions for parent review

1. Source reread is complete for all tracked JavaScript/JSX implementation files in this UI scope. It is still a static source audit: no runtime acceptance, visual pixel inspection, provider auth validation, or backend implementation proof was performed.
2. API behavior is documented at the UI boundary. Backend route handlers, database persistence, authorization, retries and provider side effects need correlation against backend source and API contract docs before implementation.
3. Product release truth needs owner confirmation for the extension discrepancy: implementation/connection controls coexist with help/legal/how-to text describing the extension as unavailable or forthcoming.
4. Some design/accessibility judgments (graph alternative, virtualization parity, admin credential storage) are explicitly proposals in the screen specification, not verified defects.
5. The tracked UI asset ledger inventories names and stated roles, but does not establish image licensing, source provenance, visual fidelity, or whether screenshots remain current.

## Rebuild acceptance map

Before a UI feature is called rebuilt, Rembr should link a screen-level requirement to (1) its route and navigation entry, (2) source evidence or approved decision, (3) component and API contract, (4) empty/loading/error/success state, (5) mobile/desktop and keyboard/accessibility acceptance, and (6) deterministic or live verification evidence. Any deliberate divergence from IScraper must be marked as a Rembr decision or proposal, not attributed to observed current behavior.

## Line-by-line follow-up status (2026-10-27)

This section supersedes any broad interpretation of **D** above. It distinguishes files whose full current source was reread in numbered ranges during the follow-up from files whose earlier review was at screen/function-outline level only. “Full source reread” means the complete text range was inspected; it does not mean runtime behavior was executed. Render-only JSX within the same file is included in the source read but is summarized by the screen specification rather than described token-by-token.

### Full source reread completed

| File | Inspected ranges | Function/logic blocks accounted for |
|---|---|---|
| `src/App.jsx` | 1-95 | `App` route initialization and navigation (11-25), tour handoff (27-31), scroll/title effects (33-41), history/hash listener and pending state capture (43-60), route-to-page dispatch/props (62-95). |
| `src/main.jsx` | 1-14 | React root and StrictMode mount; stylesheet and analytics imports (1-8), root render tree (9-14). |
| `src/AppShared.jsx` | 1-1527 | Imports/constants and app contracts (1-263); import candidate/validation/ZIP extraction/health/storage-upload path (264-448); status normalization, item mapping/classification/filter/sort and image handling (450-760); formatting, privacy state copy/data usage, download/scroll/tab URL helpers (761-914); rotating hero behavior (916-996); route/hash/query migration, deep-link save/item/layout and auth callback cleanup (998-1144); Google/OTP auth, profile/onboarding helpers, sign-in dedupe, pending link and extension-connect persistence/message exchange (1146-1278); complete public export surface (1280-1527). |
| `src/api.js` | 1-736 | `ApiError`, token state, request ID/action sanitization, request/error/event behavior (6-68); item, smart collection and library-care/reminder calls (70-152); privacy/account/admin/export API calls (154-269); indexing/feedback/item/review/profile/onboarding/graph/credits/token endpoints (271-433); import/upload/chunk/index/link/note/enrichment/search/workflow endpoints (435-620); automations, run history, persisted chat and Gmail connection endpoints (622-736). |
| `src/dashboard/Dashboard.jsx` | 1-2229 | Route helpers and dashboard state (123-224); loaders, data mapping, state resets and item enrichment/archive/care/reminders (245-455); auth/profile initialization, polling, query/deep-link and extension-connect effects (457-706); profile, saved/web search, follow-up/chat, feedback, link/note creation (708-1037); pending save/item and import/review state transitions (1039-1177); detail/collection actions, automation routing and chats, tab/tour/visual-search/nav logic (1180-1421); full desktop shell, auth gating and screen composition/prop wiring (1423-2079); mobile topbar and bottom/More navigation (2082-2229). |
| `src/dashboard/LibraryTab.jsx` | 1-1351 | Indexing progress/activation/import-health calculations (45-225); mobile filters and layout control (227-326); library query/filter/layout/visual-upload composition, empty state, paging and virtual grid selection (328-745); search reason/message/progress helpers and AI answer/citation panel (746-872); chat progress, drawer, suggestions and submit interaction (874-1027); feedback controls and list/gallery/pin card semantics (1029-1340); exports (1341-1351). |
| `src/pages/Landing.jsx` | 1-798 | Landing auth/profile/public-feedback state and submit path (47-135); cursor/GSAP intro/reveal/parallax/reduced-motion lifecycle (137-337); full marketing layout: nav, hero, save-source ticker, content types, features, how-it-works, extension copy, indexing outcomes, anonymous feedback board, CTA, footer/legal route links (339-798). |
| `src/pages/LoginPage.jsx` | 1-319 | Session/profile loading, token and analytics binding, auth listener (26-101); Google sign-in/email OTP send/verify, avatar validation and profile save (103-186); all rendering branches including missing config, loading, sign-in/OTP, profile completion, signed-in state and banners (188-319). |
| `src/pages/HelpCenterPage.jsx` | 1-135 | Topic/form state and `mailto:` submission body/recipient/subject generation (13-40); support/how-to navigation, topic cards and required contact form rendering (42-135). |
| `src/pages/PricingPage.jsx` | 1-54 | Static pilot/free copy, contact navigation, no checkout action (10-54). |
| `src/pages/LegalPage.jsx` | 1-119 | Complete static terms/privacy/security/data-deletion/cookie content map (6-88) and type selection/render (90-119). |
| `src/pages/AdminSupportPage.jsx` | 1-269 | Session-storage admin key read/write, users/summary request and selected-user detail/timeline effects (25-93); complete support-safe metadata UI, no private saved item display (95-269). |
| `src/dashboard/AccountSettingsModal.jsx` | 1-869 | State, Escape/body overflow and extra-tab lifecycle, active-export polling, deletion and account data loaders (51-185); avatar/profile/export/download/deletion/cancel/logout handlers and derived metric/tabs (187-325); modal/page shell and Account/Privacy content incl data map/activity/usage/loading/coverage (327-614); Profile tab (615-648); export request statuses/download and deletion states/forms/cancel boundary (649-869). |
| `src/dashboard/AutomationWorkspace.jsx` | 1-746 | Surface dispatch (43-52); New Chat initialization, autosave, persisted message, draft/revise, Gmail OAuth/mock path, reviewed activation, chat deletion and draft mutation (54-262); New Chat composer, draft controls, Gmail state, loading/empty messages and confirmation dialog (264-377); automation list load/pagination/update/delete/run and detail actions (379-589); run-history load/filter/pagination/detail and shared status/notice/loading/empty/dialog/date/cadence helpers (591-746). |
| `src/dashboard/DetailDrawer.jsx` | 1-558 | Detail text normalization, dedupe, weak/repeated value filters, inferred insights, original-source rows and volatility verification heuristic (30-175); drawer detail/similar visual fetch and item state, asset preview and related panels (177-320); archive status/retry/readable content (322-400); reminder presets (402-435); similar results and score display (437-494); insight/original detail/section/chip rendering (496-558). |
| `src/dashboard/Filters.jsx` | 1-247 | Desktop select outside/Escape close and option selection (12-80); hover/focus-open filter group and option choice (82-134); combined filter menu, outside/Escape close, reset-to-all and active count (136-247). |
| `src/dashboard/GraphTab.jsx` | 1-620 | UI graph cap and relationship pruning (23-45); fetch/export/copy prompt and selection-derived graph state (47-142); zoom/pan/pointer/touch gesture and reset logic (144-255); graph SVG node/link rendering plus detail/explore/export panels (257-551); graph metrics, color mapping and deterministic 260-tick d3-force layout with fit-to-view scaling (553-620). |
| `src/dashboard/GuidedWorkspaceTour.jsx` | 1-270 | Storage read/write and accessible tooltip (5-59); live viewport/reduced-motion media-query state, welcome dialog lifecycle, signed-in/compact-aware target steps (61-161); start/first-run/requested tour, cleanup and Joyride error/keyboard event handling (163-270). |
| `src/components/Common.jsx` | 1-145 | `AnimatedFeatureSelect` outside-pointer/Escape lifecycle and value callback (13-81); auth-required sign-in panel (83-102); username/avatar profile form (104-132); typed notice/error banner (134-145). |
| `src/components/LoadingStates.jsx` | 1-140 | Spinner, hidden skeleton block, clamped/indeterminate progressbar, row/card skeleton variants (4-82); after-first-paint RAF/timer state and cleanup (84-105); deferred grid and app-shell skeleton composition (107-140). |
| `src/components/LandingHero.jsx` | 1-89 | Lazy Antigravity import, plugin registration, blur wrapper and hero intro timeline; reduced-motion/opening branch; image error hide and two CTA callbacks (6-89). |
| `src/components/VirtualLibraryGrid.jsx` | 1-108 | Width-to-column and layout-to-card-height rules (5-33); observer, row memoization and virtualizer setup (35-75); near-end load trigger and translated rows/loading skeleton (76-108). |
| `src/dashboard/LibraryCheckupTab.jsx` | 1-222 | Fallback data and clean-result derivation, metrics/check action/loading state, duplicates/broken links, reminders/old/weekly/random content (16-164); metric/header/empty/item-row reusable renderers and callbacks (166-222). |
| `src/dashboard/QuickAddModal.jsx` | 1-559 | State/refs/import health, image validation and file classifier (24-92); choose/link/note/upload modes and save/import callbacks (94-347); hidden drag/drop and alternate note/link/export forms (349-558). The drag/drop controls are nested in a `hidden` wrapper in current source. |
| `src/dashboard/UploadTab.jsx` | 1-472 | State/refs/import health, add/source options and review auto-scroll (24-71); upload/drop/select/source/import/progress/search UI (73-212); note-image selection/removal and note form (214-298); index activity/care panel and link form (300-348); pending-review bulk sequential approval and cards with editable metadata payload (350-472). |
| `src/dashboard/WorkflowsTab.jsx` | 1-382 | Workflow format/cadence constants and selected-reference defaults (22-65); readiness fetch and generate/publish request handlers (50-111); brief/cadence/reference selection and shell (113-233); readiness/skill/plan renderers (235-326); explicit approval/media input/queue publish check and result (328-382). |
| `src/pages/HowToUsePage.jsx` | 1-467 | Instagram/Pinterest step data and guide registry (14-187); GSAP guide-selection lifecycle with reduced-motion branch and refresh (189-255); route header/tour CTA/guide selector and no-guide/extension fallback (257-331); Pinterest mock-email and step rendering (333-397); extension coming-soon state (399-410); Instagram step rendering and open-app CTA (412-467). |
| `src/posthog.js` | 1-69 | Optional client initialization/options (1-15); recursive bounded property sanitizer/sensitive-key redaction (17-32); event/error fallback capture (34-52); user identify/reset (54-69). |
| `src/supabaseClient.js` | 1-15 | Env-gated Supabase client creation with PKCE, URL callback detection, persisted session and token refresh (1-15). |
| `src/components/GradualBlur.jsx` | 1-89 | Position direction table, curve/exponential progress and slice/blur styles (1-44); layer-count normalization, fixed-vs-parent positioning and decorative layer render (46-89). |
| `src/components/Antigravity.jsx` | 1-164 | Deterministic seed helper and particle setup (5-62); per-frame pointer/idle target, attraction ring/wave, interpolation, orientation/scale and matrix upload (64-143); geometry variants and Canvas wrapper (145-164). |
| `src/components/FeaturePillsSection.jsx` | 1-224 | Feature content and Radix popover renderer (12-93); matchMedia/reduced-motion/hover conditions, cached quick setters, magnetic movement, scroll reveal and cleanup (95-197); section and callbacks (199-224). |
| `src/components/ShowcaseSection.jsx` | 1-318 | Static showcase data (9-86); active item derivation and section/reduced-motion reveal lifecycle (88-177); active preview animation keyed to selection (179-219); focus/mouse/click selection, detail visibility and preview rendering (221-318). |
| `src/components/SmartCollectionsView.jsx` | 1-355 | Item/source/folder fallback helpers and grouped sorting/count (17-60); page loading/empty/metrics/group/sidebar composition (62-164); folder tile rename/pin/hide/selection, previews/signals (184-268); collection detail loading/empty/item removal/open and icon actions (270-355). |
| `src/components/SystemMapSection.jsx` | 1-325 | Static stage data and derived active content (9-64); section reveal and reduced-motion handling (66-158); active node/detail transitions and cleanup (160-239); interactive node/connector/detail output UI (241-325). |
| `src/components/TargetCursor.jsx` | 1-331 | Defaults/refs/mobile detection/constants and cursor helper (5-47); desktop body cursor, spin/ticker/position and target entry/leave tracking (49-275); event/timer/timeline/cursor cleanup, spin-duration refresh, mobile omission and cursor DOM (277-331). |
| `src/components/PixelSnow.jsx` | 1-253 | Canvas flake texture and initial position/velocity buffers (16-71); defaults/refs/count/resize/visibility observer (73-126); Three.js scene/material/geometry, RAF/snow wrap, resize and GPU cleanup (128-241); material prop refresh and container (243-253). |
| `src/components/featurePulseLottie.js` | 1-158 | Complete Lottie data read: metadata (1-11), outer-ring transform/stroke (12-62), inner-core transform/fill (63-100), rotating/fading spark path (101-158). |

### Specific logic observations added by the line pass

- The API client has a special 413 message (“20 MB or smaller”), while the UI import helper switches to Supabase Storage above 4 MiB; these thresholds refer to separate server/API upload versus browser-to-storage paths and should not be collapsed into one upload limit. Reconcile with backend contract before Rembr implementation.
- `AppShared.jsx` item state normalization maps generic paused variants to `paused`; `itemStateMatches('failed')` also includes paused. The card helper can show `Issue` for failed or indexing failure but does not give paused a separate chip. Preserve this exact existing behavior only if the product requires it; otherwise record a Rembr decision.
- `Dashboard.jsx` refreshes indexing summary every 3.5 seconds while active work exists and every 15 seconds otherwise; the dashboard also loads full items and a separate paginated library page. These are distinct data surfaces with different refresh and stale-update semantics.
- The first web-search request fetches saved results with AI disabled, then asks the library-chat endpoint with `includeWeb: true`; follow-up does the same only when the chat mode includes web. Saved-only search requests AI and asynchronously submits suggested item IDs for enrichment. Visual search resets the file input in the component before starting its handler.
- Quick Add upload UI explicitly classifies selected files into note images, export files and unsupported files. Full validation, ZIP extraction, threshold selection and storage upload are shared utility logic in `AppShared.jsx`; upload submission is orchestrated in `Dashboard.jsx`.
- Automation New Chat persists the user message before requesting a generated/revised draft; draft autosave is debounced 500 ms after state changes. Gmail OAuth callback status is consumed from `gmailConnection` and then removed from the URL. Manual run activation and scheduled activation have separate Gmail checks in the UI. The app copy says Gmail is read-only; provider-side authorization and backend enforcement are not proven by this UI audit.
- Admin key is read from and written to `sessionStorage`; UI never clears it on successful key use and admin API calls send it as `x-admin-api-key`. This is current behavior; any credential storage change is a proposal requiring owner/security review.
- Legal and help copy say the extension is not yet available while UI code has an extension-connect deep-link flow. This confirms a source-level discrepancy, not a conclusion about extension publication status.

### Read-pass completion and limits

**No tracked logic-bearing `apps/ui/src` file remains pending for a full source reread.** The line-range tables above cover every React/JavaScript implementation file in the 116-file inventory. CSS files were inspected for route/screen styling contribution and classified as styling rather than application logic; image/SVG assets are inventoried but their pixel content, licensing, and provenance were not semantically audited. `package-lock.json` was not reviewed dependency-by-dependency. No tests/spec files are present in the tracked UI inventory, and no app tests or runtime/browser checks were run in this pass.

### Exact inventory reconciliation

`git ls-files apps/ui` returned **116 paths**: 40 `.js`/`.jsx` files (38 under `src`, including 37 behavior-bearing modules and `main.jsx`; plus `vite.config.js` and `eslint.config.js`), 7 CSS files, 60 PNG/JPG/SVG image assets, and 9 other files (HTML, package/lock metadata, env example, ignore/README, PWA/crawler metadata). Every path is represented in the implementation, styling/build, and static-asset tables above. The exact command output remains the authoritative path ledger; there are no tracked UI test/spec paths.


## Related documents

- [Backend source coverage](backend-source-coverage.md)
- [Extension source coverage](extension-source-coverage.md)
- [Support-code coverage](support-code-coverage.md)
- [REA static-analysis record](rea-static-analysis.md)
