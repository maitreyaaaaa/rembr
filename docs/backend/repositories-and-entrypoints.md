# Automation repositories and process entrypoints

**Sources read completely:** `src/repositories/automationRepository.js`, `automationChatRepository.js`, `src/ml/local-extractor-server.js`, and `src/worker/run-once.js`. No source edits or tests.

## Automation repository (`automationRepository.js`)

- `createAutomationRepository` (3–176) selects Supabase path when `store.client.from` exists, otherwise forwards to local-store methods.
- Supabase `list` (6–17) filters by user and optional trigger/status, sorts next-run or updated, requests `range(start,start+limit)` and slices to limit; the extra inclusive row yields `hasMore`. Input page/limit are expected prevalidated by service/routes.
- `get` (18–23), `save` (24–31), `createRun` (32–39), and `createRateLimitedRun` (40–52) are user-scoped read/upsert/insert operations with mapped outputs. IDs use UUID. Rate-limited run is inserted terminal-like with timestamps/activity.
- `updateRun` (53–57) updates user+run and returns mapped row or null. `listRuns` (58–62) sorts scoped child runs newest-first and limits.
- `listAllRuns` (63–95) supports status/automation/time filters, exact count pagination, then fetches automation names scoped to same user; missing/deleted automation displays fallback label.
- `delete` (96–100) user-scoped delete. `claimDue` (101–105) delegates atomicity to `claim_due_automations` RPC and maps returned rows.
- `completeSchedule` (106–119) reads current config, computes next interval, then update is fenced by id/user/lease token and clears lease. `deferSchedule` (120–130) similarly fences token and sets retry time. They are separate operations and can return false for lost lease.
- Local adapter forwarding (134–147) maps same contract to store methods.
- `toAutomationRow` (151–169) maps domain to DB snake case and overwrites updated timestamp; `toRunRow` (172–180) maps only supplied patch keys; `mapAutomation` (183–190) projects persisted schedule including internal user/lease fields; `mapRun` (193–201) projects summary/error/activity and dates.
- Review note: list's page query and map structure rely on external validation and RLS; `createRun` does not itself check automation existence/status and relies on caller+constraints. Completion reads current interval before CAS update; if schedule changed between read/update but lease token was preserved, next interval may race with edit. Validate store transaction/RPC design.

## Automation chat repository (`automationChatRepository.js`)

- `createAutomationChatRepository` (3–94) chooses Supabase if `client.from`, else local adapter.
- Supabase `list` (6–15) selects metadata-only columns, user filters, updated sort and limit; `get` (16–28) scopes chat then reads messages by user+chat ordered timestamp/id.
- `create` (29–38) inserts row with id, ownership, draft/automation link and timestamps. `update` (39–52) patches only supplied fields. `appendMessage` (53–60) inserts user-scoped chat message. `delete` (61–67) scopes delete and returns Boolean.
- Local methods (70–92) delegate and map.
- `mapChatSummary` (96–103), `mapChat` (106–113), `mapMessage` (116–123) provide domain projections and support snake/camel field compatibility.
- Review note: append is a separate insert from chat read; no application transaction or explicit parent check at this layer, so FK/RLS is relied upon. Role/content validation is expected upstream.

## Local extractor entrypoint (`local-extractor-server.js`)

- `runCli` (5–17) reads env config, creates app and listens on configured port/host; logs bound address; on SIGINT/SIGTERM calls `server.close` then exits zero. It does not enforce nonempty API key or fail shutdown on active connection timeout; app auth is optional if key empty. Entrypoint runs only when main module; export exposes `runCli`.

## One-shot worker entrypoint (`worker/run-once.js`)

- Sets `WORKER_RUN_ONCE=true` before importing `indexing-runner`, then invokes `runCli`; avoids duplicating worker boot logic. Requires indexing-runner to interpret this env flag correctly. No independent error handling is added in this file.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
