# Marketing site page map and content

**Status:** Implemented, 2026-10-28  
**Design source:** [Rembr marketing positioning and identity](./positioning-and-identity.md).

## Public routes

| Route | Purpose | Primary content/action |
|---|---|---|
| `/` | Explain Rembr in one visit | Value proposition, save flow, current limits, start library |
| `/features` | Describe the current product surface and boundaries | Save public page, readable copy/source, search title or URL, account-owned library |
| `/about` | Set product expectations and direction | What Rembr is, what it is not, current north star |
| `/contact` | Provide a product feedback and account-help entry point | Contact form that composes an email only when `VITE_CONTACT_EMAIL` is configured |
| `/app` | Enter the working product | Existing account sign-in/register and authenticated library |

The app route is the existing product entry point and must remain reachable from every public page. Public links are regular anchors and rely on the SPA host's history fallback; verify direct navigation/deep links on any production host before launch.

## Home page sequence

1. **Hero:** promise and main action. Explain that a public page is saved into a readable copy with the original link. Illustration visualizes one kept page, not a live product screenshot.
2. **Kinds of saved things:** lightweight marquee describes content types as examples; no platform-specific ingest support is implied.
3. **Three-step flow:** submit a public URL, allow processing, search by title/URL and read/open the source.
4. **Feature cards:** one place to save, readable copy, basic search.
5. **Scope statement:** public pages only, selected manually, extraction may vary; links to the fuller feature list/about page.
6. **FAQ:** public URL eligibility, extraction failure, current search limits, and explicit statement that pricing has not been set.
7. **Final action/footer:** direct path to `/app`, page map links.

## Feature page

Describe four implemented user outcomes and a separate limitations panel. Keep these distinctions visible: only HTTP(S) public URLs; no credentials, paywall bypass, or bulk crawl; processing can fail; no AI search, browser extension, or automation is currently advertised as available.

## About page

Answer “what are we?” and “what are we not?” with specific current scope. The north star is positioning language, not a delivery promise or roadmap commitment.

## Contact page

The page collects email, category, and message in the visitor's browser. When a configured support address exists, submission opens a prefilled `mailto:` draft; the browser does not send it automatically and the site does not persist the message. Without configuration, the send action is disabled and the page states that the address is not set. This is an explicit interim flow, not a server-backed contact service.

## Do not add without product evidence

- Pricing, free/pro tiers, guarantees, customer testimonials, customer counts, or supported-platform lists.
- Login-protected or paywalled captures, third-party integrations, AI or semantic retrieval, browser extension, reminders, and bulk ingest.
- Privacy/security certifications, retention/deletion claims, or a legal entity/address invented for marketing copy.
- A nonfunctional contact form that implies a message has been delivered.

## Acceptance checklist

- Every CTA leads to `/app`; every header/footer route works with direct navigation and browser refresh.
- Marketing pages have per-route title and description and use the marketing palette only inside `.marketing-site`.
- App auth/library retain Daybreak tokens and the approved Space Grotesk/DM Sans hierarchy.
- Contact submission opens a local email draft only when configured; without configuration it is clearly unavailable.
- At narrow viewports the menu, cards, and form remain within the viewport; keyboard focus and reduced motion remain supported.
- All advertised features match current source and [Phase 1 evidence](../rebuild-plan/phase-1-record.md).
