# Local extractor service deep trace

**Source:** `apps/orchestration/src/ml/localExtractorService.js` fully read (290 lines); `local-extractor-server.js` entrypoint remains pending. Tests: all 8 `localExtractorService.test.js` cases read; see assertion supplement. No code edits/tests executed.

## HTTP app boundary

- `createLocalExtractorApp` (13–75) configures Express JSON body parser, hides `x-powered-by`, and checks `x-local-ml-api-key` using constant-time comparison only when configured key is nonempty. Thus empty key disables auth. `/health` returns engine-presence booleans; `/v1/image/analyze` and `/v1/media/analyze` invoke analysis and pass errors onward. Final middleware returns `statusCode || 500` and generic/public message. It has no per-request rate limit, request audit, or explicit per-route body schema.
- `timingSafeEqual` (245–249) compares byte lengths and uses crypto timing-safe equality.

## Payload/engine flow

- `analyzeImagePayload` (77–93) base64-decodes `payload.image`, returns empty analysis for zero bytes, applies configured image byte limit, writes to generated temp directory and MIME-derived extension, runs OCR and visual embedding sequentially, assembles analysis, then recursively removes temp directory in `finally`. MIME defaults to PNG; unsupported MIME types also resolve to `.png`. Buffer's permissive base64 decoding is not strict format validation.
- `analyzeMediaPayload` (95–124) takes up to `maxMediaFiles` entries, reads each caller-supplied `entry.path` via `fs.stat`, skips missing/non-file paths, infers video from extension or trusts `entry.kind`, checks configured size by type, runs Whisper or OCR+embedding, and combines outputs; visual vectors are averaged if dimensions match. **The API accepts arbitrary local filesystem paths without a user-owned temp-root check.** If reachable to an untrusted caller (especially with no API key or external bind), this creates a local file read/processing surface.
- `extractImageText` (126–131) runs configured Tesseract with `[imagePath,'stdout']`, OCR timeout/default 60s, normalizes stdout.
- `extractVideoTranscript` (133–155) creates temp dir, invokes configured Whisper command with media path/model/txt output/fp16 false and 5x default timeout, reads generated `<basename>.txt`, normalizes and always removes dir.
- `extractImageEmbedding` (157–162) invokes configured embedding command and timeout; `parseVisualEmbeddingOutput` (164–169) JSON-parses stdout and passes recognized vector property/whole object through numeric vector normalizer. Invalid JSON throws and becomes generic HTTP 500.
- `averageEmbeddings` (171–180) filters nonempty arrays, chooses first vector dimension and averages only vectors with that size; model identifiers are not considered.
- `buildAnalysis` (182–198) calls deterministic analyzer over caption/OCR/transcript, includes normalized OCR/transcript, and attaches vector/model only when vector is truthy; `emptyAnalysis` (200–202) uses same path with empty extraction.

## Configuration and subprocess

- `localExtractorConfigFromEnv` (204–222) binds default host `127.0.0.1`, port 3037, optional API key, JSON limit 8mb, Tesseract default command, Whisper/embedding optional commands, model IDs, media-count/byte caps and command timeouts. Numeric env parsing uses Number without validation; negative, NaN, or extreme values can produce surprising limits/timeouts.
- `execFileCommand` (224–239) uses Node `execFile` (no shell), Windows hidden process, 10 MiB output buffer and timeout. It preserves stderr on error; no command allowlist is applied to runtime config.
- `defaultCreateTempDir` (241–243) creates temp under OS temp dir.
- `assertPayloadSize` (251–259) only rejects when parsed cap >0 and size exceeds it; zero/NaN disables cap.
- `extensionForMime` (261–266) maps WebP/JPEG else PNG. `mediaKind` (268–270) maps known video suffix else image. `cleanText` (272–274) collapses whitespace. `rmSafe` (276–279) silently ignores recursive cleanup errors.
- Module export list (281–290) exposes testable parsers/analyzers/app/config, not `execFileCommand` or private validation helpers.

## Security and behavior gaps

1. Enforce strict path containment under a dedicated handoff directory, use opaque server-issued media references rather than arbitrary `path`, and reject symlinks/TOCTOU escapes before subprocess invocation.
2. Require a non-empty service key in non-development, and ensure server binds only to intended interface. This module's factory does not enforce environment-specific fail-closed config.
3. Validate MIME, kind, file extension, regular file ownership and count/size/timeout config as a startup schema; do not trust caller `kind`.
4. Validate base64 strictly and reject unsupported image MIME instead of silently labeling as PNG.
5. Average vectors only if model id matches; otherwise never combine model spaces.
6. Ensure subprocess errors/timeouts are logged safely without leaking filesystem paths or command output to public response; current API maps errors to generic text unless `publicMessage` set.

## Test boundary

The eight tests verify config parsing, OCR/ASR/embedding command arguments, basic output normalization and auth on `/health` when key exists. They do not test path traversal/arbitrary file access, no-key mode, size/count caps, command timeout/nonzero output, invalid JSON vectors, malformed base64, wrong media kind, symlinks or cleanup failure.


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
