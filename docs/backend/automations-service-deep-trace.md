# Automation service deep trace

**Source:** `D:/IScraper-main/IScraper-main/apps/orchestration/src/services/automations.js` (full 745-line file read in bounded chunks). **Tests:** `test/automations.test.js` (19 tests) fully read; see `focused-test-assertion-ledger.md`. No source changed and no tests executed.

## Module constants and factory

- Limits/constants (5–19): OpenRouter tools-capable model catalog; 3 LLM turns, exactly 1 tool call, max 10 email rows, 36,000-char tool result; only `GMAIL_FETCH_EMAILS` is enabled; mock model and fixed synthetic email data.
- `createAutomations` (21–277) constructs repository with injected store/time, determines mock mode once at initialization, and holds process-local mock connections as fallback.
- `list` / `get` (26–32) delegate scoped repository reads.
- `create` (34–38) discards caller id/createdAt, forces initial active status and null schedule time before validation; schedule creation requires active Gmail connection; saves through repository.
- `assertScheduleConnection` (40–47) uses persisted or process-local mock connection, otherwise calls Composio; status must be active/connected.
- `draftFromChat` (49–81) mock path is deterministic; live path requires OpenRouter, trims description, consumes generation budget, sends constrained JSON prompt, uses 30s AbortSignal, normalizes provider errors/JSON and validates supported output. Returns unsaved draft (`id:null`, `draft`, no nextRunAt); it does not persist or execute.
- `reviseDraftFromChat` (83–137) requires non-empty message and unsaved draft, validates existing draft, uses mock/live constrained revision; live request passes only selected current fields and asks provider to preserve unchanged settings. Output is revalidated and returned unsaved. Unsupported response does not change the draft.
- `update` (139–158) loads user-owned automation, detects schedule configuration/status changes, clears nextRunAt when changed, validates merged input, requires Gmail only when transitioning into active schedule, and preserves existing lease token/time while an active schedule is edited. Saves scoped repository row.
- `remove` (160–162), `runs` (164–167), and `allRuns` (169–171) delegate; per-automation runs return null when parent not found.
- `run` (173–220) requires active automation and manual/schedule trigger; live mode consumes shared run budget. Denied manual run throws 429 before run record; scheduled denial creates `rate_limited` run for caller to defer. Otherwise creates run record and activity timeline (`received`, `reading_gmail`, then `completed` or failure state). Mock requires mock Gmail connection. Live calls `executeAgent`; public result stores summary bounded at 8,000 chars and message count. Errors are converted to `needs_connection` or `failed`; run record update result is returned.
- `runDueSchedules` (222–235) claims at most 10 due schedules, runs sequentially, defers rate-limited schedules to retry time and completes other leases. It has no per-item catch around `run` or lease finalization, so a thrown repository failure may stop the pass and leave later claimed leases requiring expiry/reclaim.
- Returned public API (237–266): CRUD/list runs, `getModels`, `isMockMode`, draft/revision, Gmail connection actions and signed-state helpers. Mock Gmail connection may persist through store or process-local Set; process restart loses the fallback Set.
- `connectMockGmail` / `hasMockGmailConnection` (268–277) use store adapter when supported; otherwise mutate/read Set.

## Budgets, mock workflow, and validation

- `assertAutomationBudget` (279–288) uses shared minute/day caps (5/20 defaults) and converts denied use through common 429 helper.
- `isLocalAutomationMockEnabled` (290–299) permits local mock only when explicitly enabled, Node/Vercel Production are false, and storage is not Supabase; separate Preview mock requires explicit flag, Vercel `preview`, and local storage.
- `draftMockAutomation` (301–324) refuses write/destructive/non-Gmail tasks using keyword checks, infers basic manual/hourly/daily/weekly scheduling and unread/recent query, limits fields, and returns an unsaved draft. Keyword detection is heuristic and can miss paraphrases.
- `reviseMockDraft` (326–397) refuses writes, unsupported apps and exact weekday/time asks; recognizes intervals, message cap, unread/recent filters and rename; appends user revision to prompt, validates result, returns new unsaved draft plus change summary. This is rule-based text matching, not semantic parsing.
- `executeMockAutomation` (399–412) returns bounded fixed fake mail and explicit simulation label; never calls providers.
- `validateAutomationInput` (414–448) validates manual/schedule, interval 60–43200, maxMessages 1–10, model id pattern and active/paused; generates UUID/createdAt; supplies default task/model, normalizes Gmail query and computes active schedule nextRunAt. It accepts caller-provided `nextRunAt` for merged updates; callers must enforce server ownership (create does; update retains schedule timing rules).

## Provider/model and tool path

- `listToolCapableModels` (450–464) returns unconfigured empty list without OpenRouter key; otherwise fetches catalog with 12s timeout, selects models advertising `tools` and name/id matching OpenAI/Anthropic/Claude/GPT, caps at 100, projects id/name/context. Response non-OK -> 502. Network/timeout errors propagate.
- `executeAgent` (466–550) requires OpenRouter+Composio credentials; creates a Composio session with Gmail only, then prompts model with read-only rule and untrusted-email warning. Tool schema has only `read_gmail_messages`, closed properties, query and bounded integer. LLM request maximum three turns/45 seconds. Enforces max one tool call, rejects unknown action, pins saved Gmail query when present, clamps message count, truncates serialized tool result to 36K chars, requires a Gmail read before answering, and returns bounded summary plus count. Any model failure becomes normalized provider error; no email write tool is available in schema/session.
- `createComposioSession` (552–570) binds `user_id` to caller, enables only Gmail and allowed fetch tool, disables multi-execute/search/manage-connections, and requires session id.
- `fetchGmailMessages` (572–585) fetches tool schema, selects only exact allowed slug, maps accepted parameter names, invokes one tool and projects bounded email rows.
- `buildGmailToolArguments` (587–602) maps only query/max/user keys present in tool schema and fills required defaults; if schema has no recognized keys, uses fallback three-key shape.
- `extractEmailRows` (604–613) accepts several provider result shapes, selects subject/from/date/snippet from common fields/headers, bounds field lengths and removes rows with no subject/snippet. Email bodies are bounded text sent to the model; no full raw payload is persisted by this method.

## Connection state and error handling

- `startGmailConnection` (615–625) requires Composio settings, signing secret, and explicit callback identity verification configuration; calls Composio and requires redirect URL plus session URI or connected account id; returns redirect/expiry.
- `listGmailConnections` (627–637) filters response again by exact user id and Gmail toolkit before exposing id/status/alias.
- `completeGmailConnection` (639–645) accepts only HTTPS URL string <=2048 and forwards session URI/user ID to Composio. It does not restrict host to known Composio callback origin; identity verification/config gate is relied upon.
- `signConnectionState` (647–652) signs user/chat/10-minute expiry/nonce via HMAC-SHA256.
- `verifyConnectionState` / `connectionChatId` (654–660) expose selected fields from `readConnectionState`.
- `readConnectionState` (662–676) splits payload/signature, validates constant-time HMAC, parses JSON and expiry. It does not mark nonce as used, so signed state is replayable until expiry; caller must validate expected state/chat ownership as appropriate.
- `composioRequest` (678–690) calls configured/default base URL with API key header, 30s timeout and JSON body; normalizes failed response.
- `assertComposioReady` (692–695) checks Composio API key and Gmail auth-config id.
- `providerError` (697–703) maps connection-missing patterns to 409/GMAIL_NOT_CONNECTED, other client responses to 422, server errors to 502; provider message is not surfaced.
- `parseToolArguments` (705–708) accepts object or parses JSON; invalid JSON -> 422.
- `publicErrorCode` / `publicErrorMessage` (710–718) expose connection/config-safe categories and generic failure text; only explicit 503 message is partially surfaced.
- `clean`, `clampInteger`, `httpError` (720–733) sanitize control chars/length, clamp integer or default, and attach status code.
- Module export list (735–745) exposes selected constructors/helpers, not every internal provider/state function.

## Logic defects and unresolved checks

1. `runDueSchedules` claims a batch before sequentially running it; a thrown failure from `run` or completion/defer bypasses remaining claimed items. Verify repository lease expiry/reclaim and ensure the pass records per-item failures and releases/defer leases.
2. State HMAC has expiry and nonce but no nonce consumption/replay registry. Confirm callback route's state validation and one-time semantics before treating callback replay as prevented.
3. `completeGmailConnection` validates HTTPS syntax but not origin. Security depends on the Composio identity verification setting and remote callback behavior; mock tests do not establish that live.
4. Gmail schema adaptation is allowlisted, but if provider schema marks an unrecognized required field without default, request goes out missing it; expected result is provider error. Add explicit schema compatibility failure before execution.
5. Rule-based mock revision can produce false positive/negative from phrasing; it is an explicitly labeled local simulation and is not live generation evidence.
6. `automations.test.js` tests broad local flows but has no adversarial prompt injection/email payload test, live provider authorization, transport timeout, malformed provider schema or cross-process schedule lease test.

## Rembr rebuild sequence

Implement store contracts first (tenant-scoped automation/chat/run CRUD, rate budget, schedule claim/lease fencing). Then add pure validation/projection; add draft-only generation; add one-time state and verified Gmail connection; add exactly-one-read tool execution with bounded fields; add run/activity records and schedule recovery; finally add explicitly isolated mock mode and route/UI flows. Test failure/timeout, state replay, partial claims and tenant separation before enabling scheduled work.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
