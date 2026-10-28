# AI search service deep trace

**Source:** `D:/IScraper-main/IScraper-main/apps/orchestration/src/services/aiSearch.js` full file read, 598 lines. **Tests:** all 11 `aiSearch.test.js` cases read in `test-audit-supplement-small.md`. No source changes/tests executed.

## Input shaping and request builders

- `compactText` (1–3) whitespace-collapses, trims, truncates. `cleanGeneratedText` (5–20) also removes markdown URL targets, raw URLs and parenthesized domains, trims punctuation spacing, then truncates at sentence boundary or word. `removeIncompleteEnding` (22–28) drops unfinished trailing token or preserves sentence ending; if no period after position 80 it adds ellipsis.
- `publicResultSnippet` (30–55) projects id/rank/title/platform/url and bounded summary/transcript/OCR/visual/tags/topics/brands/tools/usefulness/search-match fields; it excludes raw item object. Array-valued fields are expected by source and accessed via `.slice`.
- Endpoint constants/header helper (57–66) target **OpenAI** `api.openai.com` chat-completions and Responses endpoints. Despite helper names `buildOpenRouter...`/`createOpenRouter...`, the concrete fetch helper below calls the OpenAI endpoint. This is confirmed source behavior and conflicts with “OpenRouter” naming/error strings.
- `buildOpenRouterSearchAnswerRequest` (68–97) builds JSON-mode grounded saved-library prompt with compact query and projected snippets.
- `compactConversation` (99–107) keeps only user/assistant messages, last eight, each <=1200 chars.
- `buildOpenRouterLibraryChatRequest` (109–145) uses library-only grounding prompt and passes compact question/conversation/snippets.
- `webSearchFiltersForQuestion` (147–170) restricts Anthropic/Claude terms to four official domains and OpenAI/GPT/Codex terms to four official domains; other queries have no domain filter.
- `buildWebSearchUserPrompt` (172–185) tells model to answer with web first and passes conversation and saved snippets.
- `buildOpenAiWebSearchRequest` (187–232) builds Responses API tool call, high search context, domain filters only for web_search, source inclusion, output limit 450 and system policy: search first, cite specific claims, prefer official vendors, under 110 words, no URLs/bullets, no unsupported claims.
- `buildPlainTextRetryRequest` (234–246) removes JSON response_format and raises token budget to at least 1200; tells the model to use plain text if JSON mode unavailable.

## Transport, parsing, and citations

- `fetchOpenAiChat` (248–257) POSTs JSON to OpenAI chat-completions with bearer authorization and parses JSON fallback `{}`. No local timeout/AbortSignal; caller’s timeout race does not cancel it.
- `fetchOpenAiResponses` (259–268) same for Responses endpoint.
- `openAiApiError` (270–274) creates status-bearing API error.
- `parseJsonContent` (276–291) strips code fences, parses JSON or retries extraction of outermost braces after removing trailing commas; malformed output throws. The error label mentions OpenRouter though direct chat endpoint is OpenAI.
- `plainTextAiSearchAnswer` (293–315) uses nonempty provider text and fabricates up to three citations from retrieved results, with generic “matched” reasons; thus fallback citations refer to retrieved saves but not provider-supplied evidence linkage.
- `responseOutputText` (317–325) uses output_text or concatenates output content text and caps 8,000 chars.
- `normalizeCitationUrl` (327–341) removes common tracking query keys and fragments via URL parser; fallback strips only fragment and `utm_` pattern. It does not restrict URL scheme/host. `normalizeUrlCitation` (343–353) adds title/snippet projections.
- `responseWebCitations` (355–386) aggregates action sources, item sources, and URL annotations, deduplicates by normalized URL, prefers non-URL title/nonempty snippet, and caps at eight.
- `normalizeWebSearchAnswer` (388–418) requires either web citations or saved evidence; trims incomplete answer; emits explicit uncertainty mode if answer missing or model says not enough evidence; otherwise returns web citations separately and uses model confidence/default grounded.
- `normalizeAiSearchAnswer` (420–458) accepts citations or resultReasons, filters all entries to ids from retrieved results, obtains URLs/titles only from those results, bounds text/counts, and returns default answer if blank. This is the principal saved-item citation grounding boundary.

## Provider call wrappers

- `createOpenRouterSearchAnswer` (460–495) early-returns null for missing key/query/results, but `fetchOpenAiChat` sends to OpenAI. Initial non-OK throws raw provider message without statusCode; empty content triggers one plain-text retry; parse failure falls back to plain-text answer/citations.
- `createOpenRouterLibraryChatAnswer` (497–533) same endpoint/normalization behavior for chat. Naming and error strings call it OpenRouter although the transport is OpenAI. Non-OK error lacks `statusCode`, making caller unable to distinguish 429 reliably.
- `createOpenAiWebSearchAnswer` (535–577) requires key/question, attempts Responses `web_search` (required tool), retries `web_search_preview` for 400-class errors, then preview with `tool_choice:auto` on another 400; non-400 errors preserve status via `openAiApiError`; requires returned answer text and normalizes web citations.
- Export list (579–598) exposes request builders, call wrappers, answer normalizer and projection.

## Findings and rebuild implications

1. **Provider naming mismatch:** “OpenRouter” builder/call names, comments, and parser errors point to OpenRouter, but actual URL and key contract are OpenAI. Rebuild should name adapters by real provider and assert endpoint/config pairing.
2. **Rate-limit classification:** chat completion wrappers throw plain `Error` on any non-OK response, losing HTTP status; `searchWorkflow` cannot recognize provider 429 as rate-limited and can return a generic fallback. Preserve status/code through normalization and test 429.
3. **Timeout is not cancellation:** callers race this work against timeout; without AbortSignal on fetch, requests may continue and charge after response timed out.
4. **Web citation URL trust:** URL normalizer allows any parseable scheme/host. Validate web citation protocol, and ensure UI renders as an external safe link.
5. **Prompt injection:** saved snippets and recent conversation are embedded as JSON, but prompt does not explicitly state that snippet content is untrusted instructions. Add explicit boundary and adversarial tests.
6. **Plain-text fallback attribution:** citations are attached to top retrieved items even when the model response does not name them; present this as retrieved context/matches, not evidence for every answer claim.
7. **Cache invalidation is handled by caller:** search workflow cache key uses ids rather than content/version; edits under stable item ids can leave stale AI answer until TTL expires.

The 11 unit cases cover request configuration, citation filtering, response annotations, JSON repair, plain-text retry, and missing-source rejection; they do not cover transport 429/status preservation, abort, hostile citation URL, prompt-injection, or content-edit cache invalidation.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
