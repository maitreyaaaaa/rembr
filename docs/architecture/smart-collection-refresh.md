# Stored Smart Collections and background refresh

User-approved direction (2026-11-04): create folders once, store them and their memberships, and update them after saves/imports rather than rebuilding on navigation.

Implementation plan:
1. Persist automatic memberships and per-account refresh revisions. Keep existing folder IDs/preferences and manual include/exclude overrides authoritative.
2. Database triggers invalidate on saved-item, note, extraction, tag, import metadata and analysis changes. Coalesce writes into one debounced account job. Seed existing accounts once through the migration.
3. A separate bounded application-worker loop leases one dirty account, regenerates using the existing deterministic/bounded rules, and atomically publishes the memberships. Fence stale leases; retain the previous snapshot after failures; changes during a build remain queued.
4. GET routes only read stored results. Explicit Refresh requests enqueue work. The UI polls only while refresh is pending, keeps existing folders visible, and distinguishes initial preparation, update, and failure states.
5. Verify isolated Postgres migrations, read-only/repeated reads, invalidation, persistence across service recreation, preference/override preservation, concurrent changes/leases, ownership, and failure recovery. No model calls are involved. Hosted migration/deployment are separate verification gates.

MVP bound: regeneration still scans the latest 2,000 saves using existing rules. This change moves that work off page loads; it does not introduce incremental per-item classification or increase provider spend.

## Resulting lifecycle

- Source transaction commits → a trigger increments that account's revision and schedules a refresh after two quiet seconds. Bulk writes share the same queue row. Rolled-back source transactions do not invalidate collections.
- A dedicated loop in the existing worker atomically claims one due account with a five-minute fenced lease. It does not use an AI provider or change existing AI-job concurrency.
- Existing matching rules run in a transaction. The automatic memberships are replaced atomically and the built revision advances only to the claimed revision. Later source changes remain dirty for another pass.
- Failure rolls back the attempted snapshot, retains the last saved memberships and schedules a 30-second retry. An abandoned lease can be reclaimed. A superseded worker cannot publish results or clear its replacement's claim.
- Folder identity, names, pins, visibility, colors and manual membership overrides remain durable. Manual corrections are merged at read time and do not require a classification rebuild. Empty generated folders remain stored.
- GET list/detail routes read stored memberships, hydrating only preview/page items when there is no search. POST Refresh returns 202 and queues work. The list polls only while pending/updating, pauses hidden-tab polling, stops on request error, and rereads on window focus.

## Files

- `supabase/migrations/20261104003000_rembr_stored_smart_collections.sql`: owner-scoped memberships, refresh revisions/leases, RLS, invalidation triggers, initial account seeding.
- `apps/api/src/smart-collections/service.ts`: stored reads, correction merging, refresh claim/build/publication/retry.
- `apps/api/src/smart-collections/routes.ts`: asynchronous refresh endpoint.
- `apps/api/src/worker/index.ts`: independent bounded refresh loop with sanitized success/failure events.
- `apps/web/src/components/SmartCollectionsPage.tsx`: saved-folder loading, retained results and background state/polling.
- `apps/api/test/smart-collection-refresh.test.ts` and `apps/api/test/phase-two.test.ts`: lifecycle and API/migration coverage.

## Verification

Seven focused lifecycle cases pass, including stable repeated reads/service recreation, owner isolation, bulk coalescing, preference/correction preservation, transaction rollback, deletion cleanup, retained snapshots on failure, concurrent invalidation, expired leases, superseded-claim fencing, notes and extraction changes. Existing Smart Collection API cases now explicitly execute the background job. The schema/RLS inventory was updated from 47 to 49 tables.

The actual React page was browser-reviewed with synthetic request fixtures: saved folders remained visible during pending refresh; polling updated the count; failure retained folders and enabled retry. No account, provider or production data was used for that UI review. The full repository gate passed: typecheck, lint, all 145 tests, and API/web builds. Vite still reports large main/password-strength chunks; this is a non-blocking bundle-size warning. `git diff --check` also passed.

## Hosted rollout gate and limits

1. Apply the new migration to the existing Supabase project before deploying this code. Deploy both API/web and worker from the same revision.
2. Allow the worker to seed existing memberships once; verify its refresh success events, a ready state and stable generated timestamp on repeated GETs.
3. Verify a bounded save/import causes pending → ready and updates the same folder IDs without overwriting preferences. This hosted mutation is not part of the isolated local checks.

The migration and worker have not been applied/deployed to production by this task. No production worker or model job was started. Search within a stored folder still hydrates the existing bounded set for text matching; list navigation does not regenerate groups. A folder detail already open during another client's save is reread on its next navigation/search rather than subscribing to live membership changes.
