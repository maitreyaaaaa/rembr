# Marketing site page map and content

**Status:** Current visual refresh implemented 2026-10-29
**Design source:** [Rembr marketing positioning and identity](./positioning-and-identity.md) and [visual system and site storyboard](./visual-system-and-site-storyboard.md).

## Public routes

| Route | Purpose | Primary content/action |
|---|---|---|
| `/` | Make Rembr's promise memorable | “Keep the good stuff. Find it again.”; save, organize, rediscover; start a library |
| `/features` | Explain the planned complete product | Capture, search, organization, rediscovery, and user control, with phase-aware claims |
| `/about` | Establish the product point of view | Why a personal archive matters and how Rembr is designed to help |
| `/contact` | Provide a feedback and account-help entry point | Contact form composes an email only when `VITE_CONTACT_EMAIL` is configured |
| `/app` | Enter the working product | Existing account sign-in/register and authenticated library |

Pricing and legal/privacy routes are not in the current marketing build. Add them when plan configuration and reviewed legal content are ready. The app route remains reachable from every public page. Public links are regular anchors and rely on the SPA host's history fallback; verify direct navigation/deep links on any production host before launch.

## Home page sequence

1. **Hero:** promise and primary action, with a bespoke archive illustration. It is illustrative artwork, not a product screenshot.
2. **Recognition:** explain the feeling of keeping something useful and wanting to find it later.
3. **Product story:** show the save → organize → rediscover loop and the future complete product's search, collections, connected workflows, and account/data controls.
4. **Trust and clarity:** make the product's source context and user control part of the story.
5. **FAQ and close:** answer practical questions and return to the library action.

Do not include the Instagram phone scene or future concept in this pass; the user deferred both for later. Phase 4–6 capabilities may be represented in the site because all phases must be complete before release to users. Do not publish unsupported claims early.

## Feature, about, and contact pages

- **Features:** group capabilities by user outcome: save, organize, find again, and stay in control. Distinguish current behavior from planned release capabilities wherever necessary. Claims must match completed phase evidence at launch.
- **About:** explain the value of a personal library without promising roadmap dates or unverified behavior.
- **Contact:** collect email, category, and message in the visitor's browser. With a configured address, submission opens a prefilled local `mailto:` draft; it does not send automatically or persist the message. Without configuration, the action is disabled and the address is reported as unavailable.

## Motion and visual behavior

- Keep the native scroll experience.
- Use GSAP for a short hero entrance, one-time section reveals, and restrained desktop-only decorative parallax.
- Respect `prefers-reduced-motion`; all essential copy and content remain available without animation.
- At 320px, content must remain inside the viewport; maintain keyboard focus visibility and usable navigation.
- Preserve the marketing/app style boundary: yellow/orange/ink/warm-paper for marketing and separate tokens for the signed-in application.

## Do not add without product evidence

- Pricing, tiers, guarantees, testimonials, customer counts, or supported-platform lists.
- Product capability claims that have not passed their phase and launch gates.
- Privacy/security certifications, retention/deletion claims, or invented legal/company details.
- A contact flow that implies a message was sent when it only opens a draft.

## Acceptance checklist

- Every CTA leads to the correct route; header/footer links work with direct navigation and refresh.
- Marketing palette remains scoped inside `.marketing-site`; app tokens and interactions remain unaffected.
- Contact behavior is clear and matches whether `VITE_CONTACT_EMAIL` is configured.
- Narrow viewports, keyboard focus, and reduced-motion behavior remain usable.
- All public product claims match the completed implementation and phase evidence before launch.
