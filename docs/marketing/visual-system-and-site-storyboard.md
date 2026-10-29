# Rembr marketing visual system and site storyboard

**Status:** Implemented marketing direction, 2026-10-29. This records the current site design and motion decisions.
**Scope:** Current public routes `/`, `/features`, `/about`, and `/contact`, plus their handoff to `/app`. Pricing and legal/privacy routes remain future work and must use verified product and legal details.
**Product evidence checked:** Current marketing component, web app import UI, Phase 3 import design, and Phase 4 implementation notes in this checkout on 2026-10-29.

## Creative direction

### Recommendation

Build Rembr as a **bright, tactile “save it for your future self” brand**. Use the sun-yellow and red-orange palette from the user's reference image, anchored by near-black type. Use warm paper as a breathing space, not a white SaaS canvas. Keep the product UI palette separate and restrained so long reading sessions stay comfortable.

The marketing site should feel vivid and memorable at first glance, then calm and credible as it explains the product. The orange and yellow provide recognition; typography, layout, real product states, and copy establish trust. Avoid making every section a saturated color block.

**Positioning thread:** “Keep the good stuff. Find it when you need it.” Tell one complete journey: a useful thing catches your eye, you save it, Rembr makes it easier to return to, and later you find it when it matters.

### Relationship to the implemented direction

This direction replaces **Soft Serve Editorial** on the marketing site. It retains the Rembr name and Space Grotesk / DM Sans pairing, keeps marketing and application CSS boundaries, and does not copy IScraper's logo, assets, or palette. The signed-in app retains its own design tokens.

## Color system

The two bright colors come from the supplied reference image. Ink and warm surfaces are proposed supporting colors. These values are a starting palette for mockups and need a rendered contrast check before implementation.

| Surface | Semantic role | Proposed value | Use |
|---|---|---:|---|
| Marketing | Sun yellow | `#FBE02E` | Hero field, a few large section panels, keyword marks, illustration shapes |
| Marketing | Red-orange | `#FD4D1B` | Primary accent, small emphasis, selected section panels, motion cue |
| Both | Ink | `#171411` | Headings, body text, outlines, navigation, icons |
| Marketing | Warm paper | `#FFF9D9` | Warm breathing space and content surfaces |
| App | Pale yellow canvas | `#FFF9D9` | Main workspace background; keep the tint subtle across long reading sessions |
| App | Reading surface | `#FFFEF6` | Saved-item text, forms, and cards above the canvas |
| App | Orange action | `#FD4D1B` | Primary emphasis and selected controls, in limited areas |
| App | Semantic status | Existing semantic tokens | Keep success, warning, error, and processing meaning distinct; never encode state by color alone |

**Contrast guidance:** Ink on sun yellow, red-orange, pale-yellow, and warm-paper measures approximately 13.81:1, 5.46:1, 17.30:1, and 17.30:1 respectively. Use ink on orange actions and highlights. Review focus, opacity, and component states alongside these flat-color ratios.

**Use ratio:** Start with warm paper and pale-yellow as the majority; let yellow make the brand recognizable; reserve orange for focal points. Black should carry information, not become a large app background by default.

## Typography

Use the already bundled fonts and create distinction through scale, weight, and composition instead of adding a new font before the direction is approved.

| Role | Family and treatment | Proposed use |
|---|---|---|
| Marketing display | Space Grotesk, Bold (700); tight but readable tracking | Hero, page titles, section headlines, card titles |
| App display | Space Grotesk, Bold (700), following the existing app scale | Workspace page titles and section headings |
| Body and long-form reading | DM Sans, regular (400) | Marketing paragraphs, feature explanations, app reading and help text |
| UI and navigation | DM Sans, medium/semibold (500–600) | Buttons, labels, tabs, navigation, filters, status labels |
| Metadata | DM Sans, medium (500); use size and spacing carefully | Eyebrows, dates, item provenance, section numbers |
| Wordmark | Keep the existing Rembr wordmark treatment | Do not introduce a new logo or a third typeface in this proposal |

**Hierarchy starting points:** marketing H1 64–88 px desktop / 44–58 px narrow screens; H2 40–56 px / 32–40 px; H3 22–28 px; body 16–19 px with 1.5–1.7 line height; metadata 12–14 px. Treat these as responsive ranges, not fixed CSS values. Keep app reading text at a comfortable 16–18 px and avoid marketing-style tight tracking in paragraphs.

The `Integrate` marketing font is not bundled in the repo and existing notes say its web embedding license needs confirmation. Do not rely on it in the design or advertise it as part of the type system. If a more distinctive display face is still wanted, compare licensed options after reviewing the first mockup.

## Brand character and image language

- **Character:** sunny, warm, capable, lightly playful, and useful. The product is a personal library, not a candy brand or a productivity dashboard.
- **Shapes:** confident rounded rectangles and organic cut-paper shapes. Use a simple, repeatable visual motif such as a saved-page “ticket” or bookmark tab. Avoid a different novelty sticker in every section.
- **Product visuals:** use accurate Rembr UI when showing the library, search, import, or saved-item states. A concept illustration is allowed when labeled as an illustration and not rendered as a fake screenshot.
- **Current asset plan:** use bespoke CSS composition and a small inline illustration to keep the page quick and product-independent. Do not add the Instagram phone scene or future concept in this pass. Revisit only when the user asks for that later phase.

## Marketing story: homepage

The page should move from recognition to proof, then give a clear next action. Keep section transitions visually connected, but every section must still make sense without animation.

| Beat | Story and suggested content | Visual direction | Motion role |
|---|---|---|---|
| 1. Opening frame | “Keep the good stuff. Find it when you need it.” Supporting line: save a useful page or bring in saved-post exports, then return to the source and readable copy from one library. Main CTA: “Open your library.” Secondary: “See how it works.” | Warm-paper header. Hero on sun yellow with ink typography. One orange path/ribbon leads to an accurate library card or phone frame. | One short entrance timeline: headline, support, CTA, then illustration. No delayed or hidden critical copy. |
| 2. Recognition | “A place for the things you chose to keep.” Show a saved-page example and where it lives in Rembr. | Bespoke archive illustration with an editorial saved-item panel; no fake screenshot or platform-specific scene. | Small staggered reveal; keep all content in document flow. |
| 3. Product proof | Show the complete product journey in the planned release: capture, search, organization, rediscovery, and account controls. | Alternating yellow, orange, ink, and warm-paper panels with a mix of typography and simple interface illustrations. | One-time reveals and restrained parallax on decorative layers only. |
| 4. The simple loop | Save → organize → find again, with clear explanation that deeper capabilities arrive in later phases. | Wide story sections with a small orange connector and numbered labels. | Subtle connector or number emphasis; no scroll-controlled content gate. |
| 5. Organize and rediscover (Phase 4) | “Your library should help you find the thread again.” Show search, tags/collections, Smart Collections, Checkup, reminders, graph, and grounded answers/summaries as the completed product story. Explain that answers cite saved sources and AI enrichment is optional and consent-based. | Select two or three proof points, then link to a complete feature page. Show citations and rediscovery controls in actual product UI. | One scroll-linked sequence may connect a saved item to its group and rediscovery view, but the full states remain visible without motion. |
| 6. Save from where you find it (Phase 5) | Demonstrate the browser extension and approved connected workflows as explicit user-initiated actions. For automations or publishing, show draft → pending approval → approved → executed/logged, with the human decision visible. | Browser capture frame or workflow panel based on completed Phase 5 UI. Keep “save” and consequential external actions visually distinct. | Small state transition can show a capture or approval decision; never auto-execute in a marketing animation in a way that implies approval is skipped. |
| 7. Control your account and data (Phase 6) | Show settings, export, deletion, privacy controls, account/security activity, and billing only where the corresponding behavior and live configuration are complete. Explain what each control does in plain language. | An orderly settings/data-control composition with clear labels and confirmation states; no vague security badges. | Keep privacy choices and destructive-action explanations still and readable. |
| 8. Honest boundaries | “Built for what you chose to keep.” Clarify public URL processing and platform-export limits, supported capture methods, provider/AI behavior, and any remaining limitations. | High contrast ink on warm paper with an orange rule; accessible, calm, non-defensive. | No parallax here; reading and limitations deserve stillness. |
| 9. FAQ and close | Answer the actual top questions, then repeat the primary CTA. Add pricing only after Phase 6 plan/entitlement configuration is verified; include contact, privacy, and data-control routes. Do not invent testimonials or service guarantees. | Yellow final panel with ink button and ink text. Warm-paper footer with the complete route map and app entry. | One small CTA/icon response; no confetti or motion that competes with the final decision. |

### Homepage headline options to test in mockups

1. **Keep the good stuff. Find it when you need it.** — closest to existing positioning, compact and benefit-led.
2. **A home for the things you meant to remember.** — more emotional and ownable; needs supporting copy to explain the library.
3. **Save now. Come back with context.** — more product-shaped; works if notes, collections, and grounded retrieval are ready to demonstrate.

Start with option 1 for the storyboard. A quick visual comparison of all three can happen before final copy approval.

## Other marketing routes

| Route | Job | Story structure |
|---|---|---|
| `/features` | Prove what the complete product supports | Short intro → capture/import → organize and rediscover → connected workflows and approval → account/data controls → capability limits and failure cases → open-library CTA. Group functions by user outcome, not the app's internal navigation labels. Build sections as planned while phases advance; publish each claim only when its phase and required live evidence pass. |
| `/about` | Explain the product point of view | The overload of things worth saving → why a personal, user-chosen library matters → what Rembr currently is and is not → north-star statement. Keep roadmap ambitions labeled as ambitions. |
| `/contact` and `/help` | Make feedback and support straightforward | Short, human intro → clear contact/help path and expected next step → account-help route. The current contact form opens an email draft only if configured; later support features must match their real service and privacy behavior. |
| `/pricing` | Explain the available plan and limits | Introduce only the actually configured plans, credits, entitlements, billing cadence, and cancellation/refund terms after Phase 6 verification. Design the page now, but keep unverified values as placeholders in the internal storyboard, never public copy. |
| `/terms`, `/privacy`, `/security`, `/data-deletion`, `/cookies` | Make product and data practices understandable | Build from Phase 6's actual collection, processing, retention, provider, export, deletion, and billing behavior. Add the required owner/legal review; do not use generic claims or certifications as decoration. |
| `/app` handoff | Let a visitor act immediately | CTA labels should honestly say “Open your library” or “Create your library” based on auth state; keep the handoff easy to see in every marketing header/footer. |

## Phase-aware marketing and release gate

The site may be designed and assembled before the product phases finish. Treat its full story as the destination Rembr is building toward, while separating production-ready content from future-state design in the working files. Use internal labels such as `planned — Phase 5` on unreleased sections and assets so they cannot be mistaken for current public claims.

| Product phase | Marketing story prepared in advance | Gate before presenting as available |
|---|---|---|
| 4 — Search, knowledge, optional AI | Search/retrieval, Smart Collections, Checkup, reminders, Knowledge Graph, summaries, cited answers | Phase 4 gate passes; provider-backed behavior and consent/configuration are described only to the extent actually verified |
| 5 — Extension and connected workflows | Browser capture, supported integrations, workflow/automation approval lifecycle | Phase 5 security, approval, audit, callback, extension/browser, and end-to-end acceptance evidence passes |
| 6 — Account, privacy, admin, billing | Export/deletion, privacy controls, support/admin boundaries, pricing and credits if enabled | Phase 6 lifecycle, access, billing, privacy/legal, and live-configuration evidence passes; obtain required owner/legal review |
| 7–9 — Visual system through release | Full route coverage, accessibility/responsive polish, final demos, release presentation | Whole-product gates and deployment/demo evidence pass; screenshots/video match the release build |

Do not reduce the product's intended feature scope to what happens to be in the current branch. Also do not turn the roadmap into a public promise: the user-facing site is ready for release only after the agreed Phase 0–9 roadmap is complete, each gate has passed, and its claims/assets match the completed product. Pricing, legal terms, certifications, integrations, and provider behavior each need their own evidence/configuration; “all phases are planned” does not make a specific claim true by itself.

## Motion language

### Principle

Motion should make the save → organize → rediscover story easier to follow. The page should feel confident and lively without commandeering scrolling. Keep native browser scrolling and progressive enhancement. GSAP and ScrollTrigger provide a short hero entrance, one-time section reveals, and restrained desktop-only decorative parallax. Lenis is not included; native scrolling is already smooth and predictable, and another scroll layer would add little to this design.

### Proposed motion vocabulary

| Pattern | Use | Guardrail |
|---|---|---|
| Hero entrance | One composed sequence for headline, CTA, and page illustration | 500–800 ms total; no long stagger; content is visible if JS or animation fails |
| Scroll reveal | Bring a section's illustration or product surface into focus once | Opacity/transform; trigger once; modest 12–24 px travel; never hide entire text sections by default |
| Micro interaction | Button press, keyboard focus, FAQ open/close | Fast and consistent; do not add cursor-follow or pointer-reactive decoration |
| Story parallax | A decorative background shape and product frame move slightly at different rates | Keep movement subtle and optional; no important text moves independently; disable on small viewports and reduced-motion preference |
| Product demo | User starts a short capture/import/rediscovery animation | Provide pause/replay; include captions or readable labels; respect reduced motion; never make autoplay the only proof |

### Motion limits

- No scroll-jacking, custom smooth-scroll layer, full-page scroll snapping, or pinned full-screen narrative that traps the reader.
- Use no more than **three prominent scroll-driven moments** on the homepage. Keep other movement to small component transitions.
- Prefer transforms and opacity. Do not animate layout geometry continuously or run scroll-linked effects on large image/video surfaces without performance review.
- Mobile defaults to static composition or very small movement; do not assume hover.
- Reduced-motion preference removes parallax, scrubbed movement, and decorative entrance travel. Keep the final visual state and the complete content visible. A visible site-wide motion control can be considered if persistent animation remains; avoid adding a preference control before there is a real persistent motion system.
- GSAP setup is scoped and cleaned up in React with `useGSAP()` and `gsap.matchMedia()` variants. Reduced-motion users receive static content. Parallax is decorative and desktop-only.

These constraints follow W3C guidance that interaction-triggered nonessential animation should be disableable and that parallax can cause vestibular symptoms. GSAP's official docs describe ScrollTrigger as trigger/scrub/pin capable and support media-query variants; this proposal uses only the trigger/small-scrub subset. See [W3C Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions), [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), [gsap.matchMedia()](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/), and [gsap.context()](https://gsap.com/docs/v3/GSAP/gsap.context%28%29/).

## Research notes and differentiation

Readwise Reader's current documentation shows established read-later expectations such as browser/mobile share saving, clean readable copies, and full-text search. Rembr should not imply it has the same direct-save convenience today: the source-backed Instagram scenario is an export import. Rembr can differentiate its story through the user's chosen library, transparent import/provenance, organization and rediscovery, while making every feature claim conditional on current implementation/release evidence. Reference: [Reader saving-content documentation](https://docs.readwise.io/reader/docs/saving-content) and [Reader search documentation](https://docs.readwise.io/reader/docs/faqs/searching).

## Assumptions and decisions for review

**Already specified by the user:** marketing may use image yellow `#FBE02E`, red-orange `#FD4D1B`, and black text; the product app may use a very light-yellow background, orange accent, and dark/black secondary roles. The app and marketing site remain distinct but related.

**Implemented:** Space Grotesk + DM Sans roles; `#171411` ink; `#FBE02E` sun yellow; `#FD4D1B` red-orange; warm-paper sections; the home/features/about/contact story; limited GSAP/ScrollTrigger motion.

**Resolved by the user:** The eventual marketing scope can include features from Phases 4, 5, and 6, and the site can be prepared before those phases finish. All phases must be complete before the site is released to users. The phase-aware release gate above operationalizes that direction.

The user deferred the Instagram scene and future concept for later. No Instagram-specific artwork is part of the current site.

## Audience and voice

The audience framing remains broad: people who want to keep useful things and find them again. More focused campaign pages can be added if user and search evidence supports them. Copy follows the [Rembr voice and copy guidelines](./voice-and-copy-guidelines.md): direct in the app, warm with restraint in marketing, with labels and descriptions used only when they help.

## Approval gate and implementation sequence

1. Keep the homepage, feature page, about page, and contact page aligned with the implemented visual system.
2. Revisit Instagram-specific artwork only when requested and when its depiction matches the product state being released.
3. Before public launch, confirm each Phase 4–6 claim against completed implementation and release gates; the site is not ready for users before all phases are complete.

## Sources

- Current project positioning and page map: [positioning and identity](./positioning-and-identity.md), [page map and content](./page-map-and-content.md).
- Writing and SEO standard: [voice and copy guidelines](./voice-and-copy-guidelines.md).
- Current product design boundary: [Rembr design-system brief](../screens/rembr-design-system-brief.md).
- Phase ownership and route scope: [phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md), [screen/workflow phase matrix](../rebuild-plan/screen-workflow-phase-matrix.md).
- Product capability and verification notes: [Phase 3 architecture](../architecture/phase-3-architecture-design.md), [Phase 4 architecture](../architecture/phase-4-architecture-design.md), and `apps/web/src/MarketingSite.tsx` / `apps/web/src/App.tsx`.
