# Assertion-level supplement: search, embeddings, parsers, visual similarity

**Scope:** Full static read of eight test files in `apps/orchestration/test`. Test source is evidence of intended assertions only; no tests were executed. The same run does not verify provider connectivity or production behavior.

## `aiSearch.test.js` (11 cases; source `services/aiSearch.js`)

| Test lines | Assertions and source mapping |
|---|---|
| 14–34 | `publicResultSnippet` retains id, 1-based rank, analysis title and topics for a save. Maps to `publicResultSnippet` (`aiSearch.js:30`). It does not assert all allowed fields or redaction of hostile content. |
| 36–54 | OpenRouter search request uses selected model, JSON object response mode, prompt instructions not to invent and to produce 30–50 words / choose best match, and includes query. Maps to request builder (`:68`). |
| 56–84 | OpenAI web request selects web_search and required tool choice, filters to four Anthropic/Claude domains for that vendor query, instructs official sources, and includes question and saved snippet context. Maps to question/domain filter and request builders (`:147`, `:172`, `:187`). |
| 86–112 | Library chat request sets JSON mode and serializes only user/assistant conversation (drops system message), with retrieved snippet id. Maps to `compactConversation` and chat request builder (`:99`, `:109`). |
| 114–164 | OpenRouter call posts to `/v1/chat/completions` with bearer header; returns answer, removes result reason for unknown id, derives citation title/snippet from retrieved result, and returns suggestion. Maps to `createOpenRouterSearchAnswer` and answer normalization (`:420`, `:460`). |
| 166–217 | Library chat call posts same API; prompt identifies library assistant; citation for unknown save is discarded; valid citation includes saved URL/title/reason/snippet; suggestion preserved. Maps to chat call (`:497`) and normalizer (`:420`). |
| 219–284 | OpenAI Responses call uses `/v1/responses` and web_search; output text and URL annotation become normalized web citation (tracking query stripped), mode `web`, confidence `grounded`. Maps to response output/citation normalizers (`:317`, `:327`, `:355`, `:388`, `:535`). |
| 286–323 | Removes markdown link target/raw URL and parenthetical domain text from answer; citation URL has tracking parameter removed. Maps to clean-text and URL citation normalization (`:5`, `:327`, `:343`, `:388`). |
| 325–343 | Rejects successful-looking answer without verifiable sources. Maps to `normalizeWebSearchAnswer` (`:388`) and OpenAI web call (`:535`). |
| 345–380 | Repairs fenced JSON with a trailing comma and parses a valid citation. Maps to `parseJsonContent` and OpenRouter answer (`:276`, `:460`). |
| 382–421 | Empty first content causes second request without JSON response mode; plain text fallback produces answer and citation from retrieved saves. Maps to retry path in `createOpenRouterSearchAnswer` (`:460`). |

**Not covered:** HTTP non-2xx, malformed provider payloads, timeouts/abort behavior, oversized outputs, prompt injection from saved snippets, citation URL safety, hallucinated citation ids beyond the tested filtering, conversation truncation, and provider fallback selection. Bearer assertion validates test fixture request construction, not secret non-logging across transport/errors.

## `analyzer.test.js` (8 cases; `services/analyzer.js`)

- Lines 12–21: caption-derived title, entities (Claude/GitHub/OpenSpace), repository identification and summary; `analyzeTextMetadata` (`:42`).
- Lines 23–41: search over caption and analysis metadata finds GitHub/agent-memory record and excludes unrelated item; `searchItems` / ranking (`:260–389`).
- Lines 43–80: exact phrase SOC 2 beats loose numeral matches; `searchItems` (`:390`).
- Lines 82–119: broad security query expands toward SOC2/compliance and excludes design/promo; query groups/scoring (`:297–389`).
- Lines 121–148: status/platform/collection filters select only matching Instagram save; `searchItems` filter path (`:390`).
- Lines 150–166: detailed search returns same candidate with positive score, matched term and `Title` first explanation; `searchItemsWithDetails` (`:345–420`).
- Lines 168–179: OpenRouter request uses selected model and JSON schema; includes item text but not fixture secret marker; builder (`:112`).
- Lines 181–205: parses a provider choice JSON into title/repos; parser (`:153`).

**Not covered:** malformed model JSON, non-JSON response, model HTTP errors/timeouts, merge precedence, prompt injection, numeric/Unicode/tokenization boundaries, ranking ties, all filter combinations and scale. These assertions do not prove the semantic quality or determinism of model-generated fields.

## `embeddings.test.js` (4 cases; `services/embeddings.js`)

- Lines 11–26: assembled embedding text contains caption, transcript, repo and relevant analysis fields; `buildEmbeddingContent` (`:9`).
- Lines 28–34: OpenRouter response parser extracts vector; `parseOpenRouterEmbeddingResponse` (`:31`).
- Lines 36–59: OpenRouter endpoint, model and `input_type` are formed, returns vector, request body omits API key fixture; `createOpenRouterEmbedding` (`:68`).
- Lines 61–82: native OpenAI endpoint/model omits OpenRouter-only `input_type`, returns vector, request body omits fixture key; `createOpenAIEmbedding` (`:39`).

**Not covered:** empty/malformed vector, dimensions mismatch, errors/retry/timeout, input truncation, call-through credential selection (`:101`), or persistence/embedding model migration.

## `instagramParser.test.js` (6 cases; `services/instagramParser.js`)

- Lines 6–11: truncation avoids ending on a high surrogate, but expected output intentionally truncates the joined emoji sequence to the first woman code point. `truncateText` (`:14`); this is surrogate safety, not grapheme-cluster preservation.
- Lines 13–50: HTML saved posts parse reel/post types, caption/hashtags, username, platform/source identity and localized timestamps to UTC; HTML parser path (`:96–136`, `:276`).
- Lines 52–70: collection name is extracted and attached to item; collection parser and merge path (`:138`, `:252`).
- Lines 72–96: www/mobile URLs and tracking query variants canonicalize and deduplicate by shortcode; URL normalizer/merge (`:22`, `:252`).
- Lines 98–119: when all savedAt fields are empty, reverses export order to newest-first and leaves timestamps empty; ordering (`:270`).
- Lines 121–159: JSON export handles saved media, canonical URL, reel type, caption/hashtags, username/name, and epoch timestamp; JSON mapping (`:172–250`).

**Not covered:** malformed HTML/JSON, alternate Instagram export schemas or labels, timezone/DST edge cases, duplicate conflicting metadata precedence, collection duplicate membership, hostile URLs, multi-file ordering and very large files.

## `xBookmarksParser.test.js` (5 cases; `services/xBookmarksParser.js`)

- Lines 12–22: canonicalizes twitter.com and x.com status links, preserves `/i/status`, rejects other host; `normalizeXUrl` (`:19`).
- Lines 24–50: parses Twitter archive JS assignment, item URL, platform, author, hashtags and thumbnail; assignment/entry mapping (`:50–65`, `:110–201`).
- Lines 52–71: CSV + plain text import, expected collection name, converted saved timestamp, source title and normalized link; parser/import mapping (`:66`, `:202–294`).
- Lines 73–87: ZIP parser reads only bookmark.js and ignores profile.js link; ZIP selection and dispatch (`:226–294`).
- Lines 89–94: CSV parser maps headers and preserves comma inside quoted text; `parseCsv` (`:66`).

**Not covered:** malformed or hostile JS/JSON, archive path/resource limits, CSV escaped quote/newline cases, unsupported encodings, duplicate conflict resolution, missing ids, invalid dates, other archive layouts and malformed URLs.

## Visual embedding and similarity tests

| Test file / cases | Assertions / source mapping | Gaps |
|---|---|---|
| `visualEmbeddings.test.js` (2; lines 11–23) | Converts numeric strings and numeric values, rejects NaN/empty vectors; cosine identical=1, orthogonal=0, different dimensions=0; reads stored embedding and model, defaults to `local-ml-visual`. Maps to `visualEmbeddings.js:3–43`. | Infinity, max-dimension clipping, zero vectors, malformed nested values and persistence. |
| `visualSimilarity.test.js` (3; lines 11–86) | Text/tags rank matching visual item with visual match metadata; ignores non-done review-only and text-only items; tokenization filters stop words/punctuation, image asset counts as visual surface, public query projection caps description at 500 and topics at 12. Maps to `visualSimilarity.js:53–202`. | Threshold/limit/ties, query normalization edge cases, private fields beyond sample, empty-query behavior, actual image/vector use (this service is text-derived). |
| `similarVisuals.test.js` (3; lines 9–104) | Visual profile captures id, image presence, tokens/topics; text weighted similarity ranks related kitchen above unrelated fitness, returns source and reason/score; vector similarity finds near vector when text has no overlap and excludes unrelated orthogonal vector. Maps to `similarVisuals.js:76–203`, vector merge (`:151–167`), cosine helpers in `visualEmbeddings.js`. | Vector dimension mismatch, invalid embeddings, score tie/order, limit/minimum thresholds, cross-model compatibility, missing source and status/tenant filtering. |

## Status

All eight assigned test files were read in full. Their source implementation files were identified and function ranges mapped from the current source tree, but this supplement is not a full source implementation audit; see the corresponding service entries in `../source-audit/backend-source-coverage.md` for implementation review status. The rest of the 37-file backend test suite remains outside this supplement.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
