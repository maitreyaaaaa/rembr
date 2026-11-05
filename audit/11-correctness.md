# Correctness findings (API worker review)

ID: COR-001 | Severity: Medium | Confidence: CONFIRMED
Location: apps/api/src/worker/process-job.ts:L204-L218
Problem: The failure transaction invokes `finishImportIfIdle` without awaiting its promise. The callback can therefore return and commit before the import status calculation/update finishes; query errors can also become unhandled rejections.
Evidence: At L204, `fail` is created with `database.transaction(async () => { ... })`; lines 205-217 await each prior DB operation, but L218 calls `finishImportIfIdle(database, job.owner_id, job.import_id, now);` without `await`. `DatabaseHandle.transaction` awaits the callback result before COMMIT (`apps/api/src/db/database.ts:L116-L126`). `finishImportIfIdle` performs multiple asynchronous queries and an update (`process-job.ts:L26-L36`).
Impact: On a failed final job in an import, import completion/partial status may be updated after the transaction and after `processNextJob` resolves; a DB error may leave the import stale and unreported. The outcome is timing-dependent.
Fix: Await `finishImportIfIdle` inside the failure transaction, as the success and cancellation paths already do.
Tier: 1 | Effort: S | Risk of fix: Low | Depends on: none

## Review notes

The corresponding success path awaits the helper (`process-job.ts:L194`), and cancellation does as well (`L116`), making the missing await isolated to the failed-job path. No source changes were made. Suggested verification: add/extend a worker test for a failed final import job and assert final import status when `processNextJob` resolves; then run the full gate.

Other review scope covered job claim/lease ownership, retry selection, cancellation, error mapping, and shutdown loops at a code-reading level. No additional confirmed/likely correctness findings in that bounded pass. This is not a complete audit of API routes or web behavior.
