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
- Knowledge Graph screen: users can download the currently loaded owner-scoped graph as versioned JSON, with export time, node/link/group data, counts, and an explicit completeness/truncation flag. A separate owner-scoped Obsidian ZIP export now includes every saved item, concept notes, wikilinks, user notes, available summaries, and `graph.json`; the full export is integration-tested. Browser review and production-size runtime evidence remain open.
- Library Checkup API and screen: report owner-scoped processing states, unorganized saves, older saves, and stable daily/weekly rediscovery picks. Explicit user-scheduled reminders support tomorrow/week/month presets and pending/due/done/dismissed handling. Diagnostics make no outbound link checks, and reminders are only created or changed on user action. Migration `20261029160000_rembr_library_reminders.sql` is local and still needs deployment evidence.
- Smart Collections API, persistence, and screens: deterministically derive rule/topic/capture/folder/platform groups from up to 2,000 recent owner saves and existing analysis, including summary, visual description, OCR, transcript, tags, and keywords. The UI exposes inline rename and a library search picker for manually adding a save. Search and membership reads remain owner-scoped; no provider is called. Rules run on refresh and group open, with text inputs bounded to 2,000 characters per item. Migration `20261029150000_rembr_smart_collections.sql` is local and still needs deployment/database migration evidence.
- Search feedback: persist a bounded owner-scoped result event for non-empty searches and accept helpfulness ratings only for items in that event's result set. Store a query hash and length rather than raw query text. Search continues if feedback logging is unavailable. The six-item fixture in `docs/quality/phase-4-search-retrieval-evaluation.md` now runs through the API and calculates synthetic MRR/nDCG; it remains too small to represent real retrieval quality.
- Grounded evidence preview: `/api/knowledge/answer` searches the same owner-scoped lexical repository for an exact phrase and returns a transparent match-count statement plus saved excerpts linked to the retrieved item IDs. It makes no model call and does not claim to answer semantic questions. Provider-backed synthesis, multi-turn chat, citation validation against generated claims, and provider-off/failure states remain open.
- Typecheck, lint, production build, and `git diff --check` pass for these slices. The API suite passes 79 tests, including synthetic cross-field term matching, graded retrieval evaluation, Smart Collection rename/membership/analysis-artifact behavior, reminder lifecycle and tenant boundaries, exact-phrase filtering, feedback ownership, and cited evidence retrieval. Browser review and hosted migration/runtime checks remain unrun.

## Open evidence and gate

- Confirm current reference behavior and exact required graph, checkup, collection-rule, chat, and summary parity while implementing those slices.
- Smart Collections now expose rename and explicit item inclusion controls. Further rule parity remains open: the IScraper reference has distinct screenshot/voice capture groups and analysis-derived topic/brand/tool/person/repository groups. Rembr currently supports page/note captures plus existing tags/keywords; some reference item/entity types do not exist in the Rembr schema yet. Browser/runtime parity evidence also remains open.
- The interactive graph/checkup views remain deliberately bounded. Link health and duplicate diagnostics remain open parts of source parity. Reminders are implemented locally but await browser and hosted migration/runtime evidence; the Obsidian ZIP export covers the full owner library and still needs browser and production-size runtime review.
- OCR/ASR media-source coverage depends on closing the Phase 3 audio/video media parity gap; unsupported or unavailable sources must remain explicitly partial.
- Meta API access and real model behavior are not verified here.
- Phase 4 is not complete until all agreed capabilities and failure/security/UX acceptance criteria have recorded evidence.
