# Rembr Backend Rebuild Sequence

This is the evidence-derived implementation order for the backend after the audit. It is not application code and it does not approve any speculative feature. Each stage should have its own product acceptance criteria, API contract, data model, test plan, and issue trace.

## Architecture target

### Preserve from current behavior

- A replaceable persistence boundary supporting local/demo and hosted storage.
- User-scoped import and library workflows, with review before indexing when policy requires it.
- Durable background processing with leases, retry backoff, attempt caps, pause causes, and worker observability.
- Search that can degrade from semantic/AI retrieval to deterministic keyword and metadata search.
- Revocable, scoped tokens for browser extension and agent integrations.
- Explicit approval before consequential publishing and an explicit user export acknowledgement before deletion requests.
- Private uploads, bounded payloads, user ownership checks, audit trails, and correlation IDs.

### Proposed improvements to evaluate (not current behavior)

1. Define typed, versioned domain contracts for items, imports, analyses, jobs, automation, API errors, and provider outcomes.
2. Split the large persistence adapters into cohesive repositories or query modules while keeping transactions and ownership predicates explicit.
3. Make adapter capabilities explicit at construction/startup; avoid route-level feature detection that degrades silently.
4. Keep business state transitions in application/domain services; route handlers should validate transport input and map typed outcomes.
5. Use shared, atomic rate-budget enforcement for limits that must hold across multiple API instances. The current generic limiter is in-memory/process-local (`http/rateLimit.js:9-74`); DB budgets are a separate service.
6. Specify a stable error envelope and idempotency behavior for retries, imports, payment callbacks, and workflow publishing.
7. Build observability around privacy-safe IDs and summarized metadata; do not place raw user content or credentials in logs.

## Build sequence and acceptance gates

### 0. Baseline and contracts

- Create the Rembr repository and document baseline provenance.
- Freeze domain terms and define the typed store capability matrix.
- Create C4 Context/Container/Component diagrams and a route-to-use-case map.
- Acceptance: every current API endpoint is assigned an access class, owner rule, request/response schema, error set, and backing use case.

### 1. Application foundation

- Create server bootstrap, configuration validation, request IDs, structured errors, security headers, CORS allowlist, auth middleware, and rate-budget interfaces.
- Add unauthenticated health only; mount other route groups behind an explicit route-level access declaration.
- Acceptance: tests prove public routes do not access user data; missing/invalid user/admin/worker/extension/agent credentials fail closed; correlation IDs persist through success and errors.

### 2. Identity, profiles, and ownership

- Model user/profile/onboarding/admin state, blocked status, account deletion lock, and scoped token lifecycles.
- Add user-scoped repository queries and RLS for client-facing database access.
- Acceptance: cross-user access tests cover every owned entity; revocation/expiry/scope checks apply to extension and agent tokens.

### 3. Capture and import

- Implement supported source parsers as isolated deterministic modules.
- Normalize to a canonical saved-item model; support dedupe; persist imports/items and job records in one consistent operation.
- Add direct link capture and bounded multipart/chunked storage upload with user-prefixed paths.
- Acceptance: malformed/empty/oversized/duplicate/partial/chunked imports behave predictably and are recoverable; uploaded assets cannot cross tenant boundaries.

### 4. Human review and library operations

- Build list/detail APIs, filters, sorting, source metadata, notes/assets, archive snapshots, link health, reminders, manual review, approval, and archive/delete flows.
- Preserve `needs_review` as a gate and keep review edits separate from enrichment status.
- Acceptance: state transitions are tested; all item operations verify owner; failed archive/link checks preserve useful library data and safe failure state.

### 5. Indexing and analysis

- Persist jobs and atomically claim leases; implement deterministic metadata extraction first.
- Add provider adapters, encrypted credential persistence, local ML adapters, text and visual embeddings, content hashes, and optional media download.
- Represent partial analysis and processing level explicitly; use retries only for retryable errors and pause on missing credentials/credit/quota.
- Acceptance: duplicate enqueue, concurrent claim, expired lease, backoff, max attempts, provider timeout, partial output, and retry/reprocess cases are deterministic.

### 6. Search and knowledge features

- Build keyword/metadata retrieval, optional semantic retrieval, relevance feedback, grounded library chat, visual similarity, Lens, graph export, and smart collections.
- Apply per-user AI budgets before provider calls and return clear degraded-mode responses.
- Acceptance: search results remain user-scoped; answers cite selected library evidence; no-provider and quota states return deterministic fallback behavior.

### 7. Integrations, billing, and automation

- Add agent/MCP access, Telegram capture, Stripe checkout/webhook ledger, automation draft/revise/run/schedule, Gmail read connection, and content workflow generation/publishing.
- Keep external side effects behind explicit user approval, signed callbacks, idempotency keys, and audit records.
- Acceptance: callback replay, bad signatures/state, duplicate payment events, cross-user token access, and rejected publish approvals are covered.

### 8. Account export, deletion, administration

- Build asynchronous user export with status/ready artifact lifecycle; implement user deletion request and human-admin approval/execution steps; add sanitized admin summaries/audit history.
- Acceptance: data export is owner-scoped; deletion steps are retryable/idempotent; user-facing status is redacted; audit evidence survives retention/deletion policy as explicitly decided.

### 9. Full backend integration and operations

- Run contract, store-adapter parity, worker concurrency, security boundary, migration/RLS, load, and provider-failure checks.
- Verify deployment configuration and health only in authorized staging; separate source evidence from live verification.
- Acceptance: all endpoints are represented in OpenAPI and test mappings; no undocumented migration, route, worker state, or provider path remains.

## Backend risk and improvement register

| Finding | Evidence | Classification | Rembr action |
|---|---|---|---|
| Store contract is implicit and has optional-method branches | `application/libraryWorkflow.js:90-97`, `:117-123`; related route 501 branches | Confirmed design risk | Define typed required capabilities and adapter conformance checks |
| Supabase adapter is very large and owns many domains | `stores/supabaseStore.js` spans core library, jobs, billing, export, admin, automation, and mapping logic | Confirmed maintainability concern | Split by bounded contexts, preserve explicit transactions/owner predicates |
| Generic IP limits use in-memory store | `http/rateLimit.js:9-74` | Confirmed multi-instance limitation | Decide which limits need distributed enforcement; reuse shared DB budgets where appropriate |
| Error mapping is global, but response status can be set by arbitrary `error.statusCode` | `http/errors.js:8-45` | Confirmed behavior; audit validation | Use typed safe errors and ensure internal failures do not expose sensitive detail |
| Pre-auth route families require local guards | `server.js:162-189` mounts global auth after public/admin/worker/token/callback groups | Confirmed routing invariant | Declare auth mode in route registry and test every route's access boundary |
| Runtime store uses service-role Supabase client | `stores/supabaseStore.js` client construction; migrations define RLS separately | Confirmed trust boundary | Keep all service-role operations owner-filtered and test cross-tenant predicates |
| Current route contracts are handler-defined rather than one complete API schema | `routes/*.js`; no OpenAPI file identified in orchestration source inventory | Inventory evidence | Maintain OpenAPI spec and contract validation alongside handlers |
| Local and hosted runtime settings are not equivalent by configuration alone | `config.js`, worker preflight and store adapters | Confirmed; live state unknown | Validate a capability matrix, and never infer deployment/provider readiness from defaults |

## Source-backed decision log

| Decision | Current evidence | Rebuild stance |
|---|---|---|
| Separate request handling from domain work | `routes/*` call application/workflow services; server injects `workflows` | Preserve and strengthen boundary |
| Use a durable worker for expensive jobs | `runtime/workerRuntime.js`; migrations for job lease/claim functions | Preserve; require atomic claim/retry semantics |
| Human review precedes indexing for some saves | `libraryWorkflow.js` and `needs_review` item state | Preserve policy and document every path that creates this state |
| Support local development storage separately from hosted persistence | `worker/indexing-runner.js:11-23` and `config.js` | Preserve only if adapter parity is tested |
| Keep AI enrichment optional | `config.js`, `worker/preflight.js`, provider clients | Preserve deterministic fallback and observable degraded mode |

## Documentation and verification required per feature

For each backend feature, the final Rembr docs must link: UI or caller → route/method → application workflow → services → repository/store operation → table/migration/provider → auth/rate limit → tests and expected failure cases. The source coverage ledger must point to line ranges, and an unresolved route or database behavior stays marked open instead of being guessed.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
