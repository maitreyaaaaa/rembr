# Final UI review — 2026-11-03

## Goal and approach

Make the submission feel deliberate and readable without changing Rembr's black, lime, orange, or wordmark identity. Review the live site with the existing signed-in account, inspect the owning styles, apply a bounded frontend polish, then verify locally. No blanket reduction of all padding: relationships and usable controls matter more than density alone.

## Research used

- [Carbon spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview): use a repeatable spacing scale and distinguish component spacing from page layout.
- [NN/g visual design principles](https://www.nngroup.com/articles/principles-visual-design/) and [proximity](https://www.nngroup.com/articles/gestalt-proximity/): establish hierarchy, alignment, balance, contrast, and related groups.
- [Fluent shapes](https://fluent2.microsoft.design/shapes/): distinguish controls, surfaces, and round/pill elements instead of giving every element the same radius.
- [Material typography](https://m3.material.io/styles/typography/applying-type): separate display, headline, title, body, and label roles; keep body copy legible.
- [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum/): retain at least 24px targets or qualifying spacing; use larger targets for primary/mobile controls. This review is not a formal WCAG conformance audit.

## Implementation plan

1. Reserve desktop space for the fixed dock and remove the negative masonry offset. Use one outer page gutter; repair settings/sensitive page specificity and the 760–767px breakpoint mismatch.
2. Remove duplicate padding on add, graph, and checkup; make task headings smaller than marketing display text. Correct grid intrinsic sizing where content overflows.
3. Repair folder-menu geometry, selected-tab contrast, and undersized settings body/control text. Keep card/field radii consistent and avoid ornamental hover elevation on static panels.
4. Tighten secondary marketing heroes and pricing; preserve the expressive landing. Verify routed public pages, authenticated pages, responsive layouts, keyboard behavior, and repository checks.

## Initial observed findings

- Pins cards extend under the fixed dock because the masonry grid has a negative margin after the page already reserves dock clearance.
- Settings and developer/MCP pages lose their intended full-width/dense layouts to older `body .phase2-main` rules. Settings has nested scrollbars and clipped navigation at a short desktop height.
- Add, graph, and checkup apply outer padding inside another padded page wrapper. Their 48–60px task titles use too much of a short screen.
- Checkup has horizontal overflow; fractional grid tracks use automatic minimum sizing.
- Folder ellipsis controls inherit a later generic 44px summary style and render as tall empty-looking pills.
- MCP's selected light tab inherits lime text; support links can inherit white text on lime because unlayered anchor color overrides Tailwind utilities.
- Settings uses 9–11px instructional copy and controls across large surfaces. Increasing text is more useful than shrinking all spacing.
- Pricing is a very large display heading for a short contact-only page; secondary marketing heroes hide the useful copy below the fold at the inspected 1356×548 viewport.
- Terms, privacy, security, data deletion, and cookies are explicitly unfinished notices, not published policies. Pricing is contact-only. These are content limitations, not visual fixes.

## Implemented changes

- Shared desktop dock clearance and one outer page gutter; no negative Pins offset. Mobile breakpoint consistently changes at 768px. Sidebar expansion is explicit so hovering cannot move a click target beneath the pointer.
- Settings fills the available workspace, its navigation can scroll on short screens, mobile content reserves bottom-navigation space, and small instructions/inputs are 2px larger. Sensitive-access pages retain their existing compact design and typeface.
- Add, graph, and checkup use the shared outer gutter. Their headings and nested grid tracks now use appropriate sizes. Cards/controls retain distinct corner sizes. Static panels no longer advertise hover elevation.
- Arc component typography tokens are namespaced to stop overriding Tailwind's type scale. Mobile footer columns wrap instead of clipping. Folder menus keep compact 28px targets instead of inheriting generic 44px padded summaries.
- Selected MCP tabs and support links retain their intended text contrast. Full-card guide actions no longer repeat all their copy in a floating tooltip. Quick-add is hidden while the item-detail modal is open.
- Secondary marketing heroes, pricing, and landing section gaps are tighter. The landing's identity and existing motion are retained. Contact actions now lead to Contact, while Help Center still leads to Help.
- The 404 page was missing its stylesheet on a direct visit; the shared guide stylesheet now loads at startup.
- Opening an existing smart collection reproduced a live blank-page crash (`undefined.find`). The matching API returns `note: string` and `tags: string[]`, unlike hydrated library items. An explicit adapter now builds the card contract; two regression cases cover page and note records. No backend response or stored data was changed. Collection cards currently have text previews because this endpoint does not supply hydrated media.

## Route coverage

| Surface | Review evidence |
| --- | --- |
| Landing `/` | Live desktop; local full page and scroll reveals; local 320px geometry. |
| Features, About, Contact | Live desktop; local full-page desktop/mobile captures; local 320px and 390px geometry. |
| How to use | Live desktop; local mobile screenshot and Instagram guide expansion; 320/390px geometry. |
| Help, Pricing | Live desktop; local mobile review; pricing contact destination clicked and verified; 320/390px geometry. |
| Terms, Privacy, Security, Data deletion, Cookies | Each live desktop route reviewed; shared local template captured; each measured at 320/390px. All remain unfinished policy notices. |
| Login/register | Live desktop sign-in; local mobile sign-in/registration layout. No new account created. |
| 404 | Direct local visit reproduced unstyled output; corrected view visually verified at 1280px and 320px. |
| MCP authorization entry | Local missing-request error verified. A valid external OAuth approval flow was not started. |
| Library | Live signed-in Pins and measurements; existing card/detail/edit routes reviewed. Local post-fix authenticated walkthrough still pending sign-in. |
| Add saves | Live signed-in link and archive tabs reviewed. No capture or upload submitted. |
| Imports/history/detail | Live signed-in list and an existing import detail reviewed. No retries, analysis, or removal executed. |
| Notes/item editing | Live new-note and existing page-edit forms reviewed without saving. Note-edit uses the same editor; no existing note edit was opened. |
| Smart collections | Live list reviewed; opening Links reproduced the crash. Adapter regression tests pass; local authenticated browser retest still required. |
| Graph/checkup | Live loaded screens reviewed. Checkup overflow found and intrinsic tracks corrected; local authenticated viewport retest still required. |
| Settings | Live profile and all four section-navigation buttons reviewed. Preferences/advanced route aliases use the same component. Local authenticated retest still required. |
| API keys/MCP access | Both live signed-in routes reviewed without creating credentials or granting access. Local authenticated retest still required. |
| Profile setup | Source reviewed only. Existing complete account was not reset to exercise onboarding. |

Local public geometry checks found no document/section overflow at 320px or 390px. These checks do not establish keyboard, screen-reader, text-zoom, or WCAG conformance across every state. The Chrome viewport override affected the selected tab rather than the background signed-in tab; responsive claims above use the in-app browser's measured viewport, not that ineffective override.

## Checks

- Full `npm run check` passed: API/web typecheck and lint, 136 API tests, API/web production builds.
- After the additional collection adapter, public-route changes, and final modal/mobile adjustments: two new contract regression tests, web typecheck, repository lint, and web production build all passed. The 136-test backend run preceded those frontend-only adjustments; it was not repeated.
- Existing build warnings: main and password-strength JavaScript chunks exceed 500kB. This polish does not resolve that performance work.
- Final `git diff --check` passed.

## Remaining gates

- Sign in to the local preview at `http://127.0.0.1:5173/login` with the existing account to verify the corrected authenticated pages, Pins/Gallery/List, folder menus, collection detail, settings, graph/checkup, and narrow viewports. The local API runs against the configured environment; do not trigger captures, providers, imports, or account edits for visual review.
- Changes are local and have not been pushed or deployed. The live folder-detail crash therefore remains until a reviewed deployment.
- Finish factual policy content separately. The local Contact page reports no configured destination; `VITE_CONTACT_EMAIL` is now documented in `.env.example`. Hosted contact configuration was not verified.
- No provider calls, uploads, deletion, key creation, account creation, or hackathon submission were performed.

## Changed files

### Folder interaction correction — 2026-11-04

- User explicitly requested no ellipsis controls: right-click folders to open actions, with solid Rembr green by default and no glass effect.
- Replaced generic `<details>` menus with Base UI Context Menu, portaled to the document with viewport collision handling. Shift+F10, arrow navigation and Escape were browser-verified. The primitive supplies touch long-press support; physical touch was not tested.
- Folder faces/tabs now use opaque `#A5FF18` by default; existing custom RGB colors stay custom and alpha is removed for display. New selections use an opaque native color input and six presets, rather than an opacity-enabled picker. No persisted colors were overwritten.
- Kept the folder grid, increased names to 13px, added save counts, removed generic panel/link styles from group sections, and gave folders full clickable tiles.
- Browser verification used the actual SmartCollectionsPage with an injected synthetic request fixture, no account or provider connected. At 1280px and 320px: no three-dot/summary controls, context menus stayed in bounds, rename cancellation and color preset/cancel interactions passed. Temporary fixture entry files were removed after review. This is UI verification, not a live persistence test.
- Files for this follow-up: `apps/web/src/components/SmartCollectionsPage.tsx`, `apps/web/src/styles.css`, `apps/web/package.json`, `package-lock.json`, and this report. Base UI supplies accessible positioning/focus behavior. Earlier local changes remain present and undeployed.

- Foundation/layout (relative to `apps/web/src`): `styles.css`, `main.tsx`, `App.tsx`, `components/arc/foundation.css`, `components/arc/button/button.module.css`, `components/arc/color-picker/color-picker.module.css`.
- App surfaces: `components/SmartCollectionsPage.tsx`, `components/ui/GlobalButtonTooltips.tsx`, `features/imports/RembrAddFlow.tsx`, `features/knowledge/RembrKnowledgeGraphPanel.tsx`, `features/library/RembrCheckupPanel.tsx`, new `features/library/collection-items.ts` (paths relative to `apps/web/src`).
- Public surfaces: `apps/web/src/marketing-site.css`, `features/marketing/Landing.jsx`, `features/marketing/PortedLanding.tsx`, `features/marketing/PricingPage.jsx`, `features/marketing/PublicPages.tsx`, `types/ported-pages.d.ts` (feature/type paths relative to `apps/web/src`).
- Verification/configuration: `apps/api/test/collection-card-contract.test.ts`, `.env.example`, and this report.
