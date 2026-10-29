# Phase 4 lexical search retrieval evaluation

## Purpose and status

This is a small, deterministic sanity fixture for the current lexical scoring rule. The API integration test executes it against a synthetic owner and reports MRR and nDCG. It contains no customer data and is not representative evidence of retrieval quality or latency; a larger reviewed query set remains future work.

The API suite exercises cross-field multi-term matching, one curated `security` to `audit/privacy` expansion, exact-phrase exclusion, owner-bound feedback, and cited evidence retrieval. The six-item fixture below checks graded ordering through the API; the same test also covers extracted-text-only and Hindi query/search, grounded Q&A tokenization, type/tag/collection filters, empty results, deterministic tie-breaking, cross-owner isolation, and stable ranking after a title edit. These checks do not establish ranking quality across a representative corpus.

## Current rule

For normal library search, every meaningful query term must appear in at least one searchable field. Terms may be distributed across fields. Stop words are removed from the filter; a small curated set expands to OR groups (for example, `security` can match `audit` or `privacy`) while original query groups remain ANDed. This is deterministic lexical expansion, not vector or model-based semantic search. The relevance score adds one point bucket per field match and per matching query group:

| Match | Points |
|---|---:|
| Exact effective title | 100 |
| Effective title contains query | 70 |
| Description contains query | 40 |
| Original URL contains query | 30 |
| Extracted page text contains query | 20 |
| Note body contains query | 20 |
| Any existing AI summary, visual description, OCR, transcript, keyword, or tag contains query | 15 |
| Per query group: effective title | 30 |
| Per query group: description | 18 |
| Per query group: original URL | 12 |
| Per query group: extracted text or note body | 10 |
| Per query group: any existing analysis field | 8 |

Phrase matches add the original field weights on top of per-term scores. The separate library evidence preview uses `matchMode=phrase`, so every citation contains the full requested phrase. Results sort by score, creation time descending, then item ID descending. All search matches and metadata filters remain owner-scoped. Without a search string, the normal explicit sort applies.

## Synthetic fixture: `design system`

| ID | Kind | Title | Matching field(s) | Expected score | Relevance grade |
|---|---|---|---|---:|---:|
| F1 | Page | Design system | Exact title + phrase + two title terms | 230 | 3 |
| F2 | Page | Design system checklist | Phrase + two title terms | 130 | 3 |
| F3 | Page | UI guidance | Description phrase + two description terms | 76 | 2 |
| F4 | Page | Component library | Two URL terms (`design-system`; URL cannot contain the spaced phrase) | 24 | 1 |
| F5 | Note | Sprint notes | Note-body phrase + two note terms | 40 | 2 |
| F6 | Page | Design cues | One title term + one description term | 48 | 2 |

The API test creates these fixtures, submits `design system`, and checks the ordered IDs F1, F2, F3, F6, F5, F4. With relevance grades `[3,3,2,2,2,1]`, this fixture yields reciprocal rank 1.0 and nDCG 1.0. The cross-field F6 score (48) ranks above the note-body F5 score (40); the URL's hyphenated terms score 24 because the exact spaced phrase is absent. Phrase mode includes only rows whose one searchable field contains `design system`. Supplemental cases verify extracted-text-only matching, Hindi lexical search and grounded Q&A, page/note filtering, tag and collection filters, empty results, same-score/date ID ordering, exclusion of a foreign owner's matching save, and identical ordering on repeated searches after an effective-title edit. The fixture now tests whole-token matching (art matches art and smart-art, not cartography) and phrase boundaries. It does not test language-specific stop words, the full synonym map, broader multilingual normalization, or semantic search.

## Feedback and data handling

- A signed-in user can rate a result helpful or not helpful from the current search page.
- Feedback is accepted only when the item belongs to that owner's recorded result set for that event. Foreign, stale, and forged result references are rejected.
- Search events store a SHA-256 hash of the trimmed lowercase query and its length, not raw query text. They store bounded filter metadata and owner-scoped result IDs/ranks; item deletion cascades result references and feedback.
- Search-event records older than 90 days are pruned for that owner when a new non-empty search is recorded; cascading deletion removes their result and feedback rows.
- Feedback logging failure does not fail the underlying library search. If logging is unavailable, the response omits its event ID and the UI does not offer a non-working feedback control.
- Hosted migration, two-user adversarial checks, runtime feedback persistence, and browser review are still not run.

## Next evaluation gate

Build a larger human-reviewed query set with graded relevance before using MRR/nDCG to make retrieval-quality claims. Add tests for broader multilingual normalization and the full curated synonym map. Measure latency separately with documented hardware, database state, and fixture size. Do not use this six-item synthetic result to claim retrieval quality or performance.
