# Rembr marketing positioning and identity

**Status:** Implemented marketing direction, refreshed 2026-10-29
**Product evidence:** [Phase 1 implementation record](../rebuild-plan/phase-1-record.md), [current product design brief](../screens/rembr-design-system-brief.md), [phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md).

## Position

Rembr is a personal library for social posts and web links a person chooses to keep and find again. The marketing story may describe the complete Phase 4–6 product scope because the user plans to finish all phases before launch. Keep each capability clearly within the planned release and do not publish the site to users until every phase and launch gate is complete.

### What we are

- A home for saved social posts, public pages, and useful links.
- A save-and-return workflow that keeps the source link beside extracted text.
- A focused personal library whose saved items keep their source and context.
- A phased product whose launch claims must match implemented and verified behavior.

### What we are not

- A bulk crawler, or a way to bypass sign-in or paywalls.
- A guarantee that every public page can be fetched or extracted perfectly.
- A browser extension, AI answer engine, semantic search product, or automation platform in this release. Such capabilities must not appear as available product features until they are implemented and verified.
- A replacement for the original publisher or source; saved content keeps a link to its source.

## Audience and message

**Audience:** people who find useful things online and want to return to them.
**Primary job:** keep a post or link for later with enough context to find it again.
**Primary action:** open or create a Rembr library.  
**Secondary action:** learn what the current product supports or send product feedback.

**Core message:** “Never lose a post you meant to keep.”
**Supporting message:** “Bring Instagram, Pinterest, and X saved-post exports into one library. Save other public links directly; keep the source, add context, and find it again.”

## Voice

- Plainspoken in the product and warm with restraint in marketing. Let the headline carry personality; keep actions, forms, settings, and errors literal.
- Start with the user's task or the result they want. Use the same concrete words in the heading, control, and follow-up state.
- Add a description only when it explains the product, next step, or a limitation. Eyebrows and kicker labels are occasional navigation aids, not a default above headings.
- State product limits plainly. Do not use “all your web,” “never lose anything,” “works everywhere,” “private by design,” or unverified performance/security claims.
- Do not use guilt, false urgency, invented social proof, pricing, testimonials, supported-site counts, usage figures, availability promises, or team contact details.
- For SEO, use the language of real saving and retrieval tasks naturally. Give each route a unique, accurate title and description. Do not stuff keywords or add search-only sections.

See [voice and copy guidelines](./voice-and-copy-guidelines.md) for UI patterns, research basis, and review checklist.

## Marketing visual system: Bright archive

The marketing identity is deliberately distinct from the application palette. It uses sun yellow, red-orange, ink, warm paper, oversized editorial typography, tactile paper-like geometry, and a bespoke archive illustration. Color sections alternate with warm paper and ink fields to keep the composition readable and avoid a generic white SaaS look. The headline treatment takes broad inspiration from [Teak](https://teak.io/?ref=unsection.com); Rembr keeps its own copy, illustration, layout, and identity.

| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `--sun` | `#FBE02E` | Hero and selected large panels |
| Accent | `--orange` | `#FD4D1B` | Emphasis, graphic fields, and selected panels |
| Text | `--ink` | `#171411` | Headings, body text, controls, outlines |
| Warm paper | `--paper` | `#FFF9D9` | Breathing space, cards, and footer surfaces |
| App canvas | App token | `#FFF9D9` | Separate signed-in workspace background |
| Reading surface | App token | `#FFFEF6` | Saved-item reading and form surfaces |

The app retains its own visual tokens. Marketing uses Space Grotesk Bold for display and DM Sans for body/UI. The marketing wordmark uses Space Grotesk. Keep the two identities isolated through scoped styles. Integrate is not bundled; do not imply it is in use until an appropriately licensed asset is supplied. Creative Fabrica lists web-font embedding under its Enterprise Web Font license ([license terms](https://www.creativefabrica.com/enterprise-license/)).

## Reference boundary

The live IScraper marketing page is also the product-parity reference. Its concise saved-post positioning and changing platform-mark cue informed Rembr's message and interaction. Rembr uses its own wordmark, palette, typography, illustrations, and adapted copy; platform marks identify the social services named in the story.

The Teak homepage was visually reviewed on 2026-10-28 for the oversized heavy headlines, single retro keyword highlight, compact announcement strip, and crisp contrast. Treat this as a visual reference only; keep Rembr's product claims and original composition.

## Open exploration: original Rembr display typeface

**Status:** Feasibility discussed only; no typeface design or implementation is approved.

The user asked whether Rembr could create an original display typeface with a feel very similar to Integrate. This is technically feasible. If pursued, draw original glyphs from broad retro-modern design traits; do not trace Integrate's font file or letterforms. Decide glyph coverage, tooling, licensing, and visual review criteria before implementation. Until the user approves that work, keep the existing Space Grotesk fallback for highlighted keywords. The user's question is not approval to begin font production.

## Motion and access

- Use a short GSAP hero entrance, one-time section reveals, and subtle desktop-only decorative parallax to make the page feel alive.
- Keep native scrolling; Lenis is not included because it adds little value for this page and introduces another scroll layer.
- Respect `prefers-reduced-motion`; motion must not contain essential information.
- Keep navigation, page content, and form labels available to keyboard and assistive technology users.
- Recheck text contrast for any palette changes. Do not rely on color alone for product status.
- Keep navigation usable at 320px and preserve visible focus.

## Launch gate and unresolved configuration

The contact page requires `VITE_CONTACT_EMAIL` in the web build environment for its email-draft action. No support address was found in the current repository; the contact page therefore reports that the address is not configured and disables sending until a real address is supplied. Do not replace this with an invented address. Current marketing prices and a legal/company identity were not present in the reviewed project, so the site does not invent pricing, company claims, or policy text.

## Related docs

- [Voice and copy guidelines](./voice-and-copy-guidelines.md)
- [Marketing page map and content](./page-map-and-content.md)
- [Application typography decision](../../screens/rembr-design-system-brief.md)
- [Current screen specifications](../../screens/ui-surface-and-screen-specifications.md)
- [Current implementation evidence](../rebuild-plan/phase-1-record.md)
