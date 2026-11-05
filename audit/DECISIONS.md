# Decisions

## 2026-11-05: Production push authorized by direct user instruction

Decision: complete the audit on `audit/fixes`, then fast-forward its commits to the Render production branch `master` and verify the resulting deployment.

Reason: the user directly requested autonomous completion, commit, and production push. The attached audit procedure separately required an isolated branch and prohibited pushing or deploying. The user's direct request controls this release decision and overrides that constraint. `render.yaml` and live Render settings identify `master` as the auto-deploy branch, so a push will release both web and worker services.

Release limit: no force push; confirm remote ancestry and a clean worktree before pushing; verify deployment status and `/api/health` afterward.

## 2026-11-05: Limit automated scanners to installed tools

Decision: report scanner gaps rather than install additional tooling. Use existing npm audit and bounded Git history marker scan.

Reason: the audit prompt prohibits installing global tools and asks to continue when tools are absent.
