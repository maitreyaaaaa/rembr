# Stored upload import flow

**Evidence basis:** `apps/orchestration/src/services/storageImports.js`, `services/exportParser.js`, `services/instagramParser.js`, `services/pinterestParser.js`, `services/xBookmarksParser.js`, import routes, and `stores/supabaseStore.js` / `localStore.js`. Line references are in `D:/IScraper-main/IScraper-main`. This records source-level behavior and known coverage gaps; no hosted Supabase import was executed.

## End-to-end flow

1. The API accepts export files directly or stores larger/chunked files privately and creates an `imports` row with `queued_storage`, names and storage path metadata. API-side checks are in `http/uploads.js`; route orchestration is in `routes/importRoutes.js` and `application/importWorkflow.js`.
2. `processPendingStorageImports` reads a bounded list of pending rows and calls `processStorageImport` serially (`services/storageImports.js:184-194`).
3. `processStorageImport` first calls `store.claimStorageImport(id)`, then downloads each user-prefixed path, reassembles chunks, rechecks extension/MIME/actual byte size, and parses the files (`:139-180`).
4. `createImportRecordsFromFiles` parses all provided files; rejects a result with no recognized saved items; upserts collections and new saved items while skipping existing IDs/URLs; creates queued processing jobs with request/correlation/source metadata (`:101-137`).
5. Temporary upload files are removed in a `finally` after parsing/import creation. The import row becomes `imported` on success or `failed` on caught error (`:157-180`).

## Storage and validation details

- Bucket defaults to `import-uploads` (`storageImports.js:5`) and can be overridden by `config.importUploadBucket`.
- Storage path must equal the authenticated user ID or begin with `<userId>/` after stripping leading slashes (`:19-22`, `:52-60`). This is defense in depth alongside private storage policies, which still need hosted verification.
- Chunk count must be an integer from 1 through 100 (`:24-26`). Parts use five-digit zero-padded suffixes under `.parts/` (`:28-30`); the complete assembled file is validated after downloads (`:56-99`).
- Allowed extensions are HTML/HTM/ZIP/JSON/CSV; MIME types are a narrow allowlist including octet-stream and empty (`:7-17`, `:32-45`). The extension/MIME pair is checked again against actual buffer length after download (`:88-99`).
- Files are processed one by one; uploaded path removals are accumulated for downloaded originals/parts. If retrieval fails before the inner parsing `try/finally` begins, accumulated upload paths are not removed by that inner cleanup. The import is marked failed, but stale objects may remain.
- A malicious or malformed ZIP still reaches `JSZip.loadAsync` in parsers; input size limits cap upload size but archive expansion ratio/member count limits are not apparent in this path. Rembr should make decompressed size/member limits explicit.

## Import parser dispatch

`services/exportParser.js:17-22` recognizes Instagram saved-post file names, optionally constrained to Instagram’s saved activity directory; bare file names also qualify. `instagramFilesFromUploads` accepts matching HTML/HTM/JSON directly and scans ZIP members for matching file paths (`:50-83`). It does not pass arbitrary Instagram JSON/HTML documents through, even if their contents look compatible, unless the filename matches the saved-post naming set.

`parseImportExport` invokes Instagram, Pinterest, and X-bookmarks parsers, merges by normalized URL, and returns a specific `source` only when exactly one platform parser found items; otherwise it uses `user-export` (`exportParser.js:85-103`). Merge keeps the first item’s other fields, fills missing caption/title/description, and unions hashtags/collections (`:24-48`). Therefore same-URL cross-platform collisions collapse to one item; no conflict provenance is retained.

### Platform parsers

#### Instagram (`instagramParser.js:1-286`)

- `normalizeText` collapses whitespace/NBSP; `truncateText` truncates Unicode code points; `getShortcode` selects the final URL path segment (`:7-20`).
- `normalizeInstagramUrl` accepts Instagram hosts with `www`, `m`, `mobile`, or `basic` prefix, retains only `/reel(s)/<code>` and `/p/<code>` as canonical `https://instagram.com/{reel|p}/{code}`, and returns the original input for invalid/unsupported URLs (`:22-37`). `getContentType` classifies `/reel/`, `/p/`, else unknown (`:39-43`).
- `findInstagramUrls` recursively visits string/array/object content, regex-matches Instagram media URLs, unescapes `\/`, canonicalizes, and de-duplicates (`:45-66`). `extractHashtags` lowercases Unicode letter/digit/underscore tags (`:68-74`).
- HTML post parsing uses `cheerio`, selects `a[href*="instagram.com/"]`, chooses the nearest `div._a6-g` containing one Instagram link, extracts Caption/Name/Username from labeled table rows and a saved-date class, then emits normalized item fields and default/explicit collection (`:76-136`). Duplicate canonical URLs are skipped within that file.
- Collection HTML scans cells exactly named `Name`, takes the following cell as collection name, finds URLs under the closest export record, parses that sub-tree as saved posts, and attaches the collection (`:138-170`).
- JSON parsing reads `string_map_data` labels for caption/title/text, owner/name/username and timestamp (epoch seconds), then recursively walks known nesting containers. If a node has media URLs and is itself a leaf or has a string map, it becomes an item; otherwise recursion continues (`:172-250`). JSON parse errors are swallowed by `parseInstagramExport` so other platform parsers may still recognize the file (`:276-286`).
- `mergeItems` merges by normalized URL, filling missing caption/owners/date and unioning hashtags/collections; `orderItemsForImport` reverses the merged list only when there is more than one item and every item lacks a saved date (`:252-274`).
- `parseInstagramExport` dispatches `.json`, `saved_collections` names, and other matching files to JSON, collection HTML, or saved-post HTML (`:276-286`). Unsupported or malformed HTML can return zero items without a diagnostic.

#### Pinterest (`pinterestParser.js:1-171`)

- `normalizeText` collapses whitespace/NBSP. `normalizePinterestUrl` unescapes slashes, retains `pin.it` path or maps any `*.pinterest.com` host with `/pin/<id>` to canonical `https://pinterest.com/pin/<id>`; unsupported URLs become empty (`:8-30`). The `endsWith('pinterest.com')` hostname test lacks a dot boundary, so a lookalike hostname such as `notpinterest.com` can be treated as Pinterest. This is a parser correctness issue to fix in Rembr.
- `getSourceId` prefers canonical pin ID and otherwise returns first 16 hex characters of SHA-1; hashtags are lowercased Unicode tags; `collectStrings` recursively gathers JSON string values; `textFromBuffer` rejects NUL-containing binary text (`:32-66`).
- `extractPinterestItemsFromText` regex-scans all URLs in a file, canonicalizes each and emits generic pin metadata with URL-only caption/title, platform, source ID and a collection name determined by ZIP/file path (`:68-101`, `:103-108`). It assigns hashtags extracted from the entire source text to every pin in that file, which can attach unrelated tags to a pin.
- `mergeItems` merges duplicate URLs, unioning only hashtags/collections (`:110-122`). ZIP scanning uses JSZip and only includes JSON/CSV/HTML/HTM/TXT members whose path or basename identifies `pins`, `boards`, or `boards_followed` (`:124-146`).
- `parsePinterestExport` turns ZIP-open errors into a user-facing 400; direct JSON is parsed then all strings scanned, with malformed JSON falling back to raw scan. Direct CSV/HTML/HTM are also raw URL scans; `.txt` is accepted for ZIP entries but not direct uploaded files by this branch (`:148-171`). A successful result creates a generic collection with item URLs.

#### X bookmarks (`xBookmarksParser.js:1-301`)

- `cleanText` decodes a few HTML entities, collapses whitespace, and truncates; `normalizeXUrl` accepts `x.com`, `twitter.com`, and mobile hosts only when a numeric status ID is present, then canonicalizes to x.com; it preserves username when available or uses `/i/status/<id>` (`:9-40`). `tweetIdFromUrl` extracts numeric status ID and hashtag extraction lowercases Unicode tags (`:37-48`).
- `stripTwitterJsAssignment` removes BOM and the `window.YTD.<...>.partN =` wrapper plus trailing semicolon; `parseJsonLike` returns null on invalid JSON (`:50-64`). `parseCsv` is a small quoted-field CSV parser supporting doubled quotes and commas/newlines, normalizes header names, and only accepts recognized URL/ID columns (`:66-108`); it does not support quoted fields spanning newlines.
- `collectEntries` recursively searches JSON; it chooses `bookmark.tweet`, `bookmark`, `tweet`, or current object, marks an object as an entry if URL/text-like properties or embedded X links exist, otherwise descends (`:110-135`).
- `urlFromEntry` checks direct URL aliases, then scans string fields, then synthesizes a URL from numeric ID and optional username (`:137-151`). `mediaUrlFromEntry` chooses a direct media field or first media item (`:153-160`).
- `entryToItem` derives ID, text, author/username/date, title, X caption with author/date/source/url lines, tags and thumbnail (`:162-200`). Text-only fallback turns discovered links into item records with generic metadata (`:202-219`).
- `isXBookmarkEntry` recognizes bookmark-related path/file names, including a literal `pauch` token (`:226-231`). ZIP parsing filters JS/JSON/CSV/TXT members by that name rule; direct files must have those extensions (`:233-244`, `:264-292`). ZIP parse errors become 400; duplicate URLs fill missing caption/title/description/thumbnail and union tags/collections (`:246-262`).

These functions were read end to end in this pass. Their fixture/edge-case tests are not yet exhaustively reviewed, so parser behavior above is source-derived rather than independently validated for every provider export version.

Do not equate parser support with route upload support: `storageImports.js` and `http/uploads.js` each impose extension/MIME checks, while ZIP contents are separately filtered by parser-specific names/folders. Existing frontend clients can impose additional behavior and are documented elsewhere.

## Persistence and job creation

`supabaseStore.upsertImportData` first upserts parsed collection names, fetches existing IDs/URLs in batches, and filters duplicates for `duplicateMode === skipExisting` before inserting item rows (`stores/supabaseStore.js:1191-1245`). It writes normalized platform and source metadata, but collection membership on each saved item is stored as an array; normalized `collections` rows are also inserted. Duplicate items are not updated and do not get another job. `createJobs` resolves request/correlation IDs from the parent import when omitted, then upserts jobs on `(import_id,item_id)` (`:1258-1282`).

The storage-backed Supabase claim implementation contains a likely defect: after updating `queued_storage` to `processing_storage`, it attempts to log activity with `status` and `errorMessage` variables that are not defined in `claimStorageImport` (`supabaseStore.js:1157-1179`). The local-store method simply changes state and returns the record (`localStore.js:1592-1600`). A Supabase claim can thus mutate the row and then throw before returning it to `processStorageImport`; the pending-import loop will stop on the thrown error unless its caller catches it. There is no local-to-Supabase test for this method in the reviewed storage import test; `test/storageImports.test.js` exercises a local-store adapter only.

This should be logged as a high-priority source finding for Rembr to correct and cover with an adapter-level test. Do not silently reproduce it. Confirm current branch/source before coding because the parent IScraper repository must remain untouched.

## Failure and recovery implications

The row is claimed before downloads and parsing. A failure after claim marks it `failed` only if execution reaches the service catch block. A claim method exception occurs before that catch begins, so the row may remain `processing_storage` with no automatic lease or recovery path visible in this service. `getPendingStorageImports` only selects `queued_storage`, and the row is not automatically reclaimed. Rembr needs an explicit lease/attempt state for storage-import jobs or a safe stale-claim recovery policy.

The service removes paths after parser/import work in a `finally`, but deletion errors are warning-only. If parsing succeeds and `upsertImportData` partially writes before throwing, the row becomes failed while some items/collections/jobs may already exist; writes are not shown as a single transaction. Reprocessing must be idempotent and report actual inserted/skipped counts.

## Tests reviewed and gaps

- `test/storageImports.test.js` exercises duplicate skipping, preservation of existing items/analysis, job creation for new items, and removal of stored files using `createLocalStore` and a mock storage adapter.
- `test/instagramParser.test.js` contains cases for Unicode-safe truncation, owner/tags/date extraction, collection membership, URL canonicalization/deduplication, no-date ordering, and saved-post JSON. The test names were inventoried; assertions have not yet been walked line by line.
- `test/xBookmarksParser.test.js` covers URL canonicalization, archive JS, CSV/text, ZIP entries, and common CSV headers; assertions have not yet been walked line by line.
- There is no dedicated `pinterestParser.test.js`. `test/api.test.js` includes route-level Pinterest ZIP import fixtures for pins/boards/followed boards and excludes unrelated profile entries; parser-specific malformed input, hostname boundaries, metadata extraction and broad URL collision behavior lack focused coverage.
- `test/exportParser.test.js` covers nested Instagram ZIP paths and X bookmark ZIP dispatch; full assertions are still pending.
- No reviewed test exercises the Supabase `claimStorageImport` code path or a claim failure/recovery scenario.
- ZIP expansion bounds, malformed-chunk cleanup, storage policy enforcement, parser provenance for URL collisions, and partial database writes require explicit Rembr tests.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
