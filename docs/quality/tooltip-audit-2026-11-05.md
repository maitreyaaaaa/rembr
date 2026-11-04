# Tooltip audit — 2026-11-05

## Scope and rule

Reviewed the web app source for tooltip components, `data-tooltip`, native `title` attributes, and the global button tooltip manager. An accessible name (`aria-label`) describes a control to assistive technology; it does not automatically justify repeating that text in a visual tooltip. Add a tooltip only when a control needs extra explanation, using an explicit `data-tooltip` opt-in.

## Findings and fixes

| Finding | Fix |
| --- | --- |
| `GlobalButtonTooltips` inferred visual tooltip text from every icon-only control's `aria-label`, causing repeated tooltips across the application. | The global manager now shows only explicit `data-tooltip` text. Existing accessible names remain on their controls. |
| The image-search plus control had a native `title` duplicating its accessible name. | Removed its `title`; the control keeps its accessible label. |
| The marketing landing profile button had a native `title` duplicating its button label. | Removed the `title`. |
| The library search mode label was “Web + library”, followed by an explanatory paragraph and a “Search both” action button. | Renamed the mode “AI + saved”, removed the paragraph and button, and submit web search with Enter. Shift+Enter inserts a newline; Ctrl/Cmd+Enter remains supported. Repeated submissions are ignored while the search is busy. |

The removed paragraph was the only source copy found in the marketing/help UI explaining that web-mode queries go to public search. The composer is simpler per request; the Settings → AI & privacy footnote now explains that submitted live web searches send the query to OpenRouter and its web-search provider, and that their processing and retention terms may apply.

## Source scan

- `GlobalButtonTooltips` is the only tooltip implementation in `apps/web/src`.
- No control currently opts into a visual tooltip with `data-tooltip`.
- Removed native titles from the two app controls above. Other `title` occurrences found are React component props or document/page titles, not tooltip attributes.
- Visual-search consent and availability notices remain conditional notices; they explain consent or service state rather than repeat control labels.

## Verification

- Typecheck, lint, and API/web production builds passed.
- `git diff --check` passed.
- The API test suite was not run for this UI-only change. Browser/screen-reader review was not performed.
- The build retains the existing Vite large-chunk warnings.
