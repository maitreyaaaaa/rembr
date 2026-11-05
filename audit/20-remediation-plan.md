# Remediation plan

## Batch 1: confirmed correctness

- COR-001 (Medium, Tier 1): await import-finalization inside the failed-job transaction. Add regression coverage that the imported job settles before `processNextJob` resolves. Verify with focused test and full `npm run check`.

## Deferred

- No confirmed Critical/High security findings from the bounded source review.
- Hosted database/RLS/grants, demo account runtime configuration, OAuth client roundtrip, external providers, and production deployment are outside local verification and require environment access; no changes are proposed.
- No speculative bundle optimization: no measured user-performance baseline.
- Low severity: local node_modules has extraneous packages; not a tracked dependency defect.

No schema changes, dependency upgrades, or behavior redesigns are planned.
