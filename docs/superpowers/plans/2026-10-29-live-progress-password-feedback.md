# Live Import Progress and Password Feedback Implementation Plan

> **For agentic workers:** Use the superpowers:executing-plans skill to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Show accurate, live import completion and provide continuous, evidence-based password guidance with the approved 15-character signup policy.

**Architecture:** Add a small owner-scoped progress API backed by one database aggregate and poll it while the import page is visible. Use UIArc's progress component adapted to Rembr's existing CSS; score passwords locally with zxcvbn-ts, validate and block common/contextual passwords on the API, and use Argon2id for new hashes while retaining legacy bcrypt verification.

**Tech Stack:** React 19, TypeScript, Express 5, SQL via `DatabaseHandle`, Supabase/Postgres and SQLite-compatible query layer, UIArc Progress (`motion`, `lucide-react`), `@zxcvbn-ts/core`, Argon2id package.

**Spec:** `docs/architecture/live-import-progress-and-password-feedback-design.md`

## Global Constraints

- Registration minimum: 15 Unicode code points; remove uppercase/lowercase/number/symbol composition rules.
- New passwords are scored locally; never send them to an estimator, Render API, analytics, or logs.
- The progress endpoint is authenticated, profile-gated, owner-scoped, and returns aggregate counts only.
- Poll every 1 second only while visible and nonterminal; pause when hidden, prevent overlapping requests, resume immediately, and back off transient errors.
- Preserve access for existing bcrypt accounts; do not bulk-reset passwords.
- Follow existing React/CSS patterns; do not add shadcn or Tailwind.

## Review Focus

- Zero-job imports (duplicates-only or parse failure): no division by zero or false 100% progress. Test the empty aggregate.
- Jobs paused via `job_pause_states` while their status is still queued/processing: count as paused and unfinished. Test joined aggregate counts.
- Foreign-owner import ID: return not found. Test authenticated route isolation.
- Passwords containing Unicode or more than 72 UTF-8 bytes: count code points and hash the full input. Test code-point counting and Argon2 round-trip with a long Unicode password.
- Legacy bcrypt account: login still succeeds. Test legacy hash verification and no password reset behavior.

---

### Task 1: Owner-scoped import progress aggregate

**Files:**
- Modify: `apps/api/src/imports/repository.ts`
- Modify: `apps/api/src/imports/service.ts`
- Modify: `apps/api/src/imports/routes.ts`
- Test: `apps/api/test/phase-three-imports.test.ts`

**Interfaces:**
- Add repository/service `progress(ownerId: string, importId: string)` returning `null` for an import not owned/found and otherwise `{ importId, status, total, settled, saved, paused, queued, processing, retryWaiting, failed, cancelled, parseFailed }` with numeric counts.
- Add `GET /imports/:id/progress` with existing `signedIn` and `profile` middleware; preserve existing `GET /imports/:id` behavior.

- [x] Add API tests for mixed completed/partial/failed/queued/retry-wait/processing/paused counts, parse failures, zero jobs, and foreign ownership.
- [x] Run focused progress API coverage; confirm the route regression before implementation.
- [x] Implement one aggregate query with owner/import predicates and pause-state join; define `settled = completed + partial + failed + cancelled`, `saved = completed + partial`, and `total = all processing jobs`.
- [x] Add compact progress route; map a null service result to the existing safe 404 response.
- [x] Run the focused API tests and `npm run typecheck --workspace @rembr/api`.

### Task 2: UIArc progress component and visibility-aware polling

**Files:**
- Modify: `apps/web/package.json`, root `package-lock.json`
- Create: `apps/web/src/components/ui/progress.tsx`, `apps/web/src/components/ui/progress.module.css`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/styles.css`
- Test: add a focused API-client/UI logic test only if an existing web test harness is available; otherwise verify with web lint/typecheck/build and browser interaction.

**Interfaces:**
- `Progress({ value, max, label, showValue, className })` displays bounded determinate progress with synchronized animated fill/value, success check at completion, reduced-motion support, `role="progressbar"`, and the supplied accessible values.
- Import detail tracks `ImportProgress`, refreshed from `/api/imports/:id/progress` independently of the one-time full detail request.

- [x] Fetch the supplied UIArc registry source; adapt it to the existing CSS token system, omitting registry-only motion tokens while keeping the behavior and accessibility contract. Add only `motion` and `lucide-react` if absent.
- [x] Replace repeated full-detail polling with compact one-second progress polling; stop on terminal state, pause while hidden, refresh immediately on visibility return, prevent overlapping requests, and back off on failures without discarding last-known counts.
- [x] Replace the static result-count line with the determinate component plus explicit saved, paused, waiting/active, failure, parse-failure, and duplicate summaries; handle `total === 0` without invented completion.
- [ ] Browser verification of authenticated import progress, pause/resume, and terminal UI remains outstanding; web lint, typecheck, build, and source-level reduced-motion/ARIA behavior pass.

### Task 3: Continuous password estimation and signup policy

**Files:**
- Modify: `apps/web/package.json`, root `package-lock.json`
- Modify: `apps/web/src/components/PasswordStrengthField.tsx`, `apps/web/src/styles.css`
- Modify: `apps/api/package.json`, root `package-lock.json`
- Create: `apps/api/src/auth/passwords.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/phase-one.test.ts` (or a focused `apps/api/test/passwords.test.ts`)

**Interfaces:**
- Export `countPasswordCodePoints(password: string): number`, `validateNewPassword(password: string, email: string): { ok: true } | { ok: false; code: 'password_too_short' | 'password_blocklisted' }`, `hashNewPassword(password: string): Promise<string>`, and `verifyPassword(password: string, encodedHash: string): Promise<{ valid: boolean; needsRehash: boolean }>`.
- Frontend estimator returns zxcvbn-ts score 0–4 and feedback locally; UI requirements display only “At least 15 characters” and any actionable estimator feedback.

- [x] Add API tests for 14 vs 15 Unicode code points, common/contextual blocklist values, full Unicode hash/verify beyond 72 UTF-8 bytes, and legacy bcrypt login.
- [x] Run focused password tests and confirm they fail before implementation.
- [x] Add an Argon2id implementation with encoded parameters and a versioned local common/contextual blocklist; use consistent NFC normalization before code-point counting and hashing. Preserve bcrypt verification for existing hashes without auto-rehashing inputs over 72 bytes.
- [x] Switch registration validation to the shared password policy and remove old 12-character response text; keep login validation compatible with existing accounts and maximum length.
- [x] Add zxcvbn-ts core + English/common dictionaries; update the field on every keystroke with no network call, independent policy guidance, accessible meter values, and a graceful estimator-load fallback.
- [x] Run focused API password tests, full API/web lint, typecheck, tests, and build; manually verify signup feedback with synthetic values. API tests cover legacy login compatibility.

### Task 4: Docs, final review, and delivery

**Files:**
- Modify: `docs/architecture/live-import-progress-and-password-feedback-design.md`
- Modify: this plan with completed checkboxes and any verified implementation decisions.

- [ ] Review implementation against every acceptance criterion in the design; authenticated progress behavior still needs browser verification.
- [x] Run equivalent typecheck, lint, sequential full API tests, and build commands; review `git diff --check` and the final scoped diff.
- [x] Commit only the implementation files on `feat/live-import-progress-password-feedback` and push the branch (implementation: `5c64773`).
