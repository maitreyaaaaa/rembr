# Phase 4 architecture design — search, knowledge, and optional AI

## Status

Phase 4 has started on `feat/phase-4-search-knowledge-ai`, based on `master` at `005888a`. Phase 3 remains open for the separately deferred Meta API-key and live-provider verification. Starting Phase 4 does not pass or close Phase 3.

## Product contract

- Library search and knowledge views must work with AI providers and local ML services disabled.
- Keep all retrieval owner-scoped in the API/database layer. Filters, pagination, and ordering must be deterministic and reflected in URL state.
- Treat OCR, transcripts, summaries, visual descriptions, and embeddings as derived artifacts with provider/model, source item, and generation provenance. Never overwrite user-authored notes.
- Any grounded answer must cite item IDs that were actually retrieved for the signed-in owner; do not present generated claims as source facts.
- AI enrichment remains optional, bounded, rate-limited, and failure-tolerant. Provider credentials stay server-side. Provider absence or failure must not block capture, library browsing, or keyword search.
- No provider key is required for this initial deterministic retrieval slice. Real provider authorization and media behavior remain a later Phase 3 verification item.

## Source-backed scope

The Phase 4 capability rows are library search and retrieval, OCR/ASR/visual interpretation, item summaries/citations, Smart Collection rule evaluation, Library Checkup diagnostics, and the Knowledge Graph. Source references include `apps/orchestration/src/services/aiSearch.js`, `graph.js`, `libraryCare.js`, `smartCollections.js`, the UI `LibraryTab.jsx`, `GraphTab.jsx`, `LibraryCheckupTab.jsx`, and `SmartCollectionsView.jsx` in the read-only IScraper checkout. Rembr-specific APIs and schemas are required; source code is evidence, not a copy target.

## Implementation sequence

1. Improve deterministic library retrieval first: search effective title, description, URL, extracted text, and existing analysis artifacts; provide relevance ordering with stable owner-bound pagination and keep filters usable.
2. Add search feedback and a small, fixture-grounded retrieval evaluation. Record measurements and limitations before introducing semantic reranking.
3. Reconcile and implement Knowledge Graph, Checkup, and Smart Collection rule capabilities against the source acceptance matrix, with accessible non-visual alternatives and deterministic behavior.
4. Add grounded summaries/chat and OCR/ASR/visual enrichment behind provider/local-runtime adapters. Validate outputs, cap input/output/time/usage, preserve source provenance and citations, and support missing-key/provider-failure states.
5. Complete owner-isolation, deletion/artifact lifecycle, provider-off/failure, keyboard/responsive, and local regression evidence before deciding the Phase 4 gate.

## First implementation slice

Implemented locally on this branch: deterministically rank library search results by matches across effective title, description, URL, extracted text, note bodies, and existing AI analysis. Search remains tenant-scoped and provider-independent; relevance pagination carries score/date ordering in its owner-bound cursor. No production database mutation or provider call was part of this slice. Typecheck, lint, production build, and `git diff --check` passed; automated tests and browser review have not been run.

## Additional provider-free slices

- Knowledge Graph API and screen: derive bounded item/concept relationships from the signed-in user's domains, tags, collections, and any existing opt-in analysis topics. The SVG is a compact sample; the grouped concept/item list is the complete accessible interaction surface. No new persistence or provider call is required.
- Library Checkup API and screen: report owner-scoped processing states, unorganized saves, older saves, and stable daily/weekly rediscovery picks. The first version is read-only and does not make outbound link checks or mutate records.
- Smart Collections API, persistence, and screens: deterministically derive rule/topic/capture/folder/platform groups from up to 2,000 recent owner saves and existing analysis, then persist pin/hide settings and per-item include/exclude corrections. Search and membership reads remain owner-scoped; no provider is called. Rules run on refresh and group open, with text inputs bounded to 2,000 characters per item. Migration `20261029150000_rembr_smart_collections.sql` is local and still needs deployment/database migration evidence.
- Search feedback: persist a bounded owner-scoped result event for non-empty searches and accept helpfulness ratings only for items in that event's result set. Store a query hash and length rather than raw query text. Search continues if feedback logging is unavailable. The first retrieval evaluation is a hand-calculated synthetic fixture in `docs/quality/phase-4-search-retrieval-evaluation.md`; it is not an executed benchmark.
- Typecheck, lint, production build, and `git diff --check` pass for these slices. Automated tests and browser review remain unrun.

## Open evidence and gate

- Confirm current reference behavior and exact required graph, checkup, collection-rule, chat, and summary parity while implementing those slices.
- The first Smart Collections slice has rule-based categories, persisted user corrections, and group search; richer source-matching rules, selection controls, naming edits, and browser/runtime parity evidence remain open.
- The current graph/checkup slices are deliberately bounded: link health, reminders, duplicate cleanup, and full graph export remain open parts of source parity.
- OCR/ASR media-source coverage depends on closing the Phase 3 audio/video media parity gap; unsupported or unavailable sources must remain explicitly partial.
- Meta API access and real model behavior are not verified here.
- Phase 4 is not complete until all agreed capabilities and failure/security/UX acceptance criteria have recorded evidence.
