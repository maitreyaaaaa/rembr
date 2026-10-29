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

## Additional principles supplied for this review

These principles overlap. Their names do not make them equally strong evidence: some are controlled psychological effects, some are perceptual principles, some are HCI heuristics, and some began as networking guidance or satire. I’m using them as questions to test against real Rembr tasks, not as a scorecard where every screen must visibly demonstrate every item.

| Principle (normalized name) | Evidence strength and useful interpretation | Rembr application |
| --- | --- | --- |
| Hick–Hyman law | Experimental choice-reaction relationship; it does not mean every longer menu is slower in real UI or that fewer options are always better. | Keep primary destinations and main actions obvious. Collapse only secondary controls when they are truly occasional; measure actual task success before hiding library filters. |
| Fitts’ law | Experimental model of aimed movement time involving target width and distance. “Minimize target distance” is a design implication of Fitts’ law, not a separate law. | Keep frequent/high-consequence controls large, spaced, and near their context. The 44px app-control baseline helps; keyboard access and undo remain necessary. |
| Jakob’s law | Practitioner heuristic about users’ expectations from other sites, rather than a physical law. | Keep familiar navigation, search, disclosure, form, and back patterns; let Rembr’s visual identity show through color/type/illustration rather than novel control behavior. |
| Law of proximity | Gestalt perceptual grouping: nearby elements tend to be perceived as related. | Keep each label next to its field, filters inside one filter panel, and item actions with the item they affect. |
| Law of similarity | Perceptual grouping by shared appearance. | Reuse button and status styles consistently, while preserving a strong distinction between the primary action and quiet management actions. |
| Uniform connectedness | Grouping by a shared enclosed/continuous region can dominate proximity or similarity cues. | Keep related controls and data inside the same surface; use nested collection cards only when the inset and radius make parent/child structure clear. |
| Law of Prägnanz (good form) | Gestalt principle describing a tendency toward simple, stable perceptual organization; it is not a mandate to strip away useful detail. | Prefer clear sectioning and recognizable shapes, while retaining state, provenance, and recovery details users need. |
| Miller’s “magical number seven” | Miller reviewed limits in specific absolute-judgment and immediate-memory tasks; 7±2 is not a universal limit on visible UI controls. Chunking and familiarity matter. | Don’t cap the library at seven filters or seven destinations. Use meaningful groups, labels, and progressive disclosure where testing shows benefit. |
| Von Restorff / isolation effect | Experimental memory effect: an item isolated from a similar list may be remembered better; salience can also create distraction and bias. | Reserve strong contrast for the action or status that matters in that context. Don’t color every card or control as a competing exception. |
| Serial-position effect | Primacy/recency are memory findings in ordered recall; online selection results vary by task and environment. | Put the most-used destination first based on product tasks, not because first/last position guarantees attention. Do not bury critical actions at the end of a long menu. |
| Peak–end rule | Retrospective ratings in specific experiments can be disproportionately influenced by the peak and ending. This is not a universal UX-quality formula. | Give save/import flows a truthful, calm completion state and a useful next action; never manufacture a “delightful ending” to mask earlier failure. |
| Zeigarnik effect | The proposed memory advantage for interrupted tasks is inconsistent; a 2025 meta-analysis found no average recall advantage, though resumption tendencies were more reliable. | Preserve drafts and show resumable queued/paused work. Never add artificial interruptions, nagging, or incomplete loops to drive engagement. |
| Tesler’s law (conservation of complexity) | Interaction-design maxim, not a validated physical law: unavoidable complexity can be handled by the system or the user. | Let Rembr parse expected export variations and supply sensible defaults, but keep risky ambiguity visible and provide overrides for advanced users. |
| Postel’s robustness principle | Networking guidance from RFCs, not a general permission to accept ambiguous UI input. Modern standards guidance warns that over-tolerance can shift ambiguity/security risk to receivers. | Accept documented export variations; validate URLs, file bounds, ownership, and consent strictly. Give users a clear correction path for rejected content. |
| Parkinson’s law | Originated as a satirical observation about bureaucracy and available time, not an interaction-design law. | Avoid arbitrary timers/countdowns. Use honest limits and due dates only when the task or user set them. |
| Ockham’s law / Ockham’s razor | These names refer to the same parsimony principle; it is a philosophical heuristic, not a rule to minimize UI at any cost. | When designs work equally well, prefer fewer steps and less explanatory chrome. Keep meaningful states and recovery controls even when they add complexity. |
| Pareto principle (80/20) | A useful distribution heuristic, not a guarantee that 80% of Rembr use comes from 20% of features. | Use privacy-safe aggregate task evidence to decide what stays prominent. Until that evidence exists, do not remove infrequent but necessary recovery, organization, or settings actions. |

## Updated app crosswalk

| Area | Principles applied | Current assessment |
| --- | --- | --- |
| Workspace navigation | Jakob, proximity, Hick, serial position, Miller | Three high-frequency destinations remain visible; secondary destinations use a native disclosure whose closed label still identifies the current section. This follows a familiar convention and groups the occasional routes. Confirm prominence against real user-task frequency. |
| Library search | Hick, Miller, proximity, Prägnanz, Pareto | Search and five facets form one clear region; filter count is not itself a failure. The six controls can still crowd smaller screens. Test whether Type/Sort should stay visible while Status/Tag/Collection move into “More filters”; do not do so solely to satisfy a number. |
| Smart collection cards | Hick, Von Restorff, similarity, Tesler, Fitts | **Changed in this pass:** “Open group” is now the single primary action; Rename, Pin/Unpin, and Hide/Show sit under “Manage.” The management options remain nearby, keyboard operable, and 44px tall. |
| Saved-item actions | Fitts, proximity, recognition over recall | Actions stay attached to the item; context-preserving links keep the user’s place. Review mobile reach and destructive-action spacing in a signed-in session. |
| Loading, imports, and processing | Doherty, Zeigarnik, Postel | The app reports loading/progress and resumable states rather than invented completion times. Import parsing accepts recognized input variants while server validation remains bounded. Test announcement timing and recovery in a real session. |
| Save and error endings | Peak–end, Von Restorff, visibility of status | Success and failure states are explicit; network failures use plain-language fallbacks and API errors stay sanitized. Validate the complete save/import journey with users; a heuristic cannot prove satisfaction. |
| Nested collection surfaces | Proximity, similarity, uniform connectedness, Prägnanz | Outer/inner radii and inset now express a parent-child relationship. Confirm that card grouping stays legible at narrow widths and zoom. |

## Additional research sources

- Hick–Hyman law and its HCI limits (CHI 2020): https://doi.org/10.1145/3313831.3376878
- Miller (1956), *The Magical Number Seven, Plus or Minus Two*: https://doi.org/10.1037/h0043158
- Gestalt grouping review, including proximity, similarity, and uniform connectedness (Wagemans et al., 2012): https://pmc.ncbi.nlm.nih.gov/articles/PMC3482144/
- Jakob’s Law of Internet User Experience (NN/g practitioner heuristic): https://www.nngroup.com/videos/jakobs-law-internet-ux/
- Von Restorff effect / distinctiveness (APA Dictionary): https://dictionary.apa.org/distinctiveness-effect
- Serial position in web clicking (Murphy, 2006): https://doi.org/10.1111/j.1083-6101.2006.00025.x
- Peak-end source experiment (Kahneman et al., 1993): https://doi.org/10.1111/j.1467-9280.1993.tb00589.x
- Zeigarnik and Ovsiankina meta-analysis (2025): https://www.nature.com/articles/s41599-025-05000-w
- Tesler’s own conservation-of-complexity page: https://www.nomodes.com/larry-tesler-consulting/complexity-law
- RFC 7103 on risks in interpreting Postel’s robustness principle: https://www.rfc-editor.org/rfc/rfc7103
- Parkinson’s Law original essay (1955): https://www.agileleanhouse.com/lib/lib/_Misc/Parkinson%27s%20Law%20_%20The%20Economist.pdf
- Internet Encyclopedia of Philosophy on Ockham: https://iep.utm.edu/ockham/
- Pareto analysis as a quality heuristic (Juran Institute): https://www.juran.com/blog/a-guide-to-the-pareto-principle-80-20-rule-pareto-analysis/
