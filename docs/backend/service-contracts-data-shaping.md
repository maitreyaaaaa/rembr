# Service contracts: identifiers, dates, profiles, and list shaping

Static trace of the listed source modules under `D:/IScraper-main/IScraper-main/apps/orchestration/src/services`. No source code changed and no tests were run.

## Content identity (`contentHashes.js`)

- `compact` (4–6) normalizes all whitespace and trims stringified values.
- `stableArray` (8–10) stringifies/compacts array entries, removes blanks and duplicates, then sorts.
- `sha256` (12–14) returns a lowercase SHA-256 hex digest.
- `buildAnalysisInputHash` (16–30) hashes canonical JSON for URL/platform/source identity/title/description/content type/caption, normalized hashtags/collections, and media basenames. Full paths are excluded, but same basename can collide across different media; array order is normalized.
- `buildEmbeddingContentHash` (32–34) hashes normalized text. Test file `contentHashes.test.js` read: array/path/caption normalization and whitespace normalization only; hash schema versioning is absent in this helper.

## Source timestamps (`sourceDates.js`)

- `MONTH_INDEX` (1–16) lists abbreviated/full English month names.
- `validIsoFromDate` (18–21) returns ISO only for a finite `Date` timestamp.
- `parseInstagramHtmlDate` (23–48) accepts one explicit English month/day/year 12-hour format, maps month, converts 12 AM/PM, and constructs UTC timestamp. It does not separately reject overflow day/hour/minute values; JavaScript UTC date construction normalizes some invalid component values.
- `normalizeSourceSavedAt` (50–68) handles exact 10-digit epoch seconds, exact 13-digit epoch milliseconds, Instagram HTML date, then JavaScript Date parsing; empty/invalid returns empty string.
- `sourceSavedAtOrCreatedAt` (70–72) prefers normalized savedAt to createdAt.
- `offsetIsoTimestamp` (74–79) returns original value if invalid; otherwise subtracts only a nonnegative numeric offset.
- `createdAtForImportedItem` (81–83) prefers source date and falls back to offset fallback ISO.
- Test mapping: `instagramParser.test.js` / X parser tests exercise selected imported date formats; dedicated sourceDates boundary tests were not found in the focused list.

## Profile and onboarding validation (`profiles.js`, `onboarding.js`)

- `normalizeUsername` (profiles.js:4–6) trims and lowercases.
- `validateProfileInput` (profiles.js:8–28) requires 3–24 lowercase ASCII letters/digits/underscore after normalization. Avatar must be HTTPS with no whitespace or a base64 PNG/JPEG/WebP data URL at most 350,000 characters. It checks scheme/shape, not remote content, redirects, or actual image bytes.
- `publicProfile` (profiles.js:30–40) projects user id, username, avatar URL, and timestamps.
- Onboarding option constants (onboarding.js:1–27) define accepted content and referral enums.
- `validateOnboardingInput` (29–54) deduplicates trimmed string content choices, validates enum values and maximum distinct count, validates optional referral, coerces skipped only when exactly `true`, and returns normalized payload.
- `publicOnboardingPreferences` (56–67) projects preference metadata with safe defaults.
- No dedicated profiles/onboarding tests were identified in the inventory; route/API assertions need mapping.

## User data/retention registry (`userDataRegistry.js`)

- `USER_DATA_CATEGORIES` (1–130) is a static export/retention registry covering account, automations, library, activity, AI usage, connected access, billing, and privacy requests with purpose, classification, export path, retention, minimization, deletion, table lists and redaction notes.
- `EXCLUDED_USER_DATA_TABLES` (132–140) explicitly excludes retained deletion/security audits, legacy provider-key tables, derived vectors, and operational queue records from export.
- `TABLE_DATA_CLASSIFICATIONS` (142–183) maps known tables to category labels.
- `SECRET_LIFECYCLE_RULES` (185–204) defines metadata-only handling for extension/agent tokens and capture connections.
- `getUserDataCategories` (206–208) returns shallow category copies and clones table arrays. Nested fields not cloned are currently primitive strings/arrays only.
- `getUserDataMap` (210–225) returns version 1, current generation timestamp, category/classification/lifecycle/exclusion references, and four privacy principles.
- `getRetentionRules` (227–238) projects selected retention-policy fields.
- Data registry is declared metadata, not proof that export/deletion implementation matches it. Reconcile its table names, retention periods and exclusions against migrations and service methods.

## Item list policy (`itemList.js`)

- Constants (1–3): page default 60, max 100; date comparator delegates to sourceDates.
- `normalizeCursor` (5–15) accepts nonnegative integer offset directly or base64url JSON `{offset}`; any invalid cursor silently becomes offset zero.
- `cursorForOffset` (17–20) emits base64url JSON only for positive integer offset below total count.
- `normalizeListOptions` (22–32) clamps limit 1–100, normalizes cursor, allowlists sort/type/state enums and trims collection/platform filters.
- `cleanFilter` (34–37) maps blank to `all`.
- `unique` (39–41) deduplicates truthy values.
- `isExtensionCaptureItem` (43–45), `isNoteItem` (57–59), `isLinkItem` (61–63), and `isVoiceNoteItem` (65–67) classify items by platform/content metadata; note excludes extension capture.
- `indexingStageFromStatus` (47–55) maps failure/done (deep vs visual vs text) and active states to stage; other statuses become metadata-ready.
- `itemTypeMatches` (69–78) implements filters; unknown type returns true.
- `itemStateMatches` (80–89) maps needs-review/searchable/enriched/failed; `searchable` means anything except `needs_review`, including failures/paused.
- `sortedItems` (91–106) sorts by normalized source date, updated/source date, or title with id tie-break; default newest.
- `facetsForItems` (108–117) builds collection/platform facets from all input items, removes Unsorted and selected synthetic labels; notes excluded from platform facets.
- `filterItems` (119–129) filters type, state, collection, exact platform, then sorts.
- `listItemsPageFromItems` (131–142) applies page slice, returns cursor/count/facets computed from unfiltered input and server timestamp.
- A cursor is an offset cursor, not a stable keyset cursor; inserts/deletes between pages can shift records. Tests cover adjacent service features, but dedicated itemList assertions require inventory reconciliation.

## Workflow composition and shared helpers

- `application/index.js:createWorkflows` (14–44) wires store/config/http/observability into worker, archive, library, import and automation workflows; returns automation chat, billing, note, screenshot, search and worker services. Dependencies are passed by closure; this is the runtime composition boundary.
- `application/common.js:cleanText` (3–5) whitespace-normalizes and truncates. `captureWorkflow` (7–9) emits an event with request context/user fallback. `warnWorkflow` (11–13) emits contextual warning. `withTimeout` (15–22) races a promise against timer and clears timer in finally; it does not cancel/abort the underlying HTTP operation after timeout.
- `http/security.js:securityHeaders` (1–10) installs nosniff, deny-frame, CSP, referrer, permissions and opener headers. `contentSecurityPolicy` (12–30) blocks default external resources, permits inline styles, Google font CSS, HTTPS/data/blob images and media, Supabase/PostHog connections, blob workers, self forms, and upgrades insecure requests. CSP must stay in sync with actual frontend dependencies and deployment hosts.

## Archive workflow (`application/archiveWorkflow.js`)

- `archiveHost` (8–14) parses hostname or returns empty.
- `failedArchivePayload` (16–26) maps known unsupported/blocked/no-content failures to `skipped`, others `failed`; records public error, status and capture timestamp.
- `cleanArchiveText` / `normalizedHost` (28–37) normalize fallback metadata and host.
- `metadataPatchFromArchive` (39–61) only fills title when missing or host fallback, and fills author/description only when blank; ready status required.
- `backfillItemMetadataFromArchive` (63–69) fetches latest user-scoped save, avoids overwrite when patch empty, then writes metadata.
- `createArchiveWorkflow` (71–132) synchronous capture: validates eligibility/store support, reuses ready archive unless forced, persists pending, fetches page, persists archive, best-effort backfills metadata (console warning on failure); fetch errors are persisted as failure/skipped archive. Async start path performs same preconditions/pending state, logs queue event, schedules capture with `setTimeout(0)`, then captures success/warning telemetry. Process-local timer has no durable queue/restart guarantee.

## Note assets (`application/noteAssetWorkflow.js`)

- `persistNoteImages` (10–43) returns empty for no files, enforces count then validates all inputs before side effects. Supabase path ensures bucket, uploads each file with `upsert:false`, then writes asset metadata; an upload/store error midway can leave prior storage objects/rows without rollback. Local path stores data URLs in asset metadata. Output removes falsey rows.
- `removeNoteAssetObjects` (45–53) filters data URLs, removes non-data objects only if storage client exists, uses configured/default bucket, and swallows removal failure with console warning. This helper does not itself delete metadata rows.

## Screenshot analysis (`application/screenshotWorkflow.js`)

- `chooseScreenshotAnalysisPlan` (8–24) chooses paid application OpenAI plan first, then prefers local ML if configured and retains paid plan as fallback. User-supplied provider credentials are not considered.
- `choosePaidScreenshotAnalysisPlan` (26–45) creates app OpenAI media credential only when configured and, if credit getter exists, requires positive paid credits; no getter bypasses balance check and returns source null.
- `prepareScreenshotAnalysis` (47–52) charges shared media-analysis budget only when a credential exists.
- `analyzeExtensionScreenshot` (54–82) requires saveAnalysis and file bytes, uses supplied/prepared plan, executes analysis, tags processing level, writes item description and analysis, best-effort records usage for source free/paid (errors swallowed), then returns saved/update/refetched item.
- `runScreenshotAnalysis` (84–112) calls local ML with catch-to-null then invokes paid fallback if configured; returns null analysis on local failure without fallback. `runPaidScreenshotAnalysis` (114–125) wraps provider request in 60-second `withTimeout`, which does not abort underlying request.

## Search workflow (`application/searchWorkflow.js`)

- Module cache (9) is process-local. `assertAiSearchUsageAllowed` (10–19) applies configured shared AI-search limits (60/min, 1000/day defaults). `aiSearchCacheKey` (21–28) hashes user/model/query and result IDs only; changed save content under same IDs does not invalidate cached response. `publicLensResult` (34–46) projects lens fields. `semanticSearchRequested` (54–58) accepts three flags.
- `createSearchWorkflow` (60–67) creates UUID search events; timeout capped 1–25 seconds and context item count capped 1–8.
- `runSearch` (77–115) optionally charges embedding budget and calls OpenAI embedding only when semantic requested, OpenAI configured, store supports it; 429/503 propagate, other embedding failures warn and fall back to text. Uses `searchLean` if no query vector and available, otherwise full search; records timing.
- `runAiSearchAnswer` (117–150) exits if disabled/unconfigured/no query/results; uses top bounded results and cache; charges budget only on cache miss; requests OpenRouter answer with `config.openAiApiKey` (verify intended provider key assignment in config); caches six hours by default and prunes when >500 entries.
- `normalizeChatMessages` (152–163) allows only user/assistant, last 8 messages, normalized/truncated 1200 chars.
- `runLibraryChatAnswer` (165–290) validates question, bounds results, creates and writes search event before response, returns no-match fallback, returns configured-off fallback, then charges AI budget. Web mode calls OpenAI Responses, catches all failures into friendly fallback (rate-limited distinct, timeout generic). Library mode calls OpenRouter, propagates 429 but converts other failures to friendly fallback. Search event only includes query text when no results; result IDs stored. `withTimeout` does not cancel network operation.

## Risks and design notes

- In-memory archive timers and AI cache are not durable/distributed. Confirm user-facing behavior after restarts or multi-instance deploy.
- Note upload and screenshot analysis span storage/provider/database side effects without a single transaction or compensation log. Make partial completion visible and retry-safe in Rembr.
- Make timeout cancellation explicit through AbortController; timeouts alone only stop waiting.
- Include a content/version hash or updated timestamp in AI cache key, and confirm provider-specific key naming at call sites.

## Implementation notes for Rembr

Preserve normalized identity inputs and version hashes before any future schema change; use source-derived dates without accepting invalid component normalization silently; treat user-data registry as a contract enforced by export/deletion integration checks; prefer stable keyset pagination for mutable, large libraries if product behavior permits. Do not change semantics without documenting compatibility.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
