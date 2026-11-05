# Tests and quality audit

## Evidence

- The root `check` script runs workspace typecheck, lint, tests, and builds (`package.json:20-24`). API tests run serially through Node's test runner (`apps/api/package.json:12`); the web workspace defines typecheck, lint, and build but no test script (`apps/web/package.json:7-10`).
- GitHub Actions runs `npm ci` and `npm run check` on pushes and pull requests (`.github/workflows/ci.yml:1-15`).
- The repository contains 25 API test files and no web test files in the tracked test-oriented path inventory (`apps/api/test/*.test.ts`; `rg --files apps/web` listed no test files). This is a coverage gap, not proof of a specific defect.
- E2E/browser, accessibility automation, coverage thresholds, mutation testing, dependency/license review, and production smoke checks are not part of the visible CI workflow. No E2E evidence was independently collected in this pass.

## Findings

No specific test-quality defect with a demonstrated false assertion was confirmed in this pass. Static inventory shows automated web interaction coverage is absent; report as a coverage limitation rather than a code finding.

## Verification status

The orchestrator is running the baseline `rtk npm run check`; this report does not duplicate that run. Results must be taken from `audit/03-baseline.md` after it completes. No additional tests were run by this reviewer.
