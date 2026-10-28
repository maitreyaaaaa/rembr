# Rembr marketing positioning and identity

**Status:** Implemented marketing direction, 2026-10-28  
**Product evidence:** [Phase 1 implementation record](../rebuild-plan/phase-1-record.md), [current product design brief](../screens/rembr-design-system-brief.md), [phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md).

## Position

Rembr is an early personal library for public web pages a person chooses to save and read again. The current promise is intentionally small: submit a public URL, let the service prepare readable text, and return to the saved copy or its original source from a signed-in library.

### What we are

- A personal shelf for selected public pages.
- A save-and-return workflow that keeps the source link beside extracted text.
- A focused early product whose limits are visible to visitors.
- A product whose current implementation is deterministic capture and retrieval, not AI magic.

### What we are not

- A bulk crawler, a social-media downloader, or a way to bypass sign-in or paywalls.
- A guarantee that every public page can be fetched or extracted perfectly.
- A browser extension, AI answer engine, semantic search product, or automation platform in this release. Such capabilities must not appear as available product features until they are implemented and verified.
- A replacement for the original publisher or source; saved text keeps a link to its source.

## Audience and message

**Audience:** people who find useful public articles and web pages and want a simple way to return to them.  
**Primary job:** keep a page for later without depending on an open tab.  
**Primary action:** open or create a Rembr library.  
**Secondary action:** learn what the current product supports or send product feedback.

**Core message:** “Keep the good stuff. Find it when you need it.”  
**Supporting message:** “Save a public page once. Come back to a clean, readable copy with the original link right there.”

## Voice

- Warm, direct, and lightly playful. The metaphor is a small treat or a calm reading shelf; never childish or sugary at the expense of clarity.
- Lead with the user's task and the implemented outcome.
- Say “public page,” “readable copy,” and “source link” when those details matter.
- State product limits plainly. Do not use “all your web,” “never lose anything,” “works everywhere,” “private by design,” or unverified performance/security claims.
- Do not invent pricing, testimonials, supported-site counts, usage figures, availability promises, or team contact details.

## Marketing visual system: Soft Serve Editorial

The marketing identity is deliberately separate from the Daybreak application palette. It uses a warm paper field, dark cocoa text, fruit-sorbet accents, soft paper cards, and an editorial composition. The visual signature is an illustrated saved-page card with overlapping “scoop” shapes and small collectible stickers. It should read as tactile and friendly, not as a literal dessert shop.

| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `--ice-cream` | `#FFF9EF` | Main page background |
| Surface | `--ice-paper` | `#FFFDF8` | Cards and form surfaces |
| Text | `--ice-ink` | `#352528` | Headings, controls and primary action |
| Muted text | `--ice-muted` | `#75666A` | Body copy and secondary links |
| Primary flavor | `--ice-cherry` | `#DC5368` | Highlight and small CTA emphasis |
| Secondary flavor | `--ice-blueberry` | `#6874C8` | Illustrations, secondary emphasis |
| Accent flavor | `--ice-pistachio` | `#A8BD82` | Decorative notes and illustration |
| Supporting flavor | `--ice-peach` | `#F5C9AC` | Card art and warm panels |

The marketing site uses Space Grotesk Bold for display and DM Sans for body/UI. The app uses its approved product scale: Space Grotesk Bold for all application headings and DM Sans for body, metadata, and controls; the Daybreak palette stays scoped to product screens. The Rembr wordmark may retain Open Sauce Sans if used in the application. The marketing wordmark uses Space Grotesk. These identities should not bleed into each other through global selectors.

## Reference boundary

The live IScraper marketing page was visually reviewed on 2026-10-28. Its dark canvas, white display type, neon lime CTA, orange highlights, motion, and oversized hero informed hierarchy and energy only. Rembr's cream-and-sorbet palette, wordmark, copy, illustration, and page composition are independent. Do not reuse IScraper's logo, text, page assets, or brand colors.

## Motion and access

- Use short CSS reveal, float, marquee, and card-hover motion to support the soft editorial metaphor.
- Respect `prefers-reduced-motion`; motion must not contain essential information.
- Keep navigation, page content, and form labels available to keyboard and assistive technology users.
- Recheck text contrast for any palette changes. Do not rely on color alone for product status.
- Keep navigation usable at 320px and preserve visible focus.

## Launch gate and unresolved configuration

The contact page requires `VITE_CONTACT_EMAIL` in the web build environment for its email-draft action. No support address was found in the current repository; the contact page therefore reports that the address is not configured and disables sending until a real address is supplied. Do not replace this with an invented address. Current marketing prices and a legal/company identity were not present in the reviewed project, so the site does not invent pricing, company claims, or policy text.

## Related docs

- [Marketing page map and content](./page-map-and-content.md)
- [Application typography decision](../../screens/rembr-design-system-brief.md)
- [Current screen specifications](../../screens/ui-surface-and-screen-specifications.md)
- [Current implementation evidence](../rebuild-plan/phase-1-record.md)
