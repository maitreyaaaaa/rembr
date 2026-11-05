# Final report

## Result

The audit found and fixed three issues:

- **SEC-001 (High, Confirmed):** accepting Terms implicitly enabled four AI-processing features. New accounts now have those features disabled; older signup-seeded preferences fail closed; provider calls require explicit current-version consent; revocation is available. Commit `4bc2266`; follow-up tests `a2542cd`.
- **COR-001 (Medium):** failed imported jobs returned before import finalization completed. Commit `d57f6ef` awaits finalization within the transaction and includes a regression test.
- **CFG-001 (Medium, Likely):** CI had no least-privilege token permissions and checkout persisted credentials. Commit `6568c27` restricts permissions and disables credential persistence.

One Tier 2 UI finding remains deferred: WEB-001, onboarding dialog focus handling. It needs keyboard interaction regression coverage before changing the bespoke dialog; see `16-web-ui-audit-supplement.md`.

## Verification

- Baseline `rtk npm run check`: PASS, 141 tests; typecheck/lint and API/web builds passed.
- COR-001 focused regression: reproduced `PGlite is closing` before the fix and passed after.
- Consent-focused test suites: PASS, including all six full-gate fixture updates (27/27 in targeted suites).
- Final full gate after `a2542cd`: PASS; typecheck and lint passed, all 143 API tests passed, and API/web production builds passed.
- `rtk npm audit --omit=dev`: 0 vulnerabilities.
- Earlier production Vite preview and dev server served `/` and app assets with HTTP 200. Bundle warning remains: large chunks exceed Vite's 500 kB advisory; no performance measurements justified optimization.

## Changed application files

- `apps/api/src/worker/process-job.ts` and `apps/api/test/phase-three-imports.test.ts`: await and test import finalization.
- `.github/workflows/ci.yml`: least-privilege workflow token and no persisted checkout credential.
- `apps/api/src/app.ts`, new `apps/api/src/auth/consent.ts`, AI/import/knowledge/visual/semantic routes and repositories, and related web preference UI: explicit AI consent, fail-closed legacy handling, revocation, and safe disclosure.
- Relevant API tests cover explicit consent defaults and processing gates.

## Release and evidence limits

The user directly instructed commit and push to production. That direct instruction overrides the attached audit prompt's branch-only/no-push constraint. Render services auto-deploy from `master`; the reviewed changes are released only after local checks and report commit.

Hosted RLS/grants, authenticated WorkOS OAuth, real provider behavior, browser/device accessibility, production monitoring and rollback remain outside local proof. No migrations, dependency upgrades, production credentials, or external provider data were changed/accessed. The bounded history scan found no obvious credential marker; it is not a full secret-scanner result.

See `NEEDS_USER.md` for remaining hosted and manual verification. The audit run will record exact push, deployment, and health evidence in its session handoff.
