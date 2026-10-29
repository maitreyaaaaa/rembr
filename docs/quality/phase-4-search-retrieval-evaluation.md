# Phase 4 lexical search retrieval evaluation

## Purpose and status

This is a small, deterministic sanity fixture for the current lexical scoring rule. It is a hand-calculated specification, not an executed quality benchmark and not evidence of query latency. The fixture contains no customer data. A runnable test and a larger labeled query set remain future work.

## Current rule

For a query that matches a saved item, the relevance score adds one point bucket per matching field:

| Match | Points |
|---|---:|
| Exact effective title | 100 |
| Effective title contains query | 70 |
| Description contains query | 40 |
| Original URL contains query | 30 |
| Extracted page text contains query | 20 |
| Note body contains query | 20 |
| Any existing AI summary, visual description, OCR, transcript, keyword, or tag contains query | 15 |

The query filter is case-insensitive substring matching. Results sort by score, creation time descending, then item ID descending. All search matches and metadata filters remain owner-scoped. Without a search string, the normal explicit sort applies.

## Synthetic fixture: `design system`

| ID | Kind | Title | Matching field(s) | Expected score | Relevance grade |
|---|---|---|---|---:|---:|
| F1 | Page | Design system | Exact title + title substring | 170 | 3 |
| F2 | Page | Design system checklist | Title substring | 70 | 3 |
| F3 | Page | UI guidance | Description contains phrase | 40 | 2 |
| F4 | Page | Component library | URL contains phrase | 30 | 2 |
| F5 | Note | Sprint notes | Note body contains phrase | 20 | 1 |
| F6 | Page | UI patterns | Existing analysis summary contains phrase | 15 | 1 |

Expected ordering is F1, F2, F3, F4, F5, F6 before timestamp and ID tie-breakers. The fixture checks the intended priority ordering across fields. It does not test substring false positives, multilingual text, tokenization, synonyms, ranking stability under edits, or semantic search.

## Feedback and data handling

- A signed-in user can rate a result helpful or not helpful from the current search page.
- Feedback is accepted only when the item belongs to that owner's recorded result set for that event. Foreign, stale, and forged result references are rejected.
- Search events store a SHA-256 hash of the trimmed lowercase query and its length, not raw query text. They store bounded filter metadata and owner-scoped result IDs/ranks; item deletion cascades result references and feedback.
- Search-event records older than 90 days are pruned for that owner when a new non-empty search is recorded; cascading deletion removes their result and feedback rows.
- Feedback logging failure does not fail the underlying library search. If logging is unavailable, the response omits its event ID and the UI does not offer a non-working feedback control.
- Hosted migration, two-user adversarial checks, runtime feedback persistence, and browser review are still not run.

## Next evaluation gate

Turn these rows into executable fixtures through the actual repository/API, add additional exact-title, text-only, metadata-filter, empty-result, tie-break, and tenant-isolation cases, then report MRR/nDCG or another defined metric over a reviewed query set. Measure latency separately with documented hardware, database state, and fixture size. Do not use this hand calculation to claim retrieval quality or performance.
