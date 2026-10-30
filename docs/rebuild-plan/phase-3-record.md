# Phase 3 — Ingestion, durable jobs, and content processing

- Status: **In progress; exit gate not passed.**
- Scope: Recognized bookmark imports, safe ingestion, durable processing jobs, deterministic extraction, media artifacts, retries/cancellation/reprocessing, and recoverable cleanup. See [`phase-3-architecture-design.md`](../architecture/phase-3-architecture-design.md), [`feature-and-acceptance-matrix.md`](feature-and-acceptance-matrix.md), and [`screen-workflow-phase-matrix.md`](screen-workflow-phase-matrix.md).
- Current implementation branch: `feat/phase-6-account-privacy-admin-billing`. Phase 6 work adds account-freeze fences to Phase 3 writers; it does not pass or waive the Phase 3 gate.
- Source review: IScraper remains read-only. Its `apps/orchestration/src/services/downloader.js` uses `yt-dlp-exec` on Instagram page URLs. Rembr keeps fetches behind public-address validation, redirect checks, byte/type/time limits, and private temporary storage; source downloader code is not a safe drop-in.

## Acceptance evidence

| Requirement | Status | Evidence and remaining gap |
|---|---|---|
| Recognized import parsing and acceptance | **Implemented locally; hosted/browser evidence open** | `apps/api/test/phase-three-imports.test.ts` covers recognized Instagram, Pinterest, and X import shapes, bounded archive parsing, ordering/caps, duplicate handling, auto-queue, retryable cleanup, and owner isolation. Authenticated browser review and hosted storage/database behavior remain unverified. |
| Durable job processing and recovery | **Implemented locally; broader fault matrix and hosted worker evidence open** | API tests cover deterministic extraction, lease reclaim/fencing, retries, cancellation, reprocess generations, last-good artifact preservation, account freeze, and deletion races. Multi-process hosted worker/concurrency behavior and full restart/fault injection remain open. |
| Safe media discovery and artifacts | **Partial; source-parity gate open** | `safe-fetch.ts` enforces public-address checks, redirect revalidation, bounded response sizes, and supported media limits. Owner-work cancellation now propagates through page/media HTTP requests and FFmpeg; abort removes the private temp directory. `phase-three-imports.test.ts` covers private image/audio/video artifacts, owner reads, cleanup, and deletion races. Instagram temporary analysis discovers one HTML-exposed video and one HTML-exposed audio URL. MP4 is eligible for visual analysis; validated WebM/Ogg is only a bounded FFmpeg input for transcription and reports the skipped visual stage. Audio and extracted video audio produce bounded WAV chunks under a shared per-post duration cap. `phase-three-media-parity.test.ts` covers discovery, signatures, bounded output, cancellation, and partial status using an injected ffmpeg runner. A synthetic one-second WAV also converted through local FFmpeg 8.1. The source `yt-dlp` page-resolver behavior remains unsupported; the production container's pinned FFmpeg runtime is not verified. |
| Provider-backed Instagram enrichment | **Local/mock behavior present; live verification open** | Provider payload, consent, usage caps, failure states, and provider-off behavior have local tests. Live Meta key configuration and a synthetic authenticated provider request remain unverified in this checkout. |
| Browser and accessibility workflows | **Not run in this Phase 3 checkpoint** | Need an authenticated walkthrough for direct saves and supported imports, progress/partial/failure states, cancellation, retry, reprocess, refresh/restart recovery, keyboard navigation, and narrow viewports. |
| Earlier-phase regression | **Passed locally at the current Phase 6 checkpoint** | Latest `npm.cmd run check` passed API/web typecheck and lint, 170 API tests, and API/web production builds on 2026-10-30. Vite reports a 2.36 MB minified chunk warning. This local suite does not establish hosted or browser behavior. |

## Remaining exit-gate work

1. Close remaining source-backed video discovery/resolution gaps through a Rembr-safe adapter; retain SSRF protection, explicit size/time bounds, private temporary files, and cleanup on every failure.
2. Exercise the supported media and ffmpeg paths with deterministic fixtures; verify the installed runtime and provider-off behavior without sending real account content.
3. Complete the Phase 3 browser/accessibility walkthrough and worker restart/concurrency/failure-injection evidence.
4. Verify the hosted migration/storage/worker path and the authorized synthetic Meta check when the required configuration is available. Record unavailable external checks as `not run`.
5. Re-run the Phase 1/2 regressions and review all unresolved issues before deciding the Phase 3 gate.

Phase 5 browser extension and connected workflows remain deferred by user direction. The deferral does not remove those capabilities from the overall roadmap.
