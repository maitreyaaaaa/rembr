# Remediation plan

## Completed

- COR-001 (Medium, Tier 1): failed import-job finalization is awaited inside the transaction. Regression coverage reproduced the race before the fix and passes afterward. Commit `d57f6ef`.
- CFG-001 (Medium, Likely, Tier 1): CI now grants only `contents: read` and checkout does not persist credentials. Commit `6568c27`.
- SEC-001 (High, Confirmed, Tier 1): AI processing is covered by one informed Terms acceptance. New accounts record that acceptance and current AI disclosure versions; existing users must accept the updated Terms once before AI features work. Per-feature settings remain available to turn features off. Commit `4bc2266`, test follow-up `a2542cd`, and Terms-flow correction pending release.

## Deferred

- WEB-001 (Medium, Likely, Tier 2): onboarding demo dialog lacks focus handling. Deferred because there is no web interaction test harness; add keyboard regression coverage before changing it. See `16-web-ui-audit-supplement.md`.
- Hosted database/RLS/grants, OAuth roundtrip, provider behavior, browser/device accessibility, production monitoring and rollback cannot be proven by local tests. Details are in `NEEDS_USER.md`.
- No speculative bundle optimization: no measured user-performance baseline.
- Local `node_modules` contains extraneous packages; no tracked dependency defect was established.

No schema migrations or dependency upgrades were made. Production release is authorized by the user's direct instruction; the attached audit document's no-push constraint is overridden for this release. Render is configured to auto-deploy `master`.
