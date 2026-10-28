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

The marketing identity is deliberately separate from the Daybreak application palette. It uses a warm paper field with a fine grid, deep plum text, butter-yellow and hot-pink keyword highlights, mint panels, soft paper cards, and an editorial composition. The visual signature is an illustrated saved-page card with overlapping “scoop” shapes and small collectible stickers. It should read as tactile and friendly, not as a literal dessert shop. The headline treatment takes inspiration from [Teak](https://teak.io/?ref=unsection.com); Rembr keeps its own copy, illustration, layout, and identity.

| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `--ice-cream` | `#F7F6EF` | Main page background and grid |
| Surface | `--ice-paper` | `#FFFEFB` | Cards and form surfaces |
| Text | `--ice-ink` | `#35191F` | Headings, controls, and primary action |
| Muted text | `--ice-muted` | `#65545A` | Body copy and secondary links |
| Primary | `--ice-peach` | `#F2DD43` | Main CTA and yellow keyword highlight |
| Secondary | `--ice-pistachio` | `#C9F1DF` | Announcement bar, panels, and mint keyword highlight |
| Accent | `--ice-cherry` | `#ED5BA2` | Pink keyword highlight and small accents |
| Supporting green | `--ice-blueberry` | `#1D8061` | Illustration and focus contrast |

The application keeps its approved Daybreak palette and type scale. The marketing site uses Space Grotesk Bold for display and DM Sans for body/UI; Integrate is reserved for one highlighted keyword in a heading or subheading. The marketing wordmark uses Space Grotesk. These identities should not bleed into each other through global selectors. An Integrate webfont asset is not currently present in the repository, so the CSS falls back to Space Grotesk until a webfont-licensed asset is supplied. Creative Fabrica lists web-font embedding under its Enterprise Web Font license; do not bundle the font under a license that does not grant that right ([license terms](https://www.creativefabrica.com/enterprise-license/)).

## Reference boundary

The live IScraper marketing page was visually reviewed on 2026-10-28. Its dark canvas, white display type, neon lime CTA, orange highlights, motion, and oversized hero informed hierarchy and energy only. Rembr's cream-and-sorbet palette, wordmark, copy, illustration, and page composition are independent. Do not reuse IScraper's logo, text, page assets, or brand colors.

The Teak homepage was visually reviewed on 2026-10-28 for the oversized heavy headlines, single retro keyword highlight, compact announcement strip, and crisp contrast. Treat this as a visual reference only; keep Rembr's product claims and original composition.

## Open exploration: original Rembr display typeface

**Status:** Feasibility discussed only; no typeface design or implementation is approved.

The user asked whether Rembr could create an original display typeface with a feel very similar to Integrate. This is technically feasible. If pursued, draw original glyphs from broad retro-modern design traits; do not trace Integrate's font file or letterforms. Decide glyph coverage, tooling, licensing, and visual review criteria before implementation. Until the user approves that work, keep the existing Space Grotesk fallback for highlighted keywords. The user's question is not approval to begin font production.

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
