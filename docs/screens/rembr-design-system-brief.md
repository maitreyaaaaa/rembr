# Rembr design-system brief

## Status and intent

This is a design-system plan, not a completed visual specification or a claim that Rembr has been designed. The reference UI provides functional evidence and visual examples; its exact colors, marks, and branded assets are not Rembr decisions. The user asked for a distinct identity, so use the source to learn workflow hierarchy and information density while creating an independently reviewed visual language.

The source-backed screen inventory is [here](ui-surface-and-screen-specifications.md); implementation order and screen coverage are in the [screen/workflow phase matrix](../rebuild-plan/screen-workflow-phase-matrix.md). Functional state coverage and interaction contracts are designed first; the complete brand and visual pass is Phase 7 of the [roadmap](../rebuild-plan/phase-gated-roadmap.md). Phase 1 must still use accessible, coherent primitives.

## What is and is not decided

| Decision area | Decision now | Still to decide in Phase 7 |
|---|---|---|
| Brand | Use the project name Rembr; do not reuse IScraper’s logo, name lockup, or branded asset without an explicit rights decision. | Wordmark, iconography and any approved brand assets. |
| Layout | Preserve source-backed information hierarchy and workflows where useful; make a Rembr-specific composition. | Grid, density, navigation proportions, responsive breakpoints and screen-level layout. |
| Color | Use semantic roles rather than hard-coded colors in components. | Actual palette/values and light/dark mode support, grounded in tested contrast and reviewed visual references. |
| Type | Define semantic text roles and a clear hierarchy. | Font family, scale, weight and line-height after legibility and platform review. |
| Spacing and shape | Centralize spacing, radius, elevation, border and sizing tokens. | Token values and component variants. |
| Motion | Respect reduced-motion preferences; animations must convey state or aid orientation. | Motion durations/easing and which transitions improve comprehension. |
| Data visualization | Charts/graphs preserve labels, values, keyboard access and a non-visual alternative. | Chart palette, graph layout and interaction conventions. |

No exact palette, font, radius scale, or animation values are invented in this brief because no Rembr design concept, approved reference set, or design asset exists in this workspace. The design review should select and record those values with screenshots and accessibility evidence.

## Design principles

1. **Content first:** saved source, provenance, processing state and user annotations must remain easy to distinguish.
2. **Truthful status:** accepted, queued, processing, partial, ready, failed, paused and deleted states come from canonical server state; labels and colors never substitute for text.
3. **Visible ownership and safety:** destructive actions show scope; external actions show approval state; permission and privacy controls describe actual behavior.
4. **Progressive complexity:** keep the core save-and-find route clear while preserving discoverable access to advanced search, workflows and account controls.
5. **Accessible by construction:** target WCAG 2.2 AA as an engineering acceptance target, not a current conformance claim or certification. Verify keyboard, focus, name/role/value, zoom/reflow, contrast, reduced motion, status announcements and touch targets with automated and manual evidence.
6. **Responsive without feature loss:** mobile/narrow layouts preserve core actions, state visibility, navigation and privacy controls; no hover-only or pointer-only behavior.
7. **Distinct through design decisions:** establish hierarchy, voice, component behavior and visual rhythm independently; changing only the color palette is not sufficient evidence of a distinct identity.

## Required design artifacts before Phase 7 passes

- A concise token table with semantic names, chosen values, contrast pairs, light/dark behavior if supported, and rationale.
- Type, spacing, breakpoint, motion, elevation, icon and component-state specifications.
- Component inventory for buttons, links, fields, menus, dialogs/drawers, alerts, toasts, tabs, filters, status badges, empty states and data visualizations.
- Screen layouts for the source inventory at desktop, tablet and narrow mobile widths, including modal/drawer behavior and focus movement.
- A state coverage sheet linking each screen to loading, empty, error, partial, disabled, success, confirmation and permission-denied states as applicable.
- Before/after reference comparison that identifies inherited information architecture versus new Rembr presentation; avoid implying legal novelty or ownership claims.
- Screenshot evidence from a running build, manual keyboard/assistive review, contrast measurements, reduced-motion review, and regression evidence after restyling.

## Phase sequence

- **Phase 1:** establish semantic HTML, focus styles, reusable form/button/alert/status primitives, design tokens by semantic role, and responsive core layout. Do not wait for branding to make the vertical slice usable.
- **Phases 2–6:** extend the same primitives and add state-specific components as product surfaces are built; record new design needs rather than inventing one-off styles.
- **Phase 7:** approve the Rembr visual direction, fill exact token values, apply the system consistently to every route and extension surface, and collect viewport/state evidence.
- **Phase 8:** recheck the complete design against keyboard, screen reader, reduced motion, zoom, contrast and responsive acceptance; fix and repeat any failed checks.

## Research basis

- The [W3C WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/) is the accessibility reference for the engineering target. A target does not establish conformance: testing and scope must be recorded.
- The [C4 model diagram guidance](https://c4model.com/diagrams) says to use only diagram levels that add value; the same restraint applies here. This design brief specifies reusable system roles and evidence, not a speculative exhaustive component library before the product screens are validated.

## Related documents

- [UI screen specifications](ui-surface-and-screen-specifications.md)
- [Screen/workflow phase matrix](../rebuild-plan/screen-workflow-phase-matrix.md)
- [Phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md)
- [Final review checklist](../quality/final-review-checklist.md)
