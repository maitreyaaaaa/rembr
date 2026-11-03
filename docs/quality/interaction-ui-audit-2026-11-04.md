# Interaction UI audit — 2026-11-04

## Scope and principles

Follow-up to the folder interaction fixes: inspect the small controls and transient states that a broad page-layout review can miss. Keep Rembr's established styling; change spacing where a component wastes space or clips content, rather than shrinking the entire site.

References: [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), and the local baseline-ui skill. Apply the existing Base UI dependency for focus, Escape, outside dismissal, tab activation and associations. This is a targeted usability review, not a WCAG conformance certification.

## Findings and fixes

| Finding | Result |
| --- | --- |
| Quick Add declared a modal but left focus behind it. Background controls remained accessible; closing during an active save was inconsistent. | Base UI Dialog contains focus, restores it to the trigger, handles Escape/outside dismissal, and blocks dismissal/back navigation while saving. |
| Quick Add's menu stretched to the viewport bottom with a large empty area and could clip on short screens. | Menu fits its content with a viewport height cap and internal scrolling. Longer forms retain their scrollable drawer. |
| Add Saves, authentication, and graph tabs used ARIA roles without standard arrow-key navigation. | Base UI Tabs supplies roving tab stops, arrow/Home/End navigation, selected state, and panel associations. Add tabs stay disabled during an active operation. The Add tab container has tighter spacing and stays two columns at 320px. |
| Lazy password checks suspended the whole authentication screen, losing tab focus. | Password loading has a local Suspense boundary. Empty registration cannot be submitted while the field loads. |
| Global tooltips repeated labels such as Save a link and remained after navigation/unmount. | Visible labels explain ordinary controls; tooltips remain for icon-only controls or explicit help. Click, pointer press, and trigger removal dismiss them. |
| Three AI/privacy switches had no accessible name; Settings nested a main landmark inside another main. | All four switches have names, and Settings uses a labeled section. No consent behavior changed. |
| Key revocation used a custom alert overlay without focus containment. Failure appeared behind it. | Base UI AlertDialog initially focuses Cancel, contains focus, and displays action errors inside the confirmation. Tested only with a synthetic key and synthetic failure. |
| The selected MCP tab inherited an important lime text rule on a light background. | Selected text is dark (#16181a) on #eef0f2. Computed colors verified. |
| Item drawer's handwritten focus loop skipped inputs; image preview had no dialog/focus behavior. | Base UI Dialog handles the drawer and nested image preview. Tag search has an explicit label. Escape closes only the innermost preview and returns focus to its image button. Removed the existing 500ms JS entrance motion. |
| Personal notes displayed the page-only Reprocess action. | Retry/Reprocess actions are restricted to saved pages. |
| Mobile More placed links before its trigger, so opening it did not take focus into the panel. | Base UI Popover focuses the first link, restores focus on Escape, and positions the panel within viewport bounds. |

## Evidence and coverage

Live signed-in review: library Pins/List, an existing saved-page drawer, Add Saves link/archive tabs, import history, Settings sections, developer key form (no key created), MCP access, checkup and graph. Reproduced Quick Add's focus remaining behind the modal, nonworking Add arrow keys, unnamed privacy switches, stale tooltips across navigation, and the selected MCP contrast issue. Existing collections were the starting screen; no collection refresh was triggered.

Post-fix local review used the actual App and components with temporary synthetic fetch responses. No production account, API, credential, provider, upload or stored data was involved. The fixture rejected all mutations. It was removed before delivery.

Verified locally:

- Quick Add: initial focus, forward wrap, Escape, return to trigger, link/note subforms, short-screen menu scrolling and viewport bounds.
- Add/auth/graph tabs: arrow activation, selected panel and roving tab stops; authentication Home navigation and focus retention after password loading.
- Library: Pins/Gallery/List and long-title wrapping; no document overflow at measured desktop/mobile sizes.
- Item drawer: tag-search input participates in focus containment; personal notes have no Reprocess action; image preview traps focus, Escape closes only the preview and restores its invoking image button; parent Escape closes the drawer.
- Key confirmation: Cancel initially focused, wrap stays inside, synthetic failure appears inside, cancellation closes without changing a key.
- Settings: one main landmark, four named switches, no horizontal document overflow at 320px.
- MCP: computed selected text/background contrast colors and 320px bounds.
- Mobile More: first-link focus, Escape restoration, bounded positioning.

Measured local viewports include 320×640, 390×700, 1280×720 and a short desktop viewport. Viewport dimensions were read from each inspected tab because browser overrides affect the selected tab. Physical touch, screen-reader output, OS text scaling and every provider/network failure were not tested. Public marketing/legal pages and profile setup were covered by the previous audit; this pass focused on app interaction surfaces. Existing note-edit/import-detail states were source-reviewed, not newly mutated or exhaustively exercised.

## Checks and delivery

Full `npm run check` passed: API/web typecheck, lint, all 145 tests, and API/web production builds. Web lint was repeated after the last authentication adjustment; the final web build also reran typecheck. `git diff --check` passed. Vite still warns about the main (908 kB minified) and password-strength (1,663 kB) chunks; bundle splitting remains performance work. No new packages were added.

Changed files: `apps/web/src/App.tsx`, `components/ui/GlobalButtonTooltips.tsx`, `features/imports/RembrAddFlow.tsx`, `features/items/RembrDetailDrawer.tsx`, `features/knowledge/RembrKnowledgeGraphPanel.tsx`, `features/settings/DeveloperAccessPage.tsx`, `features/settings/SettingsPage.tsx`, `styles.css`, and `styles/app-mobile.css` (all component/style paths relative to `apps/web/src`). No package or backend change.

Production has not been deployed by this audit. The previous stored-collection migration/worker rollout remains a separate gate. Existing native browser confirmations in deletion flows remain; this pass did not execute deletions or replace all confirmation surfaces. No blanket padding or radius reduction was warranted.
