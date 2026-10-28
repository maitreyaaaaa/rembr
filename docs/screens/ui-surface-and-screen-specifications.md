# Rembr UI Audit: Screens, Flows, and Rebuild Specifications

## Audit status

This document describes the current source-backed IScraper web UI as a rebuild reference for Rembr. It covers the browser web app surface, including public pages, workspace tabs, modals, drawers, and responsive navigation. The browser extension has its own interface audit. The reviewed repository inventory contains no separate Expo/mobile app; see the [system boundary](../architecture/system-design-and-boundaries.md) and [source coverage ledger](../source-audit/support-code-coverage.md).

**Evidence labels:** `Implemented in source` means the behavior is visible in the checked-out UI code. It does not prove that hosted credentials, providers, or deployment settings are active. `Proposal` marks a Rembr improvement rather than current behavior.

## 1. UI architecture and navigation

### Entry and route model

- `apps/ui/src/main.jsx:1-14` mounts React StrictMode, analytics, and the root `App`; global, app, and mobile styles are imported once.
- `apps/ui/src/App.jsx:11-95` is the top-level route switch. Navigation is a custom History API implementation; `pushState` updates title and scroll position, while `popstate` and `hashchange` restore route state.
- `apps/ui/src/AppShared.jsx:998-1110` defines routes, page titles, legacy hash migration, unknown-path fallback, app query parsing, dashboard tab parsing, and library layout parsing.
- Public routes: `/` landing, `/login`, `/pricing`, `/how-to-use`, `/help`, `/terms`, `/privacy`, `/security`, `/data-deletion`, `/cookies`, `/admin`; `/app` is the workspace. `/auth/callback` is interpreted as the app. Unknown paths are canonicalized to `/`.
- Legacy hashes such as `#app?tab=upload` are rewritten to path/query URLs. `/app` query state includes selected dashboard tab, automation view/chat, item deep link, and pending saves/extension connections.

### Workspace navigation

`apps/ui/src/AppShared.jsx:159` lists eight tabs: `library`, `smart`, `workflows`, `automations`, `care`, `graph`, `upload`, `settings`. `Dashboard.jsx:147-205` owns the shared session, item, search, filter, import, selection, feedback, modal, and navigation state.

- Desktop: collapsible/hover-expandable sidebar, navigation links, nested Automation views and recent chats, How to Use link, Settings, and saved-item count (`Dashboard.jsx:1505-1663`).
- Mobile: sticky top bar, five-item bottom navigation, an Add action, and a More menu exposing secondary destinations (`Dashboard.jsx:2082-2220`; `mobile.css:1-204`). Bottom navigation hides while filters, detail, add, or library chat overlays are open.
- Automation subroutes are URL-backed: New Chat, My Automations, Scheduled Tasks, Run History. Recent chats can be deep-linked (`Dashboard.jsx:123-145`, `AutomationWorkspace.jsx`).
- The app supports a local-preview branch when Supabase is not configured. Authentication-required and profile-required gates are rendered for private tabs when auth is configured (`Dashboard.jsx:1705-1977`).

### Cross-screen state and data flow

1. Landing/how-to/pricing/help CTAs pass callbacks to `App.jsx`, which navigates to public routes or `/app`.
2. Login uses Supabase Google OAuth or email OTP. Auth state populates the API bearer token; profile setup is required before private actions when the backend says a profile is required (`LoginPage.jsx:26-187`, `Dashboard.jsx:210-244`).
3. Workspace loading obtains items, paginated library content, smart collections, indexing status, and library-care data. Search, imports, item actions, and settings refresh their affected surfaces (`Dashboard.jsx:245-355`, `550-645`).
4. Selecting a card opens `DetailDrawer`; related/similar links can select another item. Quick Add and full Upload share form/file state. Settings has nested profile, privacy, security, request, and product-data panels.
5. The source includes request/correlation IDs and safe client telemetry in `api.js:3-67`, session/auth helpers in `AppShared.jsx`, and PostHog redaction in `posthog.js:1-61`.

## 2. Screen specifications

### 2.1 Landing (`/`)

**Purpose and presentation.** Public product entry page in a dark, high-contrast visual system with grid/radial backgrounds, green primary accent, oversized display headings, animated hero, product feature explanation, system map, showcase, feedback, final CTA, and footer. Source: `pages/Landing.jsx:48-797`; hero/feature/map/showcase primitives in `components/LandingHero.jsx`, `FeaturePillsSection.jsx`, `SystemMapSection.jsx`, `ShowcaseSection.jsx`, `SmartCollectionsView.jsx`.

**Interactions.** Header routes to Pricing, Contact/Help, How to Use, Login or account controls. Hero and bottom CTAs open the library or scroll to “How it works”; feature cards explain capture, organization, enrichment, search, and workflow capabilities. Anonymous feedback is submitted through `submitPublicFeedback` and shows success/error state. Footer links to all legal/help pages. A `localStorage` key tracks whether the library CTA has been started (`Landing.jsx:47` onward).

**States / backend.** Public content is static. Feedback has submitting, success, and error states; authenticated account controls are conditional. The login/settings shell may be shown by the landing page where configured. No landing-page data dependency is required for core navigation.

**Rebuild requirements.** Preserve semantic heading structure, keyboard operation, CTA targets, reduced-motion behavior, and the complete footer route set. Recreate as a new Rembr design system only after behavior and copy inventory are accepted. Confirm whether old claims, testimonials, external badges, and user-feedback moderation should be retained; do not assume promotional copy is a product requirement.

### 2.2 Login and profile setup (`/login`)

**Purpose.** Authenticate users, initialize profile state, and direct signed-in users into the app. Source: `pages/LoginPage.jsx:26-319`.

**States.** Supabase session check (`Checking login…`); local configuration missing (`Login is not configured locally`); signed out; email code sent; invalid/provider error; profile required; authenticated success. Error and notice banners are separate.

**Interactions and rules.** Continue with Google invokes `startGoogleSignIn`. Email is trimmed/lowercased, OTP is sent with `sendEmailOtp`, then verified with `verifyEmailOtp`; resend is supported. Profile setup validates lowercase username against `[a-z0-9_]{3,24}` and optional avatar PNG/JPEG/WebP <=250 KB. Profile submission uses `saveProfile`; successful auth sets the API token, records sign-in activity, identifies analytics user, and cleans auth callback parameters (`LoginPage.jsx:44-187`, `AppShared.jsx:1113-1143`).

**Rebuild requirements.** Model auth as explicit states and keep token/profile/session synchronization in a shared auth service. Preserve accessible labels, focus and error messaging, one-time-code autocomplete, avatar type/size validation, Terms/Privacy links, callback cleanup, session subscription cleanup, and safe unauthenticated local-preview behavior. Auth provider success remains externally dependent.

### 2.3 Pricing (`/pricing`)

Static pilot pricing page (`pages/PricingPage.jsx:10-53`). It currently says the product is free during pilot onboarding, explains that paid plans are not live, and routes “Apply for a pilot and founder meeting” to Help/Contact. This is copy-driven and not connected to a billing checkout. Keep price-plan data separate from implementation; confirm current business terms before copying text.

### 2.4 Help and support (`/help`)

Static topic cards for imports, AI processing, search/Lens, account support, plus a contact form (`pages/HelpCenterPage.jsx:17-135`). “Send” constructs a `mailto:` URI in the browser; it does not post to an API. Inputs are email, topic (Import help, Login/account, Extension coming soon, Search results, Billing/credits, Other), and required message (max 1200 characters). Actions link to How to Use and the app. Rebuild must distinguish “opens an email client” from an in-app support ticket and avoid claiming server-side submission.

### 2.5 How to Use (`/how-to-use`)

Interactive guide selector for Instagram export, Pinterest export, and a browser-extension placeholder (`pages/HowToUsePage.jsx:14-467`). Selecting a guide expands an illustrated step sequence. Instagram includes 16 export/import steps; Pinterest includes 14 request/download/import steps; images have per-step alt text and lazy loading after the first items. Browser extension guide currently says “coming soon for normal users”. A CTA requests a guided tour; it opens the app and carries a pending tour request (`App.jsx:27-31`). GSAP reveals content unless `prefers-reduced-motion` is enabled (`HowToUsePage.jsx:189-258`).

**Rebuild requirements.** Preserve guide selection, image-to-step association, responsive reading order, alt text, reduced-motion support, and app/tour handoff. Treat external platform steps and screenshots as change-prone documentation requiring periodic verification. Do not claim the extension is unavailable solely from this public page; source has a working extension implementation, so the difference is likely release status and needs reconciliation.

### 2.6 Legal and privacy pages (`/terms`, `/privacy`, `/security`, `/data-deletion`, `/cookies`)

One data-driven `LegalPage` renders five variants (`pages/LegalPage.jsx:6-119`): headings, intro, section cards, back navigation, and a “Last updated May 27, 2026” label. Terms discuss account and content rights, AI, plans, and extension release. Privacy describes auth, saved content, processing, tokens, exports/deletion, telemetry, retention, and security controls. Security outlines controls and reporting. Data Deletion describes requesting deletion by email. Cookies describe browser/local storage and analytics.

**Audit discrepancy:** the text says the extension is “coming soon” / unavailable to users, while the checked repo contains a Manifest V3 extension and connection flow. This must be recorded as a documentation/release-status mismatch, not silently normalized. Legal content is static and is not a substitute for current legal review.

### 2.7 Admin support (`/admin`)

Support-only admin UI (`pages/AdminSupportPage.jsx:25-269`). It asks for a password-type admin key and user search, then calls summary/users APIs. The left column shows aggregate counts and matching users; selecting a user loads support-safe metadata, activity timeline, deletion state, imports, failed jobs, credits, and token/connection counts. Private saved content is intentionally not displayed. Loading and error states are exposed; no result shows an instruction to load users.

The admin key is retained in `sessionStorage` under `iscraper-admin-key` and passed to admin helper calls. Treat this screen as a high-sensitivity flow; document its actual backend auth contract and response sanitization, avoid logging/rendering raw key values, and preserve the “support-safe metadata only” boundary.

### 2.8 Workspace shell and access gate (`/app`)

`Dashboard.jsx:147-2220` renders workspace navigation, global banners, app skeleton, mobile chrome, tab content, modals/drawers, and guided tour. Auth/profile access gates are repeated per tab; current source allows local preview when auth is absent. Initial route state comes from URL, and sidebar/mobile actions update it. Initial loading blocks the content pane with `AppShellSkeleton`; global `Banner` surfaces errors and notices.

**Shared requirements.** Preserve deep links, Back/Forward navigation, search/selected-item state behavior, pending browser-extension connect/save handling, user/profile gate consistency, desktop/sidebar and mobile navigation parity, focus visibility, and overlay stacking/closing rules. The content panes are not independent routes; they share Dashboard-level state.

### 2.9 Library and search (`/app?tab=library`)

Primary saved-items workspace (`dashboard/LibraryTab.jsx:328-736`, result subcomponents from line 737 onward). Displays a paginated item board in grid/list/pin layout; search box, saved/web search mode, type/state/platform/collection filters, sort, indexing progress, activation guidance, import health, and optional AI chat. Results support AI answer/citations, feedback, and image/Lens search. Item selection opens the shared Detail Drawer. Add opens Upload or Quick Add.

**Data/state.** Library pages load at 60 items using cursor pagination; facets are returned by the API. Search uses `searchItems`; web mode first obtains saved matches, then calls grounded chat with web inclusion; follow-up chat keeps saved-library context. Request sequencing prevents stale search response overwrite. Search feedback is associated with a search event id (`Dashboard.jsx:744-952`). Loading-more, initial skeleton, empty state, network error, AI partial result, clear-search, and feedback states must be described separately.

**Rebuild requirements.** Keep server-side pagination and filtering contracts, keyboard/search submission behavior, virtualization, consistent filter semantics across layouts, empty/loading states, and evidence/citation distinctions. Document web search and saved-library search as separate sources. Do not imply AI answers are ground truth.

### 2.10 Smart Collections (`/app?tab=smart`)

`components/SmartCollectionsView.jsx:62-344`, hosted by Dashboard. Displays grouped smart-collection cards/folders, counts/metrics and preview saves. Selecting a collection loads its items, item open navigates to the shared detail drawer, refresh requests recomputation, collection settings update, and item removal uses per-collection overrides. Loading/empty/error states originate from Dashboard and are passed as props. Collection model and API behavior are documented in the backend specification.

### 2.11 Content Workflows (`/app?tab=workflows`)

`dashboard/WorkflowsTab.jsx:30-382` is a content-command panel. User enters a campaign brief; chooses output format and cadence; selects saved references (defaults to first two eligible items); generates a plan; reviews plan preview, readiness checks, agent skills, and output; optionally adds media URL; explicitly toggles approval before publishing/dispatching. API functions `generateContentWorkflow` and `publishContentWorkflow` perform the operations.

**Important flow invariant:** the API service's `composioExecutionReadiness` adds `explicit approval` to the missing requirements unless `approved` is true (`apps/orchestration/src/services/contentWorkflows.js:214-233`), so the backend is the security gate. The UI's `Queue publish check` button is enabled whenever a plan exists, even when the approval toggle is off (`WorkflowsTab.jsx:345-364`), and sends `approved` as a boolean (`:91-109`). This allows a check request that the backend should block; it does not establish that any external publish can bypass server approval. Rembr should disable actual dispatch until approval, label readiness-check behavior separately, and retain the server-side approval gate as authoritative.

### 2.12 Automations (`/app?tab=automations`)

`dashboard/AutomationWorkspace.jsx` contains New Chat, My Automations, Scheduled Tasks, and Run History, with detail/run-history panels and confirmation dialogs. URL query state encodes view and chat ID; recent chat links are fetched for navigation. This feature includes draft/revise, saving automation definitions, manual/scheduled execution, details, run result/history, updates/deletion, loading/error/empty states. The API/provider/worker behavior is in the backend audit; this UI spec must link to it. Confirm destructive confirmation and schedule validation in detailed per-view specs.

### 2.13 Library Checkup (`/app?tab=care`)

`dashboard/LibraryCheckupTab.jsx:16-222` presents cleanup and rediscovery: duplicate groups, links that may not open, due reminders, saves older than three months, weekly picks, and a random item. “Check links” triggers link-check work; item actions open detail, create reminders, or mark reminder done. Loading, zero-results, and no-care-data states use explicit panels/empty copy. Distinguish a link-health check from guaranteed source availability.

### 2.14 Knowledge Graph (`/app?tab=graph`)

`dashboard/GraphTab.jsx:23-620` requests a knowledge graph, caps UI rendering at 240 nodes/420 links, filters/types or searches nodes, lays out relationships with d3-force, displays graph metrics, and opens an item detail drawer when an item node is selected. The graph is a visualization of indexed entities/items; it depends on graph API data and may have no nodes before enrichment. Rebuild must cover loading/error/empty, simulation cleanup, selection, focus/keyboard alternatives, bounded rendering, and an accessible non-canvas/list alternative (proposal if absent in source).

### 2.15 Add content (`/app?tab=upload` and Quick Add overlay)

`dashboard/UploadTab.jsx:24-472` offers paste-link, note, and file import modes; tracks selected files/source type/import progress; supports saved-post review queue; links to guides and to activation/search. `QuickAddModal.jsx:24-559` is an overlay that offers choose, link, note, or import and can transfer the same draft state to full Upload. File helpers separate export files, note images, and unsupported files; source selection and file health validation occur before import.

**State invariants.** Do not lose selected files, note image state, or link values when switching Quick Add to full upload. Surface unsupported file/type errors; keep limits and storage-upload fallback visible and aligned to backend behavior. Import can enter pending review; approving review and starting processing are different user actions.

### 2.16 Item detail drawer

`dashboard/DetailDrawer.jsx:30-558` presents item details, source metadata, summary/insights, extraction details, archive/retry state, reminder state, similar visuals, and review approval actions. It contains logic to normalize/dedupe generated detail rows, suppress weak or repeated text, and flag volatile claims requiring verification (`needsDetailVerification`, lines 104-175). Drawer close, approve, archive retry, remind, similar item navigation, and content sections are controlled by Dashboard.

Rebuild should retain provenance/source links, distinguish original content from generated analysis, visibly mark low-confidence/volatile facts, and make close/retry/reminder/approval state explicit. Backend audit must confirm whether displayed states match persisted records.

### 2.17 Settings and account/privacy center (`/app?tab=settings`)

`dashboard/AccountSettingsModal.jsx:51-869` appears as a full page in the workspace (`mode="page"`) and also supports modal mode. Tabs include Account, Privacy, Security, Requests, plus injected Library checkup and Graph view. Features include account summary, profile/avatar editing, data usage, sign-in/security activity, extension-token/session counts and management, privacy export request/polling/download, legacy JSON download, account deletion request/reason, deletion-state refresh/cancel, logout, and linked help/legal actions.

**High-impact flow:** export can be asynchronous (requested/building/ready/error) and must be polled/refreshed; deletion request and cancellation are distinct. Keep export-file inclusion choice and deletion confirmation/reason state explicit. Preserve Escape behavior, modal/body-scroll cleanup, tab navigation, and accessible focus. Verify all UI claims against server data and migration contract.

### 2.18 Guided workspace tour (first run or explicit request)

`dashboard/GuidedWorkspaceTour.jsx:7-270` stores seen status in local storage, opens a welcome dialog, then steps through navigation and feature targets. It can be started from How to Use or first workspace visit, prepares the target tab before highlighting, supports back/next/skip/close/finish, tracks progress, and adapts to compact viewport/reduced motion. `guided-workspace-tour.css:1-303` supplies overlay, tooltip/pointer, focus ring, responsive and reduced-motion styling. Target selectors rely on `data-tour` and rendered feature selectors; changing the UI requires updating these together.

## 3. Shared visual and interaction behavior

- Current design uses near-black surfaces, white/gray text, green primary accent, cards with subtle borders, rounded controls, display typography, and grid/radial backgrounds across public pages and the workspace. This is descriptive, not a Rembr visual direction.
- `mobile.css:1-213` adds safe-area padding, fixed bottom nav, More sheet, touch targets, keyboard-aware scrolling, filter sheet, overlay stacking and reduced-motion overrides under 768px. `App.css`, `styles.css`, `index.css` define other primitives/tokens.
- Shared `components/Common.jsx` includes feedback selectors, auth/profile required panels and banners. `components/LoadingStates.jsx` provides spinner, block/row/card skeleton, deferred skeleton and app-shell skeleton.
- Several visual components animate. Landing CSS and GSAP, `Antigravity`, `PixelSnow`, `GradualBlur`, `TargetCursor`, `featurePulseLottie`, and tour components should obey reduced-motion and progressive-loading behavior.
- Accessibility evidence varies by component; many buttons have accessible labels and active-page state, but each rebuild spec requires keyboard, focus order, screen-reader labels, contrast, dialog focus containment, and an equivalent way to access graph/virtualized content.

### Shared component behavior traced to source

- **Common controls** (`components/Common.jsx:13-145`): the feedback feature picker closes on outside pointer or Escape and invokes the supplied `onChange`; the auth gate invokes `onSignIn`; the profile gate lowercases usernames in the input, enforces `[a-z0-9_]{3,24}` in browser validation, accepts PNG/JPEG/WebP avatar selection through a parent handler, and calls the supplied save callback. The banner chooses error vs notice visuals/icons from `type`.
- **Loading components** (`components/LoadingStates.jsx:4-140`): progress values clamp to 0–100, non-finite values render an indeterminate bar, row/card skeleton counts and layout classes are configurable, and deferred skeletons wait for two animation frames plus a short timer. Cleanup cancels both frames and timer. These components expose `role=status`/`aria-live` for progress but skeleton accessibility semantics vary by variant.
- **Virtual library grid** (`components/VirtualLibraryGrid.jsx:5-108`): columns are calculated from measured width and layout mode; fixed estimated card heights determine virtual row placement; TanStack Virtual renders an overscan of five rows; approaching the last four rows invokes `onLoadMore` if allowed. The implementation uses fixed estimates and a `ResizeObserver`; visual card height variance and keyboard/screen-reader access need explicit Rembr acceptance.
- **Smart collection view** (`components/SmartCollectionsView.jsx:17-355`): folders group by generated folder-group metadata, sort pinned first, then item count/name; groups sort by rank/name. Folder tiles permit rename through `window.prompt`, pin/unpin, hide, and selection. Detail rows open an item or remove it from that folder. Empty/loading states are explicit. Folder metadata and item lists come from parent-provided state and callbacks.
- **Library care view** (`dashboard/LibraryCheckupTab.jsx:16-222`): duplicate groups show up to eight, broken links up to ten; each row can open or schedule a one-week reminder. Due reminders can be marked done; older, weekly, and random resurfacing are separate data groups. “Clean” means no duplicates and no broken-link rows in received data, not an independently verified integrity guarantee.
- **Upload and quick add** (`dashboard/UploadTab.jsx:24-472`, `QuickAddModal.jsx:24-559`): the full page has three modes; upload mode includes source selection, drag/drop, file input, import progress and pending review cards; note mode keeps note data and selected images; link mode submits controlled link/title/note. Pending reviews auto-scroll into view, and “Add all” awaits each approval sequentially. Quick Add chooses link/note/upload, can route to full Add Saves, and shares draft props with Dashboard. It classifies note images, supported exports, and unsupported selections. The component contains an additional drag/drop/input region under a `hidden` wrapper (`QuickAddModal.jsx:349-411`); treat it as non-visible current markup, not a functioning visible dropzone.
- **Workflow screen** (`dashboard/WorkflowsTab.jsx:22-382`): references default to the first two among up to twelve eligible current items; user can select up to four. Generation sends brief, format, cadence, selected reference IDs, platform mapping (LinkedIn format maps to LinkedIn; other formats to Instagram), and timezone. Publication sends caption/media URL and the boolean approval state; the button itself is not disabled until approval is true, so server-side enforcement must be verified before relying on the UI as an approval gate. Current UI wording calls the action “Queue publish check.”
- **How-to page** (`pages/HowToUsePage.jsx:14-467`): guide selector toggles Instagram, Pinterest, or an extension “coming soon” panel. Instagram and Pinterest step arrays directly reference screenshot files; Pinterest includes one HTML mock-email treatment. Guide changes revert and recreate scoped GSAP effects; reduced motion sets content visible, otherwise step media/copy reveal on scroll. It also links to the workspace tour and upload route.
- **Marketing interactions and visuals**: feature pills use Radix popovers and a Lottie pulse; desktop fine-pointer hover adds a magnetic offset while scroll triggers reveal, disabled under reduced motion (`FeaturePillsSection.jsx:12-224`). Showcase selects among four static example result types by click, focus, or hover and animates the preview (`ShowcaseSection.jsx:9-318`). System map selects among four explanatory stages with the same click/focus/hover pattern (`SystemMapSection.jsx:9-325`). Hero CTAs call parent navigation callbacks; the Three.js Antigravity canvas is lazy loaded and omitted when `reducedMotion` is true (`LandingHero.jsx:25-89`, `Antigravity.jsx:5-164`). `PixelSnow.jsx:16-253` is a separate reusable Three.js component that pauses its frame updates outside the viewport and disposes GPU resources; usage should be confirmed from imports before including it in Rembr. `TargetCursor.jsx:5-331` returns no DOM for detected mobile devices and otherwise owns global mouse/scroll listeners and temporarily hides the system cursor; it requires desktop, reduced-motion, and pointer-visibility verification.
- **Shared service setup**: `posthog.js:3-69` initializes only when a public client key exists, recursively redacts property names matching sensitive categories and truncates strings/arrays/depth, then offers capture/identify/reset. `supabaseClient.js:3-15` only creates the client when both public URL and anon key exist, using PKCE and persisted/auto-refreshed auth. These are frontend configuration behaviors; they do not establish telemetry retention or server authorization.

## 4. UI-verified discrepancy and proposal register

| ID | Evidence | Classification | Documentation/rebuild action |
|---|---|---|---|
| UI-D01 | Extension implementation and connection flow exist, while How to Use/Help/Legal call it “coming soon” or unavailable. | Current product/release-copy mismatch | Establish intended release state from owner and release records; do not erase either evidence source. |
| UI-D02 | `/help` contact form navigates to `mailto:` rather than a backend support API. | Product behavior/copy accuracy | Document email-client dependency; Rembr may later add a ticket flow as a separately approved improvement. |
| UI-D03 | `/pricing` is static pilot/free copy; no checkout flow is rendered on the page. | Business claims require current confirmation | Keep billing feature implementation separate from pilot status copy. |
| UI-D04 | Admin API key is persisted in `sessionStorage`. | Sensitive admin credential handling | Preserve server authorization and review whether session persistence is required; proposal only until security review. |
| UI-D05 | `PixelSnow.jsx` has a continuous RAF animation while visible and no reduced-motion preference check; `TargetCursor.jsx` creates spin/tween animations without a reduced-motion check. `LandingHero` does suppress its Antigravity canvas when its parent reports reduced motion, and several GSAP sections have their own checks. | Component-specific motion support is inconsistent | Rembr should centralize and test reduced-motion behavior for every animation surface; this is a source observation, not a claim of user harm or a runtime accessibility result. |
| UI-D06 | Workflow dispatch button is disabled for missing plan or active publish request, but not for `approved === false`; approval is sent in the publish API request. Backend readiness requires explicit approval (`contentWorkflows.js:214-233`). | UI approval affordance is not a client-side dispatch gate; server-side approval check is present | Preserve backend rejection as authoritative. Rembr should disable external dispatch until approved and distinguish readiness checks from actual dispatch. Add a direct API test for missing approval. |
| UI-D07 | Quick Add contains an additional drag/drop/input block nested inside a `hidden` wrapper (`QuickAddModal.jsx:349-411`). | Dormant markup / potentially confusing implementation path | Rebuild only the visible selection/upload flows unless an explicit product decision reactivates this alternate block. |
| UI-P01 | Add accessible alternative to force graph and virtualized gallery for keyboard/screen-reader users. | Proposal | Record as improvement; confirm with accessibility audit before implementing. |
| UI-P02 | Central `AppShared.jsx` mixes API wrappers, shared UI, parsing/normalization utilities and route helpers. | Architecture observation | Map current exports first; consider separating domains in Rembr ADRs without assuming current behavior changes. |

## 5. Rebuild sequence for the UI

1. Define route contract, auth/profile state model, app shell, responsive tokens, notification/error components, and API-client interface.
2. Build Login/Profile setup and workspace access gate; verify callback/deep-link handling.
3. Build Library listing/pagination/filters/layout and item detail; add search modes, chat, feedback, and visual search.
4. Build Add/Upload and import/review flows, preserving quick-add state and explicit review/indexing states.
5. Build Smart Collections, Graph, Library Checkup/reminders, and shared item actions.
6. Build content workflows and the Automation workspace, retaining explicit user approval before connected actions.
7. Build Settings, exports/deletion, admin support, How to Use, Help, Pricing, and legal routes.
8. Add guided tour selectors after final navigation is stable; verify the tour on desktop/mobile and reduced-motion settings.
9. Apply Rembr visual design last; recheck all screen states, keyboard and screen-reader behavior, mobile safe areas, and API error states.

## 6. Source references

- Route switch and global history: `apps/ui/src/App.jsx:11-95`; route utilities: `apps/ui/src/AppShared.jsx:998-1110`.
- Shared workspace state/render: `apps/ui/src/dashboard/Dashboard.jsx:147-205`, `245-355`, `744-952`, `1680-1990`, `2082-2220`.
- API request/error telemetry contract: `apps/ui/src/api.js:3-67`; analytics sanitization: `apps/ui/src/posthog.js:1-61`; Supabase initialization: `apps/ui/src/supabaseClient.js:1-13`.
- Public pages: `apps/ui/src/pages/`; dashboard surfaces: `apps/ui/src/dashboard/`; responsive overrides: `apps/ui/src/mobile.css`.


## Related documents

- [Rembr design-system brief](rembr-design-system-brief.md)
- [Screen/workflow phase matrix](../rebuild-plan/screen-workflow-phase-matrix.md)
- [Phase roadmap](../rebuild-plan/phase-gated-roadmap.md)
