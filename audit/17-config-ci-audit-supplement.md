# Configuration and CI audit supplement

Scope: workspace manifests and lockfile usage, GitHub Actions, worker Dockerfile/build context, Render configuration; no credentials were read and no provider was contacted.

ID: CFG-001 | Severity: Medium | Confidence: LIKELY
Location: .github/workflows/ci.yml:L7-L17
Problem: The CI workflow runs `npm ci` and the full test/build commands for every pull request without declaring a restrictive `GITHUB_TOKEN` permission set. `actions/checkout@v4` persists its credential by default; install/build scripts execute in the checked-out repository context and can read the checkout credential. If repository default token permissions are write-enabled, an untrusted PR or compromised dependency can use that token to modify repository contents during CI.
Evidence: Workflow triggers on `pull_request` at L3-L5, checks out without `persist-credentials: false` at L11, runs `npm ci` at L16 and project scripts at L17, and defines no workflow/job `permissions` block (entire file is 17 lines). No GitHub repository token-permission settings were inspected.
Impact: Under write-enabled default permissions, malicious PR code or install hooks could obtain a repository-scoped write-capable CI token and push or alter repository content. Fork PR tokens are normally read-only, but same-repository PRs and repository defaults can widen exposure.
Fix: Set least-privilege workflow permissions (at minimum `permissions: { contents: read }`) and set `persist-credentials: false` on checkout because no later step needs authenticated Git operations.
Tier: 1 | Effort: S | Risk of fix: Low | Depends on: none

Disposition: fixed in `6568c27`; `.github/workflows/ci.yml` now declares `permissions: contents: read` and checkout uses `persist-credentials: false`. CI requires no authenticated Git operations afterward.

## Other configuration evidence

- `package.json:6-8` requires Node `>=22.13`; CI uses Node 24 (`.github/workflows/ci.yml:12-15`), while `Dockerfile.worker:1` uses Node 22.22. Both satisfy the declared engine floor; no concrete runtime incompatibility was established.
- `Dockerfile.worker:3-6` pins the Debian ffmpeg package version and cleans apt lists. It copies workspace manifests and runs `npm ci --include=dev`, then builds the API (`:8-15`). `.dockerignore:7-9` excludes `.env*` and re-includes only `.env.example`.
- Render web and worker services are configured for `master` auto-deploy; this matches the current Render service settings observed by the orchestrator. No deployment was triggered by this review.
- `npm ci` and `npm run check` passed in the final local gate. `npm audit --omit=dev` reported zero production vulnerabilities. Local `npm ls --all --depth=0` showed several extraneous packages in `node_modules`, but no manifest/lockfile defect was established.
- The workflow lacks browser/E2E or accessibility tests and coverage thresholds; this is a coverage limitation rather than a confirmed defect.
- No installed license scanner was found; transitive license compliance was not verified.

## Coverage limits

Reviewed all three manifests, root lockfile workflow usage, full CI workflow, Dockerfile, dockerignore and Render blueprint. GitHub repository settings, token defaults, branch protection, hosted build settings beyond listed service data, and license metadata were not inspected.
