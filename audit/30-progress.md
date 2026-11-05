# Audit progress

## Completed

- Created isolated `audit/fixes` from clean `master` at `06f5482` and completed source, API/data security, web/UI, configuration/CI, architecture, correctness, and performance review tracks.
- Fixed COR-001, CFG-001, and SEC-001 in separate commits; explicit-consent fixtures were corrected in `a2542cd` after the first full gate surfaced six outdated expectations.
- Expanded review confirmed SEC-001 High and independently verified the fix. WEB-001 remains a documented Tier 2 deferral due to the absent browser interaction test harness.
- Product correction: AI consent is part of the Terms acceptance, with a one-time updated-Terms gate for existing users. AI tools retain individual on/off preferences, but the UI no longer asks for separate consent at each feature.
- Web architecture follow-up split routing/auth/shell/setup/navigation concerns from `App.tsx`, separated the graph page from the library module, hardened landing-page storage access, and closed a Terms-gate route gap. See `audit/50-web-architecture-follow-up.md`.
- `audit/15`–`19` contain expanded security, web, configuration/CI, and independent consent-fix evidence.

## Verification

- Baseline `rtk npm run check`: PASS, 141 tests; typecheck, lint, API/web production builds passed.
- COR-001 focused regression: failed before the fix with `PGlite is closing`; passed after.
- SEC-001 focused tests: passed for registration defaults, explicit consent, legacy consent denial, revocation, import, worker, semantic and visual paths; explicit-consent fixture tests passed 27/27.
- Full gate after the Terms-flow correction: PASS; typecheck/lint passed, 144/144 API tests passed, API/web production builds passed. Vite still reports large chunks over its 500 kB advisory.
- `npm audit --omit=dev`: 0 vulnerabilities. `git diff --check`: PASS at prior commits.
- Earlier production Vite preview and dev server returned HTTP 200 for app routes/assets. No complete keyboard/device walkthrough was run.

## Release

The user directly authorized commit and production push, overriding the attached prompt's branch-only/no-deploy instruction. Commit `c0eb3bc` was pushed fast-forward to `master`. Render web deploy `dep-dbm6en3bc2fs73aqp7ig` and worker deploy `dep-dbm6en3bc2fs73aqp7s0` both reached `live`; production `/api/health` returned HTTP 200.

## Remaining limits

Hosted RLS/grants, authenticated WorkOS OAuth, real provider roundtrips, browser/device accessibility and rollback remain unverified. No migration or credential changes were made. See `NEEDS_USER.md`.
