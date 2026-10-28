# Assertion-level supplement: queue/runtime, page archive, smart collections

**Scope:** full static read of five orchestration test files. Test code expresses expected behavior; no tests were executed and no source was edited. It does not prove Supabase or deployed worker behavior.

## `worker-leases.test.js` (3 cases)

- `31–61`: seeds three import jobs; claims bounded batch of two for worker A; asserts status becomes downloading, owner assigned, and second claim by worker B with per-user concurrency one returns no jobs. Covers local-store leasing/batch/concurrency.
- `63–107`: claims a job, verifies another claim is blocked while its lease is fresh, expires the lease by updating job to analyzing with past expiration, then asserts reclaimed job identity, attempt increment to 2, new owner and lease token. Covers expired lease reclaim behavior.
- `109–133`: marks one job with future retry time and another at attempt max; claim returns only third item. Covers retry backoff and exhausted-attempt filtering.
- **Not covered:** Supabase claim RPC/transaction parity; lease token fencing on update; races across processes; exactly-at-expiry boundary; worker crash after side effects; paused status/manual restart and attempt reset; fairness across users.

## `workerOperations.test.js` (6 cases)

- `37–50`: local storage preflight fails and reports missing env categories while ensuring supplied service role/OpenAI values do not leak.
- `52–63`: Supabase storage mode passes preflight without OpenAI key and states basic indexing only; key is absent from serialized result.
- `65–99`: local runtime pass claims/processes one seeded job; asserts one scope, attempt count one, done status, queue aggregates, and no item title/URL in status output.
- `101–124`: spawns indexing runner with `--once`, bounded local config and temporary path; asserts clean exit code. This is a subprocess smoke check but still not production worker runtime proof.
- `126–147`: shutdown controller wakes a 10-second sleep after SIGTERM, stops continuation, logs event/signal, and does not include names of secret environment variables in serialized logs.
- `149–160`: render blueprint declares one worker instance, loop command, and secret sync disabled for service role, encryption key and OpenAI key; asserts fixture secret absent.
- **Not covered:** actual Render deployment/environment, preflight all combinations, worker start failure/shutdown during active job, signals besides SIGTERM, process exit on failed pass, worker readiness/health, secret values in rendered provider logs.

## `workerRuntime.test.js` (3 cases)

- `40–76`: seeds two users with two jobs each; `runWorkerPass` receives total cap one and asserts two scopes visited but only one job done and three remain queued. Covers total-job cap across scopes.
- `78–119`: constructs one future-retrying job and one exhausted failed job; `getWorkerStatus` asserts total/retrying/failed/exhausted counts and selected worker config; serialized status excludes titles and URLs.
- `121–149`: loop uses injected sleep to stop after first pass; asserts stopped flag and pass count one.
- **Not covered:** real timing/backoff wait, concurrency >1, overlapping loop invocations, scope cursor/fairness, error recovery, shutdown during active work, status adapter failure, queued/paused count combinations.

## `pageArchive.test.js` (4 cases)

- `13–44`: HTML extraction retains readable title/text, removes script execution text and excludes script/iframe markup from sanitized HTML.
- `46–61`: starts a loopback HTTP server and calls capture on localhost; expects `PageArchiveError` with blocked host or port code, proving rejection before fetching.
- `63–67`: archival eligibility accepts ordinary HTTPS web item, rejects file scheme and note item.
- `69–100`: `metadataPatchFromArchive` fills host-fallback title/empty author/description from archive, but returns empty patch when item already has user title/author/description.
- **Not covered:** DNS rebinding, redirects to private IPs, IPv6/private ranges, response size/timeouts/encoding, malformed HTML, sanitized content quality, archive persistence failure/retry, blocked schemes/ports beyond loopback, browser script/event/style sanitization beyond script/iframe.

## `smartCollections.test.js` (7 cases)

- `33–49`: generation uses title/caption and enriched analysis to produce UI inspiration and topic-design-tools collections.
- `51–61`: recognizes fashion/clothing and product/shopping language.
- `63–85`: topic-interest collection is personalized from current saves; individual tool collections are suppressed at this sample size; unrelated recipe data does not retain AI-topic/tool collections.
- `87–101`: platform/capture groups appear only when matching items exist; verifies Instagram source group, screenshot capture group, match signal, and absent voice-note group.
- `103–132`: local store refresh exposes group metadata and match signals for a tool collection.
- `134–183`: persists user rename/pin/hide across refresh; hidden collection omitted by default but remains fetchable when `includeHidden`; manual exclusion survives refresh and filters item listing.
- `186–260`: HTTP API user A refreshes and updates own collection; user B receives 404 for A’s collection items; A can patch and exclude item, and resulting listing contains only remaining item.
- **Not covered:** threshold boundaries, exact candidate scoring/ranking and deterministic collisions; stale member cleanup; cross-user access for every API operation; concurrent refresh/edit races; Supabase persistence parity; malformed overrides; pagination/large collections; hidden collection update authorization; full schema/projection redaction.

## Status

All five assigned files were read completely at assertion level. Source function references in this supplement are conceptual subsystem mapping; implementation completeness is tracked separately in `../source-audit/backend-source-coverage.md`. The rest of the 37-test suite is not covered here.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
