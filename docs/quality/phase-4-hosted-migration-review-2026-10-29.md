# Phase 4 hosted migration review

**Status:** Read-only preflight. No hosted schema change was applied.

## Scope and evidence

- Inspected the connected Supabase project's health, recorded migrations, public table definitions, and security/performance advisors on 2026-10-29.
- Inspected local migrations on `feat/phase-4-search-knowledge-ai` at `2177117`.
- The hosted project reports `ACTIVE_HEALTHY` and records 11 migrations. The repository contains 13 migration files.
- The first two migration versions match exactly. Nine shared migration names have different local and hosted version IDs:

| Migration | Local file version | Hosted version |
| --- | --- | --- |
| `rembr_import_media_ai` | `20261029060507` | `20261029065358` |
| `rembr_cancelled_import_entries` | `20261029074000` | `20261029071417` |
| `rembr_smart_collections` | `20261029150000` | `20261029123532` |
| `rembr_search_feedback` | `20261029153000` | `20261029123534` |
| `rembr_library_reminders` | `20261029160000` | `20261029123536` |
| `rembr_link_health_checks` | `20261029170000` | `20261029123538` |
| `rembr_grounded_search_consent` | `20261029180000` | `20261029123540` |
| `rembr_grounded_search_usage` | `20261029190000` | `20261029123543` |
| `rembr_saved_item_summaries` | `20261029200000` | `20261029123545` |

The hosted ledger does not list the two newest local migrations: `20261029210000_rembr_analysis_entity_labels.sql` and `20261029220000_rembr_grounded_search_entity_disclosure.sql`.

## Live schema comparison

Read-only table inspection confirms the two newest migrations describe real hosted gaps:

- `ai_analysis_results` lacks `brands_json`, `tools_json`, `people_json`, and `repositories_json`.
- `smart_collections` lacks the `entity` source type.
- Existing `ai_search_preferences`, usage-reservation, and saved-item-summary tables are present.

## Effects of the pending migrations

- `20261029210000_rembr_analysis_entity_labels.sql` adds four bounded JSON-array columns, permits entity-backed Smart Collections, cancels queued or paused analysis jobs whose owners have not accepted consent v2 (except jobs held for uncertain usage), and disables older analysis consent.
- `20261029220000_rembr_grounded_search_entity_disclosure.sql` disables grounded-search consent that is not v5 so the new disclosure must be accepted before provider use.
- These statements do not drop user content, but they change consent and job state. Owners with older consent will need to opt in again; canceled analysis work may need to be requeued.

## Migration-history risk and next steps

The hosted and local migration versions do not line up for nine already-recorded migration names. A read-only query retrieved the statements stored in `supabase_migrations.schema_migrations`; after normalizing CRLF line endings and the terminal newline, MD5 hashes matched the local SQL contents for all 11 recorded migrations. This confirms that the version mismatch is bookkeeping drift, not a difference in the SQL already applied. The Supabase CLI is not installed in this checkout, and no attempt was made to repair history or apply migrations.

Before a hosted write:

1. Use a correctly linked Supabase CLI checkout and its current `supabase migration list` / `supabase migration repair --help` output to confirm the exact version pairs and supported repair syntax.
2. Because all 11 remote SQL bodies match the local files, repair only migration history: mark the nine hosted alternate version IDs reverted and their corresponding local filename versions applied. Do not re-run the already-applied SQL.
3. Validate the two new migrations against the reconciled history locally and in a non-production database or isolated branch.
4. Review the consent/job impact and obtain approval for the hosted schema write. Then apply the two pending migrations through the standard migration workflow and verify columns, constraints, migration history, application health, and owner-scoped entity retrieval.

## Advisor baseline

The hosted advisor reported RLS enabled without policies on 41 public tables (INFO), one mutable `search_path` warning for `public.rembr_enforce_instagram_import_order`, five unindexed foreign keys (INFO), and 18 unused indexes (INFO). These are observations of the current project's backend-only schema and were not introduced or changed by this review. Reassess before exposing direct Data API access; this is not a complete security audit.

## Local verification

- `npm.cmd run check` passed: API/web typecheck, API/web lint, 91 API tests, and API/web production builds.
- The web bundle still emits the existing large-chunk warning.
- Supabase migration reference: [Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations).

