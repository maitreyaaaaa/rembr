# Web and UI audit supplement

Scope: reviewed all 67 files under `apps/web/src` by inventory; inspected route/auth shell, error/loading patterns, modals, tabs, external navigation, API calls, local storage, rich-content sinks, and major feature areas. No dynamic HTML injection sink (`dangerouslySetInnerHTML` / `innerHTML`) was found. Automated browser/a11y scans and assistive-technology tests are absent, so this is source review rather than WCAG conformance evidence.

ID: WEB-001 | Severity: Medium | Confidence: LIKELY
Location: apps/web/src/App.tsx:L124
Problem: The demo introduction is announced as a modal dialog (`aria-modal="true"`) but does not move focus into the dialog, constrain keyboard focus to it, restore focus on close, or handle Escape. Keyboard and screen-reader users can move through the background sign-in form while the page claims the dialog is modal.
Evidence: The dialog is rendered as a raw `<section role="dialog" aria-modal="true">` at line 124. Its controls only close by click; the component has no dialog ref, focus effect, keydown handler, or shared Dialog primitive. A search of `apps/web/src` finds other modal implementations and Base UI dialog usage, but none is wired here. The browser's default tab order therefore includes background controls.
Impact: A keyboard or screen-reader user may not understand or control the foreground choice prompt and can interact with obscured sign-in controls.
Fix: Replace this bespoke markup with the established accessible dialog primitive or add initial focus, focus containment/restoration, Escape handling, and a regression test for keyboard behavior.
Tier: 2 | Effort: S | Risk of fix: Med | Depends on: none

Disposition: do not change automatically in this audit continuation because there is no web interaction test suite or existing browser harness to satisfy Tier 2's verification requirement. Add a keyboard/browser regression test first, then fix and manually verify against the precise steps in `audit/NEEDS_USER.md`.

## Additional review notes

- Auth form fields have explicit labels, password visibility has a dynamic accessible name, and async form errors use `role="alert"` (`App.tsx:121-123`).
- Lazy-loaded routes use a loading status (`App.tsx:38`).
- API requests generally use the shared client, and viewed feature pages include loading/error handling and cleanup guards for effects. A repository-wide effect lifecycle review was not exhaustive.
- `App.tsx:124` is the only actionable Medium issue confirmed in this pass. Several controls use tab roles; source review alone did not establish a user-blocking keyboard defect in the tabs.
- Automated contrast testing, screen-reader testing, browser interaction walkthroughs, zoom/reflow testing, and real device testing were not run. No production UI was accessed.
