# Phase 3 Architecture Design — Ingestion, Durable Jobs, and Content Processing

**Status:** Draft for user review. No Phase 3 implementation has started. Questions below must be answered or explicitly deferred before the affected behavior is implemented.

**Scope source:** [Phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md), [feature and acceptance matrix](../rebuild-plan/feature-and-acceptance-matrix.md), [screen/workflow matrix](../rebuild-plan/screen-workflow-phase-matrix.md), and [source import flow](../backend/storage-import-flow.md).
**Current product baseline:** [Phase 1 record](../rebuild-plan/phase-1-record.md), [Phase 2 record](../rebuild-plan/phase-2-record.md), and [Phase 2 architecture](./phase-2-architecture-design.md).

## 1. Phase status and scope lock

Phase 1 and Phase 2 passed their local gates. Phase 3 is the current design task; coding starts after the user reviews the proposal and resolves the open product choices. Hosted CI, production database, and hosted storage remain separately unverified.

Phase 3 must complete source-backed ingestion and recovery while preserving the current Rembr foundation:

- Keep the independent Rembr repo and the IScraper reference read-only.
- Keep the modular monolith, SQLite adapter, and private local storage as the current execution baseline. No evidence currently requires Redis/BullMQ, microservices, or hosted object storage.
- Cover manual public-URL capture plus audited Instagram, Pinterest, and X/Twitter bookmark exports and their supported file/archive variants. Browser-extension capture remains Phase 5.
- Keep baseline extraction deterministic. Search, grounded chat, and optional AI enrichment remain Phase 4; do not make Phase 3 depend on a model/provider.
- Account export/deletion, billing, admin UI, production deployment, and final visual polish remain Phases 6, 9, and 7 respectively.

These boundaries follow the approved full-rebuild scope; an intentional capability change requires the user's explicit approval and an update to the feature matrix.

## 2. Source-backed ingestion inventory

The current source audit documents these paths in [stored upload import flow](../backend/storage-import-flow.md). In the source flow, recognized imports are parsed and new items/jobs are queued; an explicit preview-and-approval step would be a Rembr behavior change, not inherited source behavior:

| Input | Audited file forms | Parser behavior to preserve or deliberately improve |
|---|---|---|
| Manual link | HTTP(S) URL | Normalize and deduplicate; enqueue processing only after durable acceptance. Phase 1 already implements the narrow URL path. |
| Instagram saved export | HTML, HTM, JSON, ZIP | Recognize expected saved-post/collection names; extract post/reel URL, caption, owner/date, hashtags, and collections when present. |
| Pinterest export | Direct JSON, CSV, HTML, HTM; ZIP entries may also include TXT | Normalize pin URLs and collections; fix hostname-boundary errors and avoid attaching unrelated file-wide hashtags to each pin. Preserve the direct-file vs archive-member distinction unless the user approves expanding direct TXT support. |
| X/Twitter bookmarks | JS, JSON, CSV, TXT; direct or ZIP | Handle export JS assignment wrappers, supported bookmark paths, recognized CSV fields, URL/text fallback, author/date, and source metadata. Fix multiline quoted CSV handling; explicitly review the source parser's literal `pauch` bookmark-path token rather than silently inheriting it. |

Parser support is not the same as upload support: extension, MIME, size, archive entry names, and route behavior all constrain what the product accepts. The import screen must show which files were recognized and give a useful result for malformed, empty, mixed, or unsupported exports.

## 3. Proposed ingestion flow

1. Authenticate and derive the owner from the session. Persist an owner-scoped upload/import manifest in `uploading` state and create a request/import correlation ID **before accepting file bytes**.
2. Stream chunks to a temporary private path using server-generated keys; persist received-chunk metadata and byte counts. Enforce per-file, aggregate, count, chunk, and decompressed-archive bounds before parsing. Ignore client filenames for storage paths.
3. After the complete upload is verified, atomically promote its temporary path and transition the manifest to `staged`. On crash/restart, resume only complete verified uploads; expire and clean incomplete manifests/chunks after a defined grace period. Reconcile orphan files with missing DB manifests and stale DB manifests with missing files.
4. Validate actual bytes as well as extension and declared MIME. Reject unsupported, empty, malformed, oversized, path-traversal, or expansion-bomb inputs with safe, field-level errors.
5. Parse via format-specific adapters. Normalize canonical URLs and structured source metadata; preserve per-record provenance, source platform, collection membership, and parser diagnostics.
6. Produce an import preview with parsed, new, duplicate/skipped, rejected, and warning counts. Do not mutate existing saved-item metadata as an incidental effect of import.
7. After the approved acceptance point, atomically create import entries, new saved items, collection links, and their durable jobs. Repeated approval or request retries must be idempotent.
8. Remove temporary archive bytes after the agreed review/acceptance lifecycle. Failed cleanup remains a durable retryable cleanup record, not an untracked file.
9. The worker processes accepted jobs under bounded time/size/concurrency rules. Persist stage results and provenance before exposing a ready/partial state.

Two empty outcomes should be explicit: an unrecognized/empty export returns a validation failure; a valid import where every entry is already present completes successfully with zero new jobs and an explicit duplicate count. The source behavior queues new items after import; whether Rembr adds a human review step is Question 1.

## 4. Proposed data and job contracts

Use an additive migration `003`; preserve all Phase 1 and 2 users, sessions, profiles, items, jobs, artifacts, notes, assets, tags, and collections. Do not rewrite `001` or `002`.

The schema proposal is to add an owner-scoped import record and import-entry rows for preview, review, per-entry decisions, source provenance, and aggregate counts. Extend job persistence additively for correlation, explicit execution generation, lease heartbeat/renewal, bounded scheduling, pause/cancel/reprocess state, and sanitized failure classification. Keep every job/entry relation constrained to the same owner as its parent item. Record attempts or state transitions durably enough to explain retries and preserve a previous good artifact during a reprocess.

Candidate state machines (names are proposals, not approved API enums):

```text
Upload: initializing → uploading → staged → parsing → needs_review → approved
                    ↘ failed/expired        ↘ failed             ↘ cancelled
Import: approved → processing → completed | partial | failed | cancelled
Job:    queued → running → completed | partial | failed | paused
          ↘ cancelled   ↘ cancel_requested → cancelled
                        ↘ retry_wait → queued | cancelled
```

Keep import review state separate from processing-job state. A rejected or skipped import entry must not create a processing job. A cancelled/stale worker must not write after losing its fencing token. A reprocess should have a distinct generation/attempt identity; it must not destroy the last known-good artifact until replacement output is committed.

## 5. Worker reliability and recovery proposal

- Claim jobs transactionally with a unique lease/fencing token. Reclaim expired leases after restart, but prevent stale workers from committing.
- Replace fixed two-second retries with a bounded attempt policy, error classification, exponential backoff plus jitter, and a clear terminal state. Permanent validation/unsupported-input errors must not retry.
- Renew leases for long-running stages or set a lease from a validated stage deadline. Configure explicit network, parser, archive, and media timeouts; cancellation must stop or fence subsequent writes.
- Keep idempotency at both request/import acceptance and item-job generation. Duplicate upload/approval/worker delivery must not duplicate items or artifacts.
- Make cancellation, retry, restart, and reprocess owner-scoped. Retry resumes an eligible failed/paused job; reprocess creates a new generation and replaces artifacts only after a successful commit.
- Distinguish process health from worker health. Record heartbeat/last success/queue counts and sanitized error classes; correlate request → import → job → item without logging URLs with query data, uploaded bytes, extracted text, credentials, or private storage keys.
- Display only persisted server state. An API process being healthy must not imply that the worker is alive or that a user's item is processing.

## 6. Deterministic extraction and artifact proposal

Phase 1 currently extracts bounded title, metadata description, and text from supported HTML/XHTML/plain text. Phase 3 should add deterministic source metadata, final-source/provenance fields, parser stage outcomes, and an explicit partial result when useful text exists but an optional stage fails. Do not report a successful media/OCR/ASR result merely because a best-effort download failed.

The source matrix assigns media/OCR/ASR capabilities across Phases 3–4. Proposed boundary: Phase 3 stores safe deterministic metadata, source links, and supported artifacts with provenance; provider/model-backed OCR, ASR, visual interpretation, summaries, and embeddings stay Phase 4 unless the user explicitly moves specific deterministic capabilities into Phase 3. This is Question 2.

## 7. Security, privacy, and source defects to address

- Apply existing SSRF protections to every URL fetch, redirect, thumbnail/media URL, and imported link that Rembr actually fetches. Import parsing itself must not fetch arbitrary URLs.
- Keep all staging uploads and derived files private and owner-scoped. Enforce streaming resource caps and ZIP member/expanded-byte limits; never trust file extensions or MIME claims alone.
- Treat HTML, archive names, parser output, metadata, and source content as untrusted data. Escape or sanitize rendered output and never feed raw archive/parser content into logs.
- Correct the source Pinterest host suffix check (`notpinterest.com` must not match); avoid copying parser quirks that corrupt provenance or associate unrelated tags.
- Make partial parser and per-file failures explicit. Ensure temp-file cleanup is retryable after errors occurring before or during parse/import commit.
- Keep raw uploads only for the approved period. Imported item data and derived artifacts must later participate in Phase 6 export/deletion; document the data map now.

## 8. Screen and API surfaces

The primary UI surface is the existing Add content route (`/app?tab=upload`), extended for upload selection, progress, parsing, preview/review, duplicate/skipped counts, approval, and recovery. The library and item detail surfaces show queued/running/paused/partial/ready/failed/cancelled states with truthful timestamps and authorized actions. Add an import history/detail view only if the source inventory and user decision require it. Do not add a Phase 3 admin console; broader support/admin surfaces are Phase 6.

Proposed API families are owner-scoped `POST /api/imports`, `GET /api/imports/:id`, `POST /api/imports/:id/approve`, and import-entry decisions, plus job status, cancellation, retry, and reprocess routes. Exact endpoint names, response envelopes, status enums, and authorization are to be fixed after the UI/action policy is approved. Existing `/api/items` behavior stays backward-compatible.

## 9. Implementation slices after design approval

1. Freeze import/job state diagrams, limits, parser contracts, error taxonomy, retention, and authorization matrix.
2. Add migration `003`, repositories, private streaming staging storage, cleanup recovery, import/job idempotency, and ownership constraints.
3. Implement and fixture-test each source parser and normalization/dedup/provenance policy.
4. Build preview/review/approval and per-entry outcomes, with transactional item/collection/job acceptance.
5. Add job attempts/generations, lease renewal/fencing, retry/backoff, cancel/retry/reprocess, stale recovery, and deletion-race behavior.
6. Add deterministic extraction/artifact provenance and explicit partial/terminal outcomes.
7. Add worker heartbeat, health projections, safe diagnostics, and user-visible status/recovery controls.
8. Run adversarial/failure injection, concurrency and restart tests, browser flows, keyboard/narrow viewport checks, and Phase 1/2 regression gates; update the Phase 3 evidence record only after review.

## 10. Proposed Phase 3 acceptance gate

- All audited import forms parse or fail with a specific safe outcome; valid preview and acceptance are repeatable and idempotent.
- Limits cover multipart, total bytes/files, chunks, archive member count/expanded size, parser runtime, fetched bytes, redirects, and media resources.
- Cross-user access fails for imports, entries, jobs, temp assets, and artifacts. Storage keys and raw content never appear in client payloads or logs.
- Concurrent workers cannot commit the same generation; lease expiry/reclaim, renewals, cancellation, restart, and stale fencing are tested.
- Retry classification/backoff is bounded; permanent errors do not loop; partial output is distinct from terminal failure.
- Duplicate enqueue/import cannot overwrite user data or create duplicate active jobs. Reprocess preserves the prior good artifact until successful replacement.
- Worker health is distinct from API health; statuses recover from persisted state after process restart and refresh.
- Delete during import/processing prevents item, job, or artifact resurrection; cleanup failures remain retryable.
- `npm run check` and Phase 1/2 regression remain green, and browser walkthrough covers direct URL plus each supported archive format, review, progress, retry/cancel, reprocess, restart, failure, and cleanup.

## 11. Open questions for product approval

1. **Archive review:** the source queues new imported items after parsing. Do you approve changing that behavior so platform exports stop for preview and explicit approval while manually submitted public URLs continue directly to processing?
2. **Media/OCR/ASR boundary:** keep Phase 3 deterministic metadata/text/provenance and move model/local-runtime OCR/ASR/visual extraction to Phase 4, or name specific media capabilities that must be in Phase 3?
3. **Recovery controls:** should owners be able to cancel queued/running work, retry eligible failures, and reprocess completed items? Recommendation: yes, with append-only attempt history, server-side authorization, and last-good artifact preservation. Keep admin/operator actions out of Phase 3 UI.
4. **Upload limits and raw retention:** keep the source defaults (up to 20 files, 25 MiB per file, and at most 100 chunks), set a total per-import byte cap plus explicit archive expanded-size/member caps, and delete raw archives after review/acceptance? Recommendation: retain only in private staging until review completes, then delete with retryable cleanup; re-upload to import again.
5. **Worker health visibility:** expose owner-safe queue/worker availability and recovery state in their library, while keeping detailed sanitized diagnostics operator-only until Phase 6? Recommendation: yes; never disclose another user's queue data.

Record answers in the Obsidian Phase 3 design note and this document before implementing the dependent behavior.

## Related documents

- [Roadmap and current phase status](../rebuild-plan/phase-gated-roadmap.md)
- [Feature and acceptance matrix](../rebuild-plan/feature-and-acceptance-matrix.md)
- [Screen/workflow matrix](../rebuild-plan/screen-workflow-phase-matrix.md)
- [Source import parser and storage trace](../backend/storage-import-flow.md)
- [Worker state contract](../backend/indexing-worker-contract.md)
- [Backend routes and contracts](../backend/api-routes-and-contracts.md)
- [Phase 1 evidence](../rebuild-plan/phase-1-record.md)
- [Phase 2 evidence](../rebuild-plan/phase-2-record.md)
