# Security audit findings

Audit branch: `audit/fixes`; read-only review. No application files changed.

## Findings

No CONFIRMED or strongly LIKELY Critical, High, or Medium security finding was established in this pass. No speculative issue is promoted to a finding.

## Evidence reviewed

- API route inventory: `rg -n 'router\\.(get|post|put|patch|delete)|app\\.(get|post|put|patch|delete)' apps/api/src -g '*.ts'` returned 72 declarations. Authentication/account, library, organization, imports, jobs, AI, knowledge, semantic search, Smart Collections, personal API keys, integration API, MCP, and health/auth public routes were inspected.
- `apps/api/src/app.ts:47-108`: Helmet, explicit single-origin credentialed CORS check, 16 KiB strict JSON parser, and request ID setup precede routes. Auth registration/login use a 10-per-15-minute limiter (`:111`, `:160`); URL capture is session/profile gated, schema-limited and rate-limited (`:219-235`).
- `apps/api/src/auth/sessions.ts:47-59,67-101`: session cookies are HttpOnly, SameSite=Lax, Secure in production; only a digest is stored; expiry, disabled accounts and remembered-session renewal are checked.
- `apps/api/src/auth/api-keys.ts:21-30,35-72,79-123`: strict scope/expiry schema, one-time token response, digest storage, constant-time comparison, account/revocation/expiry/scope checks, and owner-scoped revocation. `apps/api/src/integrations/api-v1.ts:22-27,34-70` applies read/write scopes, rate limits and bounded schemas to API-key endpoints.
- `apps/api/src/ai/visual-search-routes.ts:84-111`: visual search requires a signed-in user, profile, per-minute limiter, one bounded upload, verified image MIME and explicit current consent.
- `apps/api/src/config.ts:13-29,61-69,72-87`: secret settings are environment-driven; configuration is validated and production cookie security derives from `NODE_ENV`. Values were not inspected or copied.
- `.gitignore:1-14` ignores `.env` and `.env.*` while allowing `.env.example`; `git ls-files '.env*'` showed only `.env.example` tracked.
- Supabase migration search found no `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` declarations in the inspected migration set. The app uses a server-side database handle and service-role storage. This raises a defense-in-depth verification gap, not a proven standalone exposure; hosted grants/RLS configuration were not accessed.

## Coverage limits

- This was a targeted code review, not a full line-by-line audit of every route implementation or query. Owner-scoping appears consistently in reviewed handlers and repositories, but a complete per-query proof remains open.
- No production database, Supabase dashboard, Render environment, live API, or external provider was accessed.
- No secret scanner or static security analyzer was run in this bounded pass; Git history secret scanning is still pending in the main audit.
- MCP OAuth/JWT validation was not exhaustively audited. Current runtime integration enablement and hosted OAuth configuration are unverified.
- No hostile-request/fuzzing run was performed. Tests are left to the baseline suite.

## Review notes (not findings)

- `/api/auth/demo` is intentionally unauthenticated when `REMBR_DEMO_OWNER_ID` is configured (`apps/api/src/app.ts:185-192`). It creates a remembered session for that configured owner. The production exposure and whether the demo account is disposable/read-only depend on hosting configuration and account policy; do not infer those from source alone.
- No migration or database setting was modified.
