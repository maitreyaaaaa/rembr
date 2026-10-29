# Rembr voice and copy guidelines

**Status:** Working standard, researched and applied 2026-10-29  
**Applies to:** Public marketing pages, signed-in application, onboarding, forms, notifications, and product emails.

## Product context

Rembr brings saved social posts and useful web links into one library, keeps their sources beside personal notes, and makes them easier to find again. Instagram, Pinterest, and X exports are the current supported saved-post imports; public links can be saved directly. The intended launch story includes the full phase roadmap. Every capability remains a planned claim until its phase is implemented and verified. Do not imply that a planned action is currently available.

The audience is intentionally broad because this repo has no user interview language or search analytics to justify a narrow segment. Treat query phrases below as candidates, not measured demand.

## Voice

- **Plainspoken:** use words people use for their task: bring in saved posts, save a link, add a note, search your library, open the source.
- **Warm, with restraint:** let a headline have character; keep forms, status, settings, and errors direct.
- **Specific:** say what will happen and what the user can do next. Avoid vague promises such as “make it yours” where the interface needs to explain an action.
- **Respectful:** no guilt, fake urgency, invented social proof, or pressure to connect or share.
- **Consistent:** call saved material a post, link, note, or bookmark according to its actual type. Name platform import limits where they affect the task. Use “library” for the whole collection.

## Writing rules

1. Start with the user's task or the result they want.
2. Give each section or message one job. Remove a sentence if the headline already does that job.
3. Use one strong page title. Add a short description only when it clarifies the product, the next step, or a limitation.
4. Do not add an eyebrow, kicker, status chip, or explanatory subtitle by default. Keep a label only when it helps someone orient, scan a real sequence, or understand a control.
5. Use sentence case. Keep marketing headlines expressive, but keep product labels literal.
6. Name actions with verbs and name destinations with nouns. Examples: “Save a page,” “Open the source,” “Search your library,” “Account settings.”
7. Explain a limitation beside the choice it affects. For an error, say what happened and how to recover.
8. Do not use hover copy, cursor-follow effects, decorative grids, or animation to supply meaning that the words and layout should carry.

## Marketing pages

- **Home:** name saved posts as the product's starting point, then explain imports and link saving in ordinary language. Name Instagram, Pinterest, and X exports where relevant; do not imply direct sync or platform exports for Facebook and LinkedIn. Keep one clear secondary path for people who want to understand the product first.
- **Features:** organize the story by the user's sequence: save, organize, find again, stay in control. Explain supported sources where they matter. Keep feature claims gated by phase evidence until launch.
- **About:** explain the point of view in a few concrete paragraphs. Avoid repeating the hero in a manifesto or several slogan-like section headers.
- **Contact:** set the expectation that the form opens an email draft and does not send or store it. Keep required field labels visible.
- **Search:** use likely phrases naturally, such as “save web pages,” “saved links,” “personal library,” and “search your library.” Do not repeat them to hit a word count or add SEO-only sections.
- **Search snippets:** every route gets a distinct, accurate title and a short description based on that page. Keep the visible H1 clearly dominant; do not stuff keywords into headings.

Candidate query language is based on the product category and common user tasks, not keyword-volume research. Once the site is publicly available, use Search Console query data and user research to replace guesses with observed language.

## Product interface

### Labels and buttons

- Prefer “Save a page” over “Capture”; “Search your library” over “Find your way back”; “Open source” over “Read original.”
- Keep an input label tied to the field. Placeholder text is an example or format hint, not a replacement label.
- The button should tell the user what it does. If it opens another app, say so: “Open email draft.” If it starts a consequential workflow, say “Review action” before “Approve and continue.”
- Keep success states short: “Page saved,” “Export ready,” “Changes saved.”

### Help, empty, loading, and error states

- Start with no extra helper text. Add a hint only when people need it to complete the task or make a decision.
- Empty state: say what is missing and offer the next useful action. Example: “No saved pages yet. Save a page to start your library.”
- Loading state: use the current action, such as “Searching your library…”
- Error state: name the outcome and recovery. Example: “Could not save this page. Try again.” Give a more specific cause when the system knows it.
- Avoid “Oops,” “Something went wrong” without recovery, blame (“you forgot”), generic “invalid,” and technical error codes.

### AI and external actions

- Say when AI is optional, what information it uses, and where its answer comes from. Keep citations next to claims.
- Never present a draft as a completed action. Show the action, destination, and approval step before anything leaves the library.
- Keep consent and deletion language literal. Do not soften a meaningful consequence with a playful headline.

## Psychology applied

These models guide copy toward understanding and informed action, not pressure. Scores use the marketing-psychology skill's formula and are capped at 15.

### Mental model: reduce cognitive load

**PLFS:** `+15` (high-confidence)

- **Scores:** leverage 5 + fit 5 + speed 4 + ethics 5 - cost 1 = 18, capped at 15.
- **Why:** fewer repeated instructions leave more attention for the decision or task.
- **Apply:** remove redundant labels and explanations; one clear action per section; use the same product terms in navigation, search, and item details.
- **Test:** ask someone to name the next step after a quick scan; compare task completion and errors before and after.
- **Guardrail:** do not remove information a person needs to make a safe or informed decision.

### Mental model: recognition over recall

**PLFS:** `+15` (high-confidence)

- **Scores:** leverage 5 + fit 5 + speed 4 + ethics 5 - cost 1 = 18, capped at 15.
- **Why:** familiar task words and visible context make actions easier to recognize than to infer from a metaphor.
- **Apply:** use familiar task words, visible field labels, useful defaults, and source context beside saved content.
- **Test:** check whether a first-time user can find and describe the save, search, and source actions without coaching.
- **Guardrail:** familiar terms must still describe Rembr's real behavior; avoid implying support for a source or action that is not implemented.

### Mental model: autonomy and informed choice

**PLFS:** `+15` (high-confidence)

- **Scores:** leverage 5 + fit 5 + speed 3 + ethics 5 - cost 2 = 16, capped at 15.
- **Why:** people are more willing to use automation when they can see what it will do and remain in control of the final action.
- **Apply:** explain external actions before execution; make review and approval steps explicit; let users control what they save and share.
- **Test:** verify that people can explain what leaves the library and what approval does before they opt in.
- **Guardrail:** never use dark patterns, false scarcity, guilt, or hidden opt-outs to increase conversion.

## Research basis

- Nielsen Norman Group's microcopy guidance prioritizes clarity, then concision, while allowing character when it helps. It also emphasizes leading with the information users need most. [The 3 C's of informational microcopy](https://www.nngroup.com/articles/3-cs-microcopy/)
- GOV.UK advises using the same language as users, minimizing cognitive load, starting with less copy, and adding help text when research shows it is needed. It also recommends short, direct sentences and useful link labels. [Writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces)
- GOV.UK error guidance recommends plain, specific messages that say what happened and how to fix it. [Error message guidance](https://design-system.service.gov.uk/components/error-message/)
- Google Search Central recommends people-first content, distinct and concise titles, accurate descriptions, and natural language rather than keyword stuffing. [People-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [title links](https://developers.google.com/search/docs/appearance/title-link), and [SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## Review checklist

- Can someone understand this without reading the paragraph beneath it?
- Does each sentence add a fact, benefit, or next step?
- Does the copy use the same words as the control or feature it describes?
- Is the action, limitation, and outcome honest?
- Is this SEO phrase useful to a person on this page, or only present for ranking?
- Could a label or decorative effect disappear without making the page harder to use?
