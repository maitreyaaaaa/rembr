# Phase 3 Architecture Design — Ingestion, Durable Jobs, and Content Processing

**Status:** Design approved; Phase 3 implementation is in progress. Latest local check passed on 2026-10-28; the phase gate is not passed.

**Scope source:** [Phase-gated roadmap](../rebuild-plan/phase-gated-roadmap.md), [feature and acceptance matrix](../rebuild-plan/feature-and-acceptance-matrix.md), [screen/workflow matrix](../rebuild-plan/screen-workflow-phase-matrix.md), and [source import flow](../backend/storage-import-flow.md).
**Current product baseline:** [Phase 1 record](../rebuild-plan/phase-1-record.md), [Phase 2 record](../rebuild-plan/phase-2-record.md), and [Phase 2 architecture](./phase-2-architecture-design.md).

## 1. Phase status and scope lock

Phase 1 and Phase 2 passed their local gates. Phase 3 design choices below were explicitly approved by the user on 2026-10-28; implementation is now authorized. Hosted CI, production database, and hosted storage remain separately unverified.

## 1.1 User-approved design decisions

| Decision | Approved behavior |
|---|---|
| Platform export flow | Auto-queue new imported items after successful parsing; do not add a preview/approval gate. This preserves the audited source behavior. Manual URLs continue directly to processing. |
| Media scope | Phase 3 includes safe deterministic media metadata and downloads. OCR, ASR, and visual interpretation remain Phase 4. |
| User recovery | Owners can cancel queued/running jobs, retry eligible failures, and reprocess completed items. Keep attempt history and the last good artifact until replacement succeeds. |
| Upload limits | Keep source limits: up to 20 files, 25 MiB per file, and at most 100 chunks. Cap total import bytes at 100 MiB; cap each expanded ZIP at 100 MiB and 5,000 entries. |
| Raw archive retention | Delete raw upload files after successful parse and durable import/job acceptance; cleanup is retryable. Do not retain archives as a reprocessing source. |
| Worker health visibility | Do not expose global worker health to owners. Keep health/correlation diagnostics internal; defer detailed operator/admin UI to Phase 6. Per-item job state and owner recovery controls remain visible. |

### Implementation checkpoint (2026-10-28)

Implemented locally: additive import/job/media migrations; owner-scoped manifests and chunk upload; bounded Instagram/Pinterest/X parsers including source-supported X JS; ZIP safety checks; automatic item/job acceptance with deduplication; idempotent manifest retries; upload cancel and retryable raw-file cleanup; persisted job attempts/generations; owner cancel/retry/reprocess routes; library status projection and upload/import UI; safe private image downloads from page metadata and image elements, with persisted source URL, MIME, size, SHA-256, generation, and status. Image responses are revalidated after every public-URL redirect and capped at 5 MiB each and three images per page. Tests cover partial import outcomes, exhausted leases, interrupted cleanup, corrected chunk retry, item-count bounds, SSRF redirect checks, owner-scoped media reads/deletion, and last-good-media preservation. This is implementation progress, not Phase 3 completion evidence.

Still required before the Phase 3 gate: reconcile exact source-backed media coverage; broader injected storage/concurrency coverage; review of pause-state behavior; browser walkthrough and keyboard/narrow viewport checks for the completed import and recovery screens. Rembr does have a transient Instagram media path that fetches at most one HTML-exposed MP4 (25 MiB cap) and optionally extracts up to six bounded WAV chunks with ffmpeg. However, it ignores extracted standalone `audioUrls`, skips non-MP4 video URLs, and does not use IScraper's `yt-dlp-exec` post/reel downloader. The media-parity tests do not exercise video discovery or ffmpeg extraction. The intended Render worker image installs ffmpeg, but runtime proof is still absent. These are implementation/source-parity gaps separate from the user's deferred live Meta API-key checks. Hosted CI, production database, and hosted storage remain unverified.

No additional product approval is required for these choices. API names, internal table layout, parser library, and validated timeout/backoff constants remain engineering design details to document as implementation proceeds.

Phase 3 must complete source-backed ingestion and recovery while preserving the current Rembr foundation:

- Keep the independent Rembr repo and the IScraper reference read-only.
- Keep the modular monolith, SQLite adapter, and private local storage as the current execution baseline. No evidence currently requires Redis/BullMQ, microservices, or hosted object storage.
- Cover manual public-URL capture plus audited Instagram, Pinterest, and X/Twitter bookmark exports and their supported file/archive variants. Auto-queue imports after successful parsing. Browser-extension capture remains Phase 5.
- Keep baseline extraction deterministic, with safe media metadata/download paths. OCR, ASR, visual interpretation, search, grounded chat, and optional AI enrichment remain Phase 4; do not make Phase 3 depend on a model/provider.
- Account export/deletion, billing, admin UI, production deployment, and final visual polish remain Phases 6, 9, and 7 respectively.

These boundaries follow the approved full-rebuild scope; an intentional capability change requires the user's explicit approval and an update to the feature matrix.

## 2. Source-backed ingestion inventory

The current source audit documents these paths in [stored upload import flow](../backend/storage-import-flow.md). In the source flow, recognized imports are parsed and new items/jobs are queued; an explicit preview-and-approval step would be a Rembr behavior change, not inherited source behavior:

| Input | Audited file forms | Parser behavior to preserve or deliberately improve |
|---|---|---|
| Manual link | HTTP(S) URL | Normalize and deduplicate; enqueue processing only after durable acceptance. Phase 1 already implements the narrow URL path. |
| Instagram saved export | HTML, HTM, JSON, ZIP | Recognize expected saved-post/collection names; extract post/reel URL, caption, owner/date, hashtags, and collections when present. |
| Pinterest export | Direct JSON, CSV, HTML, HTM; ZIP entries may also include TXT | Normalize pin URLs and collections; fix hostname-boundary errors and avoid attaching unrelated file-wide hashtags to each pin. Preserve the direct-file vs archive-member distinction. |
| X/Twitter bookmarks | JS, JSON, CSV, TXT; direct or ZIP | Handle export JS assignment wrappers, supported bookmark paths, recognized CSV fields, URL/text fallback, author/date, and source metadata. Fix multiline quoted CSV handling. Preserve the source parser's literal `pauch` token for compatibility because it is explicitly recognized in the source code; a real export fixture remains unverified. |

Parser support is not the same as upload support: extension, MIME, size, archive entry names, and route behavior all constrain what the product accepts. The import screen must show parsed/new/duplicate/skipped/failed counts after enqueue and give a useful result for malformed, empty, mixed, or unsupported exports. Archives do not pause for human approval.

## 3. Proposed ingestion flow

1. Authenticate and derive the owner from the session. Persist an owner-scoped upload/import manifest in `uploading` state and create a request/import correlation ID **before accepting file bytes**.
2. Stream chunks to a temporary private path using server-generated keys; persist received-chunk metadata and byte counts. Enforce per-file, aggregate, count, chunk, and decompressed-archive bounds before parsing. Ignore client filenames for storage paths.
3. After the complete upload is verified, atomically promote its temporary path and transition the manifest to `staged`. On crash/restart, resume only complete verified uploads; expire and clean incomplete manifests/chunks after a defined grace period. Reconcile orphan files with missing DB manifests and stale DB manifests with missing files.
4. Validate actual bytes as well as extension and declared MIME. Reject unsupported, empty, malformed, oversized, path-traversal, or expansion-bomb inputs with safe, field-level errors.
5. Parse via format-specific adapters. Normalize canonical URLs and structured source metadata; preserve per-record provenance, source platform, collection membership, and parser diagnostics.
6. Atomically create import entries, new saved items, collection links, and their durable jobs after successful parsing. There is no review/approval pause. Repeated upload/acceptance retries must be idempotent; existing items are skipped rather than overwritten.
7. Return parsed/new/duplicate/skipped/failed/warning counts and persisted import status. A valid all-duplicate import completes successfully with zero new jobs; an empty/unrecognized export fails with a useful validation error.
8. Delete raw archive bytes after successful durable import/job acceptance. A cleanup error remains retryable and does not undo accepted items/jobs. Failed parsing/acceptance must not leave an untracked file.
9. The worker processes accepted jobs under bounded time/size/concurrency rules. Persist stage results and provenance before exposing a ready/partial state.

The user approved automatic queueing after parse, preserving the audited source behavior. No separate preview-approval flow is added.

## 4. Proposed data and job contracts

Migrations `003`–`006` are implemented additively; preserve all Phase 1 and 2 users, sessions, profiles, items, jobs, artifacts, notes, assets, tags, and collections. Do not rewrite `001` or `002`.

The schema proposal is to add an owner-scoped import record and import-entry rows for uploaded files, parse outcomes, source provenance, aggregate counts, and item/job links. There is no review/approval state. Extend job persistence additively for correlation, explicit execution generation, lease heartbeat/renewal, bounded scheduling, pause/cancel/reprocess state, and sanitized failure classification. Keep every job/entry relation constrained to the same owner as its parent item. Record attempts or state transitions durably enough to explain retries and preserve a previous good artifact during a reprocess.

Candidate state machines (names are proposals, not approved API enums):

```text
Upload: initializing → uploading → staged → parsing → accepted → completed | partial | failed
                    ↘ failed/expired        ↘ failed
Import: parsing → queued → processing → completed | partial | failed
Job:    queued → running → completed | partial | failed | paused
          ↘ cancelled   ↘ cancel_requested → cancelled
                        ↘ retry_wait → queued | cancelled
```

Keep import state separate from processing-job state. Unsupported entries receive explicit per-entry failures and do not create jobs. A cancelled/stale worker must not write after losing its fencing token. A reprocess should have a distinct generation/attempt identity; it must not destroy the last known-good artifact until replacement output is committed.

## 5. Worker reliability and recovery

- Claim jobs transactionally with a unique lease/fencing token. Reclaim expired leases after restart, but prevent stale workers from committing.
- Replace fixed two-second retries with a bounded attempt policy, error classification, exponential backoff plus jitter, and a clear terminal state. Permanent validation/unsupported-input errors must not retry.
- Renew leases for long-running stages or set a lease from a validated stage deadline. Configure explicit network, parser, archive, and media timeouts; cancellation must stop or fence subsequent writes.
- Keep idempotency at both request/import acceptance and item-job generation. Duplicate upload or worker delivery must not duplicate items or artifacts.
- Make cancellation, retry, restart, and reprocess owner-scoped. Owners can cancel queued/running jobs, retry eligible failures, and reprocess completed items. Retry creates durable attempt history; reprocess uses a new generation and replaces artifacts only after a successful commit.
- Distinguish process health from worker health internally. Record heartbeat/last success/queue counts and sanitized error classes; correlate request/import/job/item without logging URLs with query data, uploaded bytes, extracted text, credentials, or private storage keys. No global worker-health projection is exposed to owners; detailed operator/admin controls remain Phase 6.
- Display only persisted per-item server state. An API process being healthy must not imply that a user's item is processing.

## 6. Deterministic extraction and artifact proposal

Phase 1 currently extracts bounded title, metadata description, and text from supported HTML/XHTML/plain text. Phase 3 adds deterministic source metadata, final-source/provenance fields, parser stage outcomes, and an explicit partial result when useful text exists but an optional stage fails. Safe deterministic media metadata and bounded downloads are in scope; do not report a successful media result merely because a best-effort download failed.

Phase 3 stores safe deterministic metadata, source links, and supported media artifacts with provenance. OCR, ASR, visual interpretation, summaries, and embeddings stay in Phase 4. Media fetches must use the existing SSRF protections and enforce byte, content-type, redirect, and time limits.

## 7. Security, privacy, and source defects to address

- Apply existing SSRF protections to every URL fetch, redirect, thumbnail/media URL, and imported link that Rembr actually fetches. Import parsing itself must not fetch arbitrary URLs.
- Keep all staging uploads and derived files private and owner-scoped. Enforce streaming resource caps and ZIP member/expanded-byte limits; never trust file extensions or MIME claims alone.
- Treat HTML, archive names, parser output, metadata, and source content as untrusted data. Escape or sanitize rendered output and never feed raw archive/parser content into logs.
- Correct the source Pinterest host suffix check (`notpinterest.com` must not match); avoid copying parser quirks that corrupt provenance or associate unrelated tags.
- Make partial parser and per-file failures explicit. Ensure temp-file cleanup is retryable after errors occurring before or during parse/import commit.
- Keep raw uploads only for the approved period. Imported item data and derived artifacts must later participate in Phase 6 export/deletion; document the data map now.

## 8. Screen and API surfaces

The primary UI surface is the existing Add content route (`/app?tab=upload`), extended for upload selection, progress, parsing, result counts, and recovery. Parsing automatically queues accepted new items; show parsed/new/duplicate/skipped/failed counts without preview or approval. The library and item detail surfaces show queued/running/partial/ready/failed/cancelled states with truthful timestamps and authorized actions. Provide import history/detail for outcomes and retryable cleanup state; do not expose global worker health or add a Phase 3 admin console. Broader support/admin surfaces are Phase 6.

API families are owner-scoped import creation/status/history and job status/cancel/retry/reprocess routes. Do not add approve or per-entry decision routes. Exact endpoint names, response envelopes, status enums, and authorization are engineering decisions to record alongside implementation. Existing `/api/items` behavior stays backward-compatible.

## 9. Implementation slices

1. Freeze import/job state diagrams, limits, parser contracts, error taxonomy, retention, and authorization matrix. **Complete:** user approved the behavior and caps in §1.1.
2. Add migration `003`, repositories, private streaming staging storage, cleanup recovery, import/job idempotency, and ownership constraints.
3. Implement and fixture-test each source parser and normalization/dedup/provenance policy.
4. Auto-queue accepted parsed records with per-entry outcomes, transactional item/collection/job acceptance, and retryable raw-file cleanup.
5. Add job attempts/generations, lease renewal/fencing, retry/backoff, cancel/retry/reprocess, stale recovery, and deletion-race behavior.
6. Add deterministic extraction, safe bounded media downloads, artifact provenance, and explicit partial/terminal outcomes.
7. Add internal worker heartbeat and safe diagnostics plus owner-visible per-item status/recovery controls; do not expose global health.
8. Run adversarial/failure injection, concurrency and restart tests, browser flows, keyboard/narrow viewport checks, and Phase 1/2 regression gates; update the Phase 3 evidence record only after review.

## 10. Proposed Phase 3 acceptance gate

- All audited import forms parse or fail with a specific safe outcome; valid auto-queue acceptance is repeatable and idempotent.
- Limits cover multipart, total bytes/files, chunks, archive member count/expanded size, parser runtime, fetched bytes, redirects, and media resources.
- Cross-user access fails for imports, entries, jobs, temp assets, and artifacts. Storage keys and raw content never appear in client payloads or logs.
- Concurrent workers cannot commit the same generation; lease expiry/reclaim, renewals, cancellation, restart, and stale fencing are tested.
- Retry classification/backoff is bounded; permanent errors do not loop; partial output is distinct from terminal failure.
- Duplicate enqueue/import cannot overwrite user data or create duplicate active jobs. Reprocess preserves the prior good artifact until successful replacement.
- Internal worker health is distinct from API health; per-item statuses recover from persisted state after process restart and refresh. No owner-facing global health is required.
- Delete during import/processing prevents item, job, or artifact resurrection; cleanup failures remain retryable.
- `npm run check` and Phase 1/2 regression remain green, and browser walkthrough covers direct URL plus each supported archive format, auto-queue results, progress, retry/cancel, reprocess, restart, failure, and cleanup.

## 11. Decision closure

All five product questions are resolved by the user answers recorded in §1.1 and in the linked Obsidian decision note. No approval or preview gate is part of the Phase 3 design. Additional engineering choices must be documented with implementation evidence; they do not reopen the approved product boundaries.

## Related documents

- [Roadmap and current phase status](../rebuild-plan/phase-gated-roadmap.md)
- [Feature and acceptance matrix](../rebuild-plan/feature-and-acceptance-matrix.md)
- [Screen/workflow matrix](../rebuild-plan/screen-workflow-phase-matrix.md)
- [Source import parser and storage trace](../backend/storage-import-flow.md)
- [Worker state contract](../backend/indexing-worker-contract.md)
- [Backend routes and contracts](../backend/api-routes-and-contracts.md)
- [Phase 1 evidence](../rebuild-plan/phase-1-record.md)
- [Phase 2 evidence](../rebuild-plan/phase-2-record.md)
