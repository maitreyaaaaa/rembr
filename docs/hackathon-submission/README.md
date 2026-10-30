# Hackathon submission draft

**Status:** Draft. One authenticated hosted capture-to-search demo has been verified with the existing synthetic test account. Live Meta model behavior and formal event requirements remain unverified.

## Short project description

Rembr helps people bring supported social bookmark exports and public web pages into one personal library. It keeps source links and notes with saved items, processes pages in the background, and makes the library searchable and easier to organize.

## Demo plan

Use only a synthetic account and public test pages.

1. Show the problem: useful posts and links are scattered and hard to find later.
2. Save one supported public page, then show its queued and completed processing state.
3. Open the saved item to show its source and extracted content.
4. Find it again with library keyword search; show a note or collection if time allows.
5. State one known limitation plainly. Do not present a mocked or unavailable provider as live.

## Technical summary

The product uses a React/TypeScript web app, a Node.js API and background worker, and Supabase Postgres. Capture and extraction have deterministic paths that do not require an AI provider. The library supports owner-scoped saved items, notes, tags, collections, and keyword search. Optional AI search and enrichment are consent-gated and depend on provider configuration.

## Evidence and limitations

- Phase 1 and Phase 2 have recorded local acceptance evidence; see the [phase records](../rebuild-plan/phase-1-record.md) and [Phase 2 record](../rebuild-plan/phase-2-record.md).
- Phase 3's local implementation and API coverage include imports, queued processing, retries, and recovery. On October 31, a hosted browser smoke in the existing synthetic account saved `https://example.com/`, reached **Ready to read**, and returned the page as the single result for keyword search `Example Domain`. This verifies one capture → hosted processing → search path; broader browser/accessibility, imports, storage/recovery, and media-parity gates remain open. See the [Phase 3 record](../rebuild-plan/phase-3-record.md).
- Two focused local API tests passed on October 31: registration/capture/owner isolation/deletion, and deterministic worker extraction to `ready`. They use the test database and injected HTML; they do not prove browser behavior, live URL fetching, or hosted processing.
- Phase 4 includes local search and consent-gated AI capabilities; provider and quality checks remain partly open. See the [Phase 4 record](../rebuild-plan/phase-4-record.md).
- The local `DATABASE_URL` points to the existing Supabase Postgres; `createDatabase()` connected and its read-only `SELECT 1` passed on October 31. The hosted smoke above provides a separate, narrow end-to-end check; it does not close all persistence/worker gates.
- Render currently reports both the web service and worker live from `master` at commit `23c15e2`. The deployed `/api/health` endpoint returned HTTP 200; this does not establish that account creation, capture, or background processing works end to end.
- Live Meta model use has not been verified for this demo. The event page promotes building with Meta models, but the binding model-use requirement was not established from the public page or its linked waiver. Confirm the official rules before claiming compliance or live use.
- Browser extensions and connected workflows (Phase 5), remaining account/admin/billing parity (Phase 6), and full visual parity (Phase 7) are outside this submission-focused demo.

## Before submission

- Re-run the capture-to-search path while recording, using the synthetic account.
- Keep claims aligned with the observed demo and list anything not verified.
- Record the verified capture-to-search walkthrough and prepare a short reviewer setup note.
- Confirm the current Official Rules, including required submission artifacts and whether a Meta model is mandatory.
- The official event pages currently list **November 4, 2026, 9:00 PM ET** as the project submission deadline.

## Sources

- [Official event page](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon)
- [Meta developer event page](https://dev.meta.ai/events/global-hackathon)
- [Phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md)
