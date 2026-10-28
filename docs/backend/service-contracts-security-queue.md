# Service contracts: audit, access, budgets, and queue

**Evidence scope:** static read of the five service modules and four focused tests named below in `D:/IScraper-main/IScraper-main/apps/orchestration`. This records checked-in behavior, not deployed behavior. Lines are source line anchors.

## Audit logging (`src/services/auditLog.js`)

- `sanitizeAuditMetadata` (10–25) recursively limits depth to four, arrays to 25 entries, redacts keys matching secret/token/password/auth/cookie/API key/hash/session/raw/body/email (except the safe identifier allowlist), sanitizes string leaves, and stringifies/truncates other values. It constructs plain objects; prototype-special keys are not specially excluded.
- `sanitizeAuditString` (27–35) removes email, Bearer token, and selected token-shaped strings, collapses whitespace, then truncates to 240 characters. This is pattern-based redaction and does not prove all PII/secrets are removed.
- `hashAuditValue` (37–41) SHA-256 hashes the trimmed input or returns empty string.
- `auditContextForRequest` (43–55) chooses Express route template when available, otherwise path; attaches request/correlation IDs, method, route group, hashes IP/forwarded-for and user-agent, and sanitized metadata. Forwarded-for trust depends on upstream proxy configuration.
- `recordSecurityAuditForRequest` (57–82) derives actor type from explicit input, admin route group, user presence, or system; defaults target to current user; records request context through `store.recordSecurityAudit`; missing method returns null.
- `recordSupportEvent` (84–95) requires store method, user, and event type, then writes sanitized metadata as user activity.
- `safeAuditWrite` (97–103) swallows all audit persistence errors and returns null. This is deliberate non-blocking behavior but means audit-write failures are invisible to callers.

## Extension token helpers (`src/services/extensionTokens.js`)

- Scope constants (3–14) define extension (`lens:search`, save/capture create/delete) and agent (`agent:access`, library search/read) defaults.
- `generateExtensionToken` / `generateAgentToken` (16–22) create 32 random bytes encoded base64url with `isx_` / `isa_` prefixes.
- `hashExtensionToken` (24–26) SHA-256 hashes the supplied value; empty input hashes the empty string rather than failing.
- `publicExtensionToken` (28–38) returns only id/name/scopes/timestamps/revocation fields, omitting hash/token material.
- Expiry helpers (40–50) use local `Date` calendar arithmetic (+1 year, +90 days), then ISO UTC serialization. DST/calendar boundary behavior follows the host Date implementation.
- Test coverage: no dedicated `extensionTokens.test.js` was found; route/API and store assertions still need complete parity mapping.

## Agent and MCP projection (`src/services/agentAccess.js`)

- `cleanText` / `arrayValue` (1–9) normalize whitespace/truncate text and coerce values into arrays.
- `publicAgentItem` (11–32) projects selected save fields, ranked result, analysis/caption-derived text, collections/tags/topics bounded by count, and search match; it does not expose raw object internals.
- `buildAgentQueryResponse` (34–44) returns normalized query, count, projected items, and grounding/citation guidance.
- `toolsList` (46–72) advertises two tools: search the user library and read a single save by id. The schemas require question/id but do not declare additional-properties behavior.
- `jsonRpcResult` / `jsonRpcError` (74–80) form JSON-RPC 2.0 envelopes and normalize nullish id to null.
- `callAgentTool` (82–114): search validates a nonempty question, clamps limit to 1–20 (default 8), passes userId and limit filter to injected search, truncates results, and projects them. Read validates id, calls `store.getItem(userId,id)`, returns 404 when absent. Unknown tool is 404.
- `handleMcpRequest` (116–159): initialize advertises fixed protocol version/server info; initialized notification returns null; tools/list returns definitions; tools/call converts 404 to -32601 and every other thrown error to -32602 with raw error message; unknown methods return -32601. It does not itself authenticate; route middleware supplies userId. Error messages may expose provider/internal messages to the caller.
- `agentAccess.test.js` fully read: checks projection omits `raw`, guidance includes save-id citations/rank, and initialize/list names. It does **not** exercise tool calls, empty input, bounds, item not-found, unknown method/tool, error leakage, or user isolation.

## Shared usage budgets (`src/services/rateBudgets.js`)

- Allowed scope set (1–8): AI search, automation generation/run, workflow generation, media analysis, semantic embedding.
- `normalizeRateBudgetRequest` (10–34) requires string user id, allowed scope, positive integer limits, valid time; floors fixed UTC minute/day windows and returns start/reset timestamps.
- `consumeRateBudgetInMemory` (36–77) keys by user+scope; resets counters by window, denies without increment, returns exceeded scope/counts/retry timestamp, and conditionally prunes expired buckets only when >5000 entries and at least a minute since cleanup. In-memory behavior is process-local and not multi-instance safe by itself.
- `shouldRunCleanup` (79–81) handles first cleanup and one-minute interval.
- `rateLimitError` (83–95) creates 429 metadata and minimum-one-second retry-after; malformed retry timestamp falls back to 60 seconds.
- `consumeSharedRateBudget` (97–111) requires store method; validates allowed boolean and retry date for denial; all errors—including malformed result/store outage—become a generic 503 fail-closed error.
- `assertSharedRateBudget` (113–117) calls the shared store and throws 429 for denied budgets.
- `assertMediaAnalysisBudget` (119–127) applies config defaults of 5/minute and 20/day for `media_analysis`.
- `rateBudgetStoreUnavailable` (129–135) supplies named 503/code.
- `rateBudgets.test.js` fully read: local-store fixed-window UTC reset, denial not counting against daily usage, user/scope isolation, 100 concurrent local requests capped at daily 20, and missing shared-store fail-closed behavior. It does not test Supabase RPC atomicity, malformed result normalization, 429 retry-after math, cleanup, or integration callsites.

## Queue state helpers (`src/services/queue.js`)

- Constants (1–8) define active, paused, open, terminal states and defaults: 3 attempts; 60-second exponential base; 30-minute max.
- `createJobsForImport` (10–32) filters any item whose id exists in any existing job (including failed), creates deterministic `${importId}:${item.id}` queued jobs, and gives each fresh ISO timestamps/empty lease/error/retry fields. Existing failed jobs are suppressed here and require separate restart path.
- `pickNextProcessableJob` (34–36) returns first queued job only; does not test retry due/attempt budget.
- `isRestartableJob` (38–40) permits failed/active/any paused status, not queued/done.
- `isActiveJob`, `isPausedJob`, `isTerminalJob` (42–52) are constant membership predicates.
- `hasActiveLease` (54–58) only regards active states; missing expiry means active indefinitely; otherwise parses expiry against now.
- `isRetryDue` (60–65) treats absent or invalid nextAttemptAt as due.
- `isAttemptExhausted` (67–69) numerically coerces attempts and clamps max attempts to at least one.
- `isReclaimableJob` (71–79) refuses exhausted jobs; allows due queued jobs; active jobs only if due and lease absent/expired; refuses paused/terminal.
- `nextRetryAt` (81–92) calculates exponential delay capped by max, with minimum base 1000 ms, and returns ISO time.
- `effectiveQueueStatus` (94–97) displays active job with expired lease as queued; does not mutate row.
- `summarizeJobQueue` (99–140) counts effective statuses, due queued vs retrying, active/paused/failed/exhausted, oldest queued creation time, and status histogram. Malformed dates in `oldestIso` may yield comparison behavior worth testing.
- `oldestIso` (142–146) keeps the earlier parsed candidate.
- `queue.test.js` fully read: job creation without hard limit; dedupe for done/failed; first queued selection; skips paused; restartable state set; retry due/backoff; max attempts. Not directly covered: lease expiry behavior, summary fields, invalid dates, retry max cap, malformed `now`, equality boundary.

## Rebuild implications

Implement token helpers as small deterministic utilities; never return raw tokens after creation except once at the explicit user-facing issuance boundary. Agent/MCP projection and tool execution must always receive authenticated subject identity from middleware and tenant-scoped data access. Keep shared budgets authoritative in a transactional database function/RPC; local memory is only a development adapter. Queue state transitions, retry eligibility, lease ownership, attempt increments, and persistence must be designed together; pure queue helpers do not guarantee durable atomic claims. Audit redaction should be tested against nested PII/secrets, and audit write failure should be observable through a separate metric/health signal if audit completeness is a requirement.

## Audit status

The modules and four tests in this document are fully read at function/assertion level. Other service files and tests remain open in `../source-audit/backend-source-coverage.md`; this document does not close the backend audit.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
