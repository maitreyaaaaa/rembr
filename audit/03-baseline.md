# Baseline (before source changes)

Branch: `audit/fixes`; starting commit `06f5482`. Worktree was clean before audit artifacts. Node requirement: >=22.13; npm workspaces: API and web.

## Verification gate

- `rtk npm run check`: PASS. API/web typecheck and ESLint passed; 141 API tests passed, 0 failed; API TypeScript build and Vite production build passed. Web output: 2824 modules; largest emitted chunk `PasswordStrengthField` 1,663.33 kB (848.92 kB gzip), shared index 703.27 kB (222.21 kB gzip); Vite emitted the >500 kB advisory. No web tests are defined.
- The Vite build exercised the production bundle; the built app was not started or browser-smoke-tested in baseline.
- `rtk npm audit --omit=dev`: PASS, 0 production vulnerabilities.
- `rtk npm ls --all --depth=0`: workspaces resolve; several extraneous packages exist in the current local `node_modules` tree (not declared in manifests). No dependency changes made.
- `rtk git diff --check`: PASS before source edits.

## Repository/security tools

- Tracked files: only `.env.example` variants; local `.env*` files are ignored and their contents were not read into output.
- `git log --all -G` scan for common AWS, GitHub, OpenAI-style token and PEM markers: no matching history lines. This is a narrow regex scan, not a full secret scanner.
- `gitleaks`, `trufflehog`, `semgrep`, `knip`, and `madge` were not found on PATH. No global or new tooling installed.
- CI (`.github/workflows/ci.yml`) runs `npm ci` and `npm run check`; no coverage thresholds, browser tests, or production smoke checks are configured.
- API has 25 test files; web has no test files. The baseline suite exercises many API and worker critical paths but does not provide a coverage percentage.

## Baseline limits

No production services, hosted database/RLS, Render environment, provider APIs, email/payment services, external browser, device, or real media model were accessed. Performance telemetry/load-test evidence is not configured. Historical secret scan used bounded common patterns only.
