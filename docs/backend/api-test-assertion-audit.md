# `api.test.js` assertion audit

**Repository:** `D:/IScraper-main/IScraper-main`  
**File:** `apps/orchestration/test/api.test.js` (3,511 lines)  
**Review:** Entire file read in bounded chunks; all 73 top-level test cases inventoried; no test command executed. Assertions describe test intent, not passing results or production guarantees. All cases primarily instantiate the local store and an ephemeral Express server unless noted; they do not prove Supabase parity.

## Test-by-test coverage map

| Lines | Test | Assertions and behavioral contract evidenced |
|---|---|---|
| 29–73 | User data registry covers known tables | Representative account/content/activity/credential/billing/privacy/automation tables must be categorized or excluded and classified; categories require allowed classifications, purpose, retention, minimization, redaction; secret classes are credential-classified and lifecycle/export language must indicate hashing/encryption/one-time display/revocation and metadata-only export. Static registry consistency only. |
| 75–95 | Restrictive CSP | Public credit-package response includes self default, no object/frame embedding, and Supabase/PostHog connect allowlist. Does not test every directive or browser enforcement. |
| 97–124 | Health endpoint | 200/no-store, safe request ID, exact top-level/runtime key sets, typed uptime/cold-start/timestamp, no obvious config/token markers. Does not prove unauthenticated deployment health dependencies. |
| 126–176 | Workflow draft and publish approval | Authenticated readiness says approval required and Composio unconfigured; generate creates draft with publish stage and no leaked API-key marker; publishing with `approved:false` returns 409/blocked and explicit-approval missing reason. |
| 179–214 | Workflow generation budget | Store scope is `workflow_generation`; denial returns 429, Retry-After, workflow-limit error; provider is never called. |
| 217–260 | Approved Instagram publish payload | Injected Composio endpoint gets exactly one request; result submitted with Instagram tool slug, entity/connected-account IDs and expected reel/caption/media/share fields. This tests request construction only, not external publication/provider authorization. |
| 263–307 | Request/correlation propagation | Manual link save preserves request/correlation IDs in response, import, indexing and created job; job lookup returns correlation ID; job source action/reference are recorded. |
| 310–336 | Invalid IDs and safe errors | Invalid request/correlation IDs replaced by generated ID; 404 response includes IDs consistently and does not echo `secret`. |
| 339–380 | Auth setup cache and deletion guard | Two bearer requests authenticate once and ensure user once, but deletion safety assertion runs per request; both profile reads return 200. |
| 383–436 | No-AI lean search | `includeAi:false` performs one `searchLean`, zero full search/provider credential lookups, returns result, records one event with result ID and includeAi false. |
| 439–519 | AI search grounded answer | Stub search result and allowed `ai_search` budget; mocked provider prompt requests best match; response includes answer and citation tied to saved URL; one event stores result ID/includeAi true. Does not validate provider fallback. |
| 522–561 | Semantic budget denial | Semantic embedding budget denial returns 429/retry header/message before embedding provider or store search. |
| 564–603 | AI budget denial | Search result plus denied `ai_search` budget returns 429/retryAt and does not call model. |
| 606–643 | Shared budget store outage | Budget exception returns 503 generic unavailable message and suppresses model call (fail closed). |
| 646–663 | Empty CORS allowlist | Evil origin gets normal route response but no `Access-Control-Allow-Origin`. |
| 666–683 | Configured CORS allowlist | Explicit origin is reflected in response CORS header. No preflight/credential behavior tested. |
| 686–738 | User deletion request | First request creates `pending_approval`; duplicate returns same request id; risky link-save blocked with 423; privacy export remains accessible; cancellation records `canceled`. |
| 741–845 | Queued export, redaction, ownership | Creates extension secret, save, onboarding; data map/account summary include credential metadata/public ref; export request returns 202 without storage internals; other user cannot read; worker advances export to ready; download is ZIP with manifest/account/access metadata, no raw token/hash/encrypted key/service role; security activity records request without secret. Local worker execution and test fixture secret only. |
| 847–913 | Export media opt-in | Default export excludes `media-manifest.json`; `includeFiles:true` emits media manifest and content from local data URL. Storage provider-backed asset authorization not covered. |
| 915–1005 | Search logging and feedback scope | No-result query logged with raw query; successful search event stores blank query; feedback for returned item accepted, missing item gets 404; privacy export contains two events and one feedback. |
| 1007–1031 | No-results library chat | Unmatched query returns empty results/no citations and grounded no-match answer. No provider is configured in this fixture; no-results result is what proves no AI required. |
| 1033–1092 | Items compatibility and pagination | Legacy no-query endpoint returns all two items without cursor field; paged links/title query returns expected web item, total/cursor/facets/serverTime. One page only; offset mutation behavior untested. |
| 1094–1235 | Similar-visual endpoint | Seeded source/related/unrelated and other-user saves, analysis, and same-model vectors; result user-scoped, positive similarity, excludes unrelated/other-user; serialization has no internal vector keys/model. Does not test Supabase vector path or cross-model behavior. |
| 1237–1292 | Admin deletion approve/process idempotency | Admin approves pending request, bounded processing logs completion; repeated processing executes zero steps; deleted account cannot recreate deletion request (410). |
| 1295–1331 | Multipart Instagram HTML import | Two saved-post cards yield 2 total/new items and 2 queued jobs. |
| 1333–1371 | Instagram saved JSON import | JSON saved-media entry creates one queued Instagram item with canonical URL and caption. |
| 1373–1410 | Instagram HTML ZIP import | Nested saved_posts path parsed into one queued item with platform/url/caption. |
| 1412–1444 | Official singular saved_post path | Singular official nested path imports one item; sourceName retains exact nested path. |
| 1446–1507 | Canonical duplicate import | www/mobile/tracking variants deduplicate; only one new job for second new item; existing item importId/caption/done status/analysis remain unchanged. |
| 1509–1536 | Pinterest ZIP import | `pins.json` imports canonical Pinterest pin and identifies source `pinterest-export`. |
| 1538–1574 | Pinterest folders | pins, board CSV, followed text imported; profile path excluded; duplicate URL deduped; exact four canonical URLs asserted. |
| 1576–1673 | Storage-backed import | Stubbed storage download and remove; first upload imports item; second import of changed HTML preserves duplicate item's caption/import/status and queues only new item; uploaded source removed after each; duplicate job not added. No Supabase claim RPC exercised (local store with fake storage client). |
| 1675–1774 | Chunked storage import | Stub returns two chunk objects; combines into valid import; second import dedupes old item and adds new; removes both chunk objects on both passes. Does not test missing/reordered chunks/oversize or upload failure. |
| 1776–1821 | Upload path issuance | Bucket existence checked; response has one short user-prefixed randomized `.zip` path (<100 chars), original filename; no token/signed URL; fake store throws if signed URL requested. |
| 1823–1866 | Upload chunk storage | Backend client bucket, path with zero-padded part index, chunk bytes and `upsert:true` asserted. Not testing authorization or path traversal/multipart limits. |
| 1868–1908 | Manual link save dedupe | Two same Pinterest URL saves return 201; first creates one queued item/default collection/job, second reports duplicate/no new item; store has one item. |
| 1910–1953 | Searchable note | Multipart note with image creates done note with internal note URL and data URL asset, creates no indexing job, appears in keyword search. |
| 1955–1980 | Reject video note asset | Video upload returns 400 with unsupported-video message. |
| 1982–2017 | Note edit/delete cleanup | Create note/image; patch title/body/removal empties assets; delete removes saved item and asset metadata. Local data-url cleanup only. |
| 2019–2062 | Approve reviewed web save | Save link, approve edited metadata/collection; item queued; with `startProcessing:false`, response says zero newly queued jobs while existing job remains one. |
| 2064–2108 | Bulk indexing start | Two review-needed saves approved in one request; approved/job counts 2 and both queued. |
| 2110–2159 | VM worker mode | With inline disabled, indexing start says `vm-worker` queued and leaves job queued despite start requested. |
| 2161–2201 | Indexing summary | Seed one analyzing and one paused-missing-provider job; aggregate reports processing 1, paused 1 and missing-provider 1. |
| 2203–2260 | Worker auth/bounded processing | Missing key gets 403; correct worker key permits one processing pass; response visits one scope/processes one despite maxJobs 5, leaves second job queued. |
| 2262–2318 | Admin worker status safety | Unauthenticated status is 403; API-key admin gets aggregate queue/config; serialized output omits caption and private URL. |
| 2320–2373 | Extension Lens text and revoke | Create one-time `isx_` token, text search returns matching saved title, revoke makes next Lens request 401. |
| 2375–2421 | Lens image budget | Media-analysis denial returns 429/retry/message before OpenAI image request; token provision is separate. |
| 2423–2531 | Agent access and MCP | Create `isa_` token with default scopes; list returns metadata/no secret; token searches tenant library and MCP `tools/call` returns text with save ID; revoke then 401. Does not exercise malformed RPC/tool errors. |
| 2533–2569 | Extension URL capture | Extension-scoped token can create capture without web app; returns 201/title/one queued job. |
| 2571–2635 | Telegram connect and link save | Correct webhook secret; `/connect` binds chat to extension token; forwarded link returns 201/Saved and item has parsed title/Telegram collection. No replay/update-id duplicate behavior. |
| 2637–2658 | Telegram secret required | Missing Telegram secret returns 401 with error referencing secret requirement. |
| 2660–2705 | Undo URL capture | Extension token creates URL capture; delete returns item id and save disappears. |
| 2707–2756 | Undo screenshot capture | Token creates screenshot capture with extension-capture platform and asset; delete removes item. Storage object cleanup not asserted. |
| 2758–2812 | Undo selected-text capture | Token captures selected text/source/custom collection/note; projected item includes content and hashtag; delete removes item. |
| 2814–2862 | Extension library tools | Token-created save appears in recent, text search and normalized URL status lookup. Does not assert limits/pagination or scope distinctions. |
| 2864–2895 | Invalid Lens crop/image data | Invalid image data URL returns 400 and supported image types message. |
| 2897–2918 | Unsafe manual URL | Localhost link rejected 400 with local/private error. DNS rebinding/redirect safety not tested here. |
| 2920–2940 | Unsupported import upload | `.exe`/text MIME multipart is rejected 400 with allowed Instagram/Pinterest/X source message. |
| 2942–2973 | Search IP rate limit | Limit 1 allows first search and returns 429/too-many-requests on second. Uses local in-memory store. |
| 2975–3002 | Profile uniqueness | First user saves username; second user conflict gets 409/already-taken. |
| 3004–3051 | Onboarding lifecycle | POST normalizes duplicate content choices and referral/completion; invalid option 400; skip clears content/completion and sets skippedAt; GET returns persisted skip timestamp. |
| 3053–3088 | Authenticated imports require profile | Auth-required mock user blocked with 428 until profile POST; import then returns 200. |
| 3090–3109 | Provider credential API absent | POST `/api/provider-credentials` returns 404; this asserts route is not exposed, not that no legacy storage exists. |
| 3111–3130 | Credits availability | Unauthenticated local credits endpoint returns 200 and zero free/total availability. Does not exercise authenticated ownership. |
| 3132–3168 | Knowledge graph | Seed done item/analysis; GET graph reports one indexed item and expected item/topic nodes. |
| 3170–3197 | Credit packages and checkout | Three packages; first has 100 credits; without Stripe checkout disabled and checkout endpoint returns 503/coming-soon. No webhook coverage. |
| 3199–3229 | Admin credit adjustment | Missing API key 403; correct key adjustment 201 and paid balance 10. |
| 3231–3271 | Allowlisted admin identity | Signed-in regular user gets 403; configured email gets summary and user search/profile result. Local identity stub only. |
| 3273–3313 | Admin password login | Wrong password login 403; correct login 200; subsequent request authorized through email/password headers. Test demonstrates login response is not used as a session token. |
| 3315–3361 | Admin user detail | After seed profile/save/analysis/credit, detail returns email, paid balance, indexed stats/counts/job stats, null deletion, no private items payload, credit transaction and adjustment reason. |
| 3363–3408 | Admin block/unblock | Admin blocks user; private save gets 403; admin unblocks; save then gets 201. |
| 3410–3473 | Admin activity/imports/feedback moderation | User activity and imports visible; sign-in timeline included but email excluded from event metadata; admin timeline view itself audited; hide feedback removes it from public feedback list. |
| 3475–3509 | Restart paused/stuck jobs | One paused billing job and one analyzing job are both reset/queued via restart endpoint; response reset count 2. Auth requirements are not asserted in this fixture. |

## Global coverage limits and audit observations

- No Stripe webhook request or signature-verification case occurs in this file. Billing assertions cover package listing, checkout disabled without Stripe, local/admin credit ledger behavior only. `integrationRawRoutes` therefore remains without route-level webhook evidence in this test suite.
- The suite primarily exercises `createLocalStore`; storage-backed tests attach a fake storage client to a local store. It does not establish SQL/RLS/RPC correctness, Supabase adapter parity, deployed auth provider semantics, real Stripe/Composio/Telegram/OpenAI authorization, or external side effects.
- Several tests assert failure before provider calls by replacing global `fetch`; the stubs establish call ordering for the tested branch only.
- Coverage is broad across route families but leaves negative/edge combinations: JSON-RPC malformed requests, pagination cursor mutation, webhook replay/signatures, upload path/size/resource abuse, storage partial failures, provider timeout/retry/error payloads, authorization for every route, and multi-tenant concurrency.
- The separate source and migration docs remain authoritative for checked-in handler/RPC implementation traces. This test audit does not establish that every route assertion maps to all implementation branches.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
