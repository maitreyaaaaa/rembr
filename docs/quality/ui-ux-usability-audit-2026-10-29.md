# Rembr UI/UX usability audit — 29 October 2026

## Scope and method

Reviewed the current React app and shared stylesheet against the supplied principles (status visibility, recognition over recall, clear error recovery, one dominant action, brand fit, and nested-corner geometry), the Vercel Web Interface Guidelines, WCAG 2.2 target guidance, and foundational HCI literature. This is a code-informed heuristic audit, not a moderated usability study or a claim of WCAG conformance. The signed-in flow was not exercised with a test account.

## What the research supports

| Principle | Evidence and practical reading |
| --- | --- |
| Decision time and choice | Hick–Hyman describes choice reaction time in constrained stimulus/response tasks. A CHI 2020 review warns that it does **not** prove “fewer choices are always better” for real HCI; visual search, labels, familiarity, and decision difficulty matter. Group genuinely secondary routes and make the current location legible; do not hide useful features merely to reduce a count. |
| Target size and distance | Fitts’ 1954 motor-control experiments established a relationship between movement time, distance, and target width for aimed movements. This supports generous, reachable controls, especially for frequent/high-consequence actions; it is not a universal pixel-size formula for every UI. WCAG 2.2 AA sets a 24×24 CSS-pixel minimum subject to exceptions; 44×44 is an enhanced criterion and a useful touch target, not the AA baseline. |
| Beauty and perceived ease | Tractinsky’s 1997 replication found a strong correlation between judged aesthetics and **apparent/perceived** usability for ATM layouts. It does not establish that attractive interfaces are functionally easier or more efficient. Keep visual quality and task usability as separate acceptance checks. |
| Recognition and recall | HCI literature describes recognition as identifying a visible cue, while recall requires retrieving information from memory. Which is better depends on the task, space, repetition, and context. Keep filters and location visible/recoverable; do not turn every possible choice into permanent chrome. |
| Responsiveness and feedback | The widely repeated “Doherty threshold” comes from IBM systems-response work, not a universal UX law that every operation must finish within 400 ms. Give immediate, truthful feedback for asynchronous work; keep it visible until completion and avoid fake progress. |
| Interface consistency and states | Vercel’s Web Interface Guidelines are a practitioner checklist, not a peer-reviewed standard. They are useful for keyboard access, focus, state feedback, reduced motion, semantic controls, and predictable navigation. WCAG remains the normative accessibility reference. |

## Findings and disposition

| Priority | Finding in the reviewed code | User impact | Change in this pass / follow-up |
| --- | --- | --- | --- |
| P1 | Signed-in app tokens still used the earlier blue/mint palette while the agreed brand is warm yellow, orange, and ink. | App and marketing felt like separate products; brand recognition and perceived polish suffered. | Rebased the app tokens on pale yellow canvas, warm paper surfaces, ink text/actions, and orange accent. Kept orange away from small text on yellow. Verify color contrast against rendered states before claiming conformance. |
| P1 | Library item links discarded the source URL/query, and detail views always returned to `/app`. | Search terms, filters, sort, and pagination context were lost; users had to reconstruct their place. | Added a shared saved-item link that carries the current path and query into item detail; detail, edit, and note paths preserve the return view. `sameAppPath` constrains return navigation to app paths. |
| P1 | Six major destinations sat as peers in the desktop/mobile app nav. | More scanning and cramped wrapping on mobile; navigation did not distinguish frequent from occasional destinations. | Kept Library, Collections, and Smart collections directly available; grouped Imports, Tags, Connections, Review, and Settings under a native disclosure. The active secondary destination still marks “More.” |
| P2 | Generic `Error.message` handling could surface browser/network wording such as “Failed to fetch.” | Technical wording tells users neither what failed nor what action is useful. | Only API errors with a numeric HTTP status can contribute their message; network/runtime failures use the existing action-specific plain-language fallback. Server 5xx responses are sanitized by the API handler. |
| P2 | Broad `.phase2-panel:hover` changed the appearance of non-interactive containers. | Decorative panels looked clickable and created false affordances. | Removed the hover transition/change from non-interactive panels. Clickable cards and controls keep their own affordances. |
| P2 | Nested manual/smart collection cards used nearly equal corner radii despite inset spacing. | Nested surfaces read as stacked boxes rather than a coherent container. | Set outer collection group radius to 32px with a 16px inset and inner card radius 16px (outer = inner + inset). |
| P2 | App buttons and navigation controls varied in hit-area height. | Harder pointer/touch activation, especially on mobile and for repeated actions. | Raised quiet buttons, primary buttons, auth tabs, app navigation, and avatar/password controls to 44px minimum where applicable. This exceeds WCAG AA’s 24px minimum for relevant controls. |

## Existing strengths observed

- Search filters are reflected in the URL and an active-filter summary; the app exposes clear-filter actions.
- Loading, processing, and many success/error states already have visible copy and live-region roles. Import states include progress; async job statuses refresh while active.
- Destructive removal has a confirmation step; AI use requires explicit opt-in and has a separate explanation.
- Global keyboard focus styling and reduced-motion rules are present. The marketing motion code uses scoped/reduced-motion handling.
- Main library actions already have a clear hierarchy: “Save a page” is primary, while “New note” is quieter.

## Remaining review points

- Loading placeholders on Tags, Collections, and related app views now announce `role="status"`; verify the announcements with a screen reader in the signed-in walkthrough.
- Smart collection cards expose Open, Rename, Pin, and Hide actions together. Consider making Open the clear primary action and moving occasional management actions into a per-card menu after a task-based check.
- The library opens with six filter controls beside search. Keep the high-frequency controls visible and test whether Status, Tag, and Collection belong in an expandable “More filters” group. Hick’s law alone is not enough reason to hide them; confirm the actual search tasks first.
- Inspect all destructive, retry, pause, and reprocess states with real users; verify their copy tells what happened, why, and what to do next for each server response.
- Validate rendered contrast, narrow viewport overflow, keyboard operation of the native “More” disclosure, and assistive-technology announcements in a signed-in browser session. This pass has no test account and cannot claim those results.
- Measure response timing using realistic production-like network conditions. The code audit cannot prove perceived speed or the effectiveness of loading indicators.

## Source notes

- Vercel Web Interface Guidelines: https://github.com/vercel-labs/web-interface-guidelines/blob/main/README.md
- WCAG 2.2 SC 2.5.8 (AA) target size minimum: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- WCAG 2.2 SC 2.5.5 (AAA) target size enhanced: https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced
- Hick, W. E. (1952), “On the rate of gain of information”: https://journals.sagepub.com/doi/10.1080/17470215208416600
- Z. Y. G. Chen et al. (CHI 2020), “How Relevant is Hick’s Law for HCI?”: https://doi.org/10.1145/3313831.3376878
- Fitts, P. M. (1954), “The information capacity of the human motor system”: https://courses.cs.washington.edu/courses/cse510/16wi/readings/fitts1954.pdf
- Tractinsky, N. (1997), “Aesthetics and Apparent Usability”: https://chi1997.acm.org/proceedings/paper/nt.html
- “Commands and navigation,” *Introduction to Human-Computer Interaction*, recognition versus recall: https://doi.org/10.1093/oso/9780192864543.003.0027
- Doherty & Thadhani, IBM, “The Economic Value of Rapid Response Time”: https://www.e-com-net.com/article/1251327.htm (industry report; treat the 400ms shorthand as context-specific, not a blanket interface threshold).
