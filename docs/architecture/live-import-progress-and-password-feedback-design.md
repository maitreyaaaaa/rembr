# Live Import Progress and Password Feedback

**Status:** Approved for implementation
**Date:** 2026-10-29  
**Scope:** Import detail progress display and account-creation password guidance/policy

## Goals

- Replace the static parsed/queued/duplicate/failed summary with a determinate progress component and live, accurate import state.
- Show saved, paused, queued/active, and failed counts without exposing other users' jobs or polling Render's management API.
- Make password feedback change on every edit and align new account creation with the selected 15-character, no-composition policy.
- Keep password strength estimation local to the browser and enforce registration rules in the API.

## Current behavior and constraints

- The import detail page initially calls `GET /api/imports/:id`, which returns the import and all entries. While active, it repeats that full response every two seconds.
- The results panel reports parsing/enqueue totals, not the processing jobs' current states. Durable job rows and `job_pause_states` contain the live work state.
- Render's worker service/deploy status is operational health data; it does not provide per-import business counts. The app database is the source of truth for those counts.
- Registration currently requires 12 characters in both `PasswordStrengthField` and the API, and the UI's four composition checks also drive the strength label. The API currently hashes with `bcryptjs`; bcrypt accepts at most 72 input bytes, while the public form accepts up to 128 characters.

## Import progress design

### Contract and source of truth

Add an authenticated, profile-gated `GET /api/imports/:id/progress` route. Resolve the import by both its ID and the signed-in owner. Return only a compact aggregate, for example:

```json
{
  "importId": "…",
  "status": "processing",
  "total": 2969,
  "settled": 489,
  "saved": 489,
  "paused": 0,
  "queued": 2474,
  "processing": 1,
  "retryWaiting": 2,
  "failed": 3,
  "cancelled": 0
}
```

The API implementation will use a bounded SQL aggregate over jobs for that owner/import and the pause-state relation. `total` is the number of durable processing jobs for the import. `settled` is the number in terminal job states (`completed`, `partial`, `failed`, or `cancelled`); the visible bar is `settled / total`, so terminal failures do not leave a finished import appearing perpetually incomplete. `saved` is `completed + partial`; `paused` counts rows with a persisted pause state, even when the underlying job status remains queued or processing. The UI will also show failures and the remaining active/waiting/paused counts as text, so a completed bar does not imply every save succeeded.

Parsing failures with no processing job remain represented by the import summary's existing `failed_count`; include these in the compact response and distinguish them from job failures. For imports with zero jobs, return a terminal state with zero progress values and the existing parse/duplicate summary—never divide by zero or display a fabricated percentage.

### Refresh behavior

- Load the full detail payload once; then poll only the compact progress route every 1 second while the import is nonterminal and the page is visible.
- Pause polling while `document.visibilityState` is hidden. Resume with one immediate refresh when visible again.
- Prevent overlapping requests, stop at terminal import status, and back off briefly after transient request failures.
- Do not contact Render from the browser or expose Render credentials. Do not use 500 ms polling: the worker writes durable state on multi-second job boundaries, so half-second requests mostly repeat the same data and increase database load.
- Adapt UIArc's determinate `Progress` component to Rembr's existing component/CSS conventions. Keep its accessible progressbar values, responsive width, reduced-motion behavior, and visible value. Avoid adding shadcn/Tailwind solely for this component. Add only dependencies required by the adopted source (the supplied registry lists `motion` and `lucide-react`); verify existing installed packages before adding them.
- The progress bar is not a live region. Announce concise meaningful state changes (such as completion or failure) through a separate polite status message, not every one-second count update.

## Password design

### User-facing behavior and policy

- On each input change, run the local zxcvbn-ts guessability estimator and update the meter, label, and accessible value. Use the estimator's score as guidance (for example, very weak through strong), not as a security guarantee or a substitute for server rules.
- Show the selected account policy separately: minimum 15 Unicode code points. Remove the uppercase/lowercase/number/symbol requirements. Preserve show/hide, paste, password manager autofill, and a generous maximum of at least 64 characters; retain the existing 128-character UI/API cap unless implementation finds an encoding or hashing constraint that warrants a separate decision.
- Do not send the password to an estimator service, Render API, analytics, telemetry, or logs. The password is sent only through the existing authenticated HTTPS registration request to the Rembr API, where registration validation, blocklist checks, and hashing occur.
- The API requires at least 15 Unicode code points and compares the full, untruncated secret against a versioned bundled common-password dictionary plus predictable derivatives of Rembr and the email local part. Rejection returns a safe actionable validation message; do not return the matched blocklist entry. Rate limiting remains in force. This local blocklist does not claim complete coverage of every password in every breach corpus.
- The local estimator must not silently impose an additional score threshold that contradicts the published 15-character rule. It provides guidance; server policy and blocklist decide acceptance.

### Hashing and compatibility

Use Argon2id for new registrations so accepted passwords are not truncated at bcrypt's 72-byte boundary. Keep bcrypt verification for existing accounts during rollout. New-password validation must count Unicode code points and hashing/verification must operate on the full normalized secret, using one consistently documented Unicode normalization policy. Do not force a bulk reset or rewrite stored hashes in a database migration. Any later rehash of legacy bcrypt accounts must preserve login compatibility and be designed separately, especially for legacy inputs longer than 72 UTF-8 bytes.

This requires confirming the chosen Argon2id Node package and deployment build compatibility on Render before merging. Keep algorithm parameters configurable through the implementation's supported API (not user-facing configuration), benchmark against service latency, and store self-describing encoded hashes so future cost changes can be handled safely.

## Security, privacy, and failure behavior

- Import counts are owner-scoped in the route and aggregate query. Return not-found for foreign IDs, matching the existing import detail route.
- Progress payloads contain counts and state only, never imported URLs, item text, or account identifiers.
- Passwords remain out of logs and telemetry; test registration validation and estimator behavior with synthetic fixtures only.
- If the progress endpoint is temporarily unavailable, keep the last known counts visible, show a non-blocking stale indicator, and retry with backoff. Do not replace known state with zero.
- If the password estimator fails to load, keep the policy requirement visible and allow server validation to remain authoritative; do not silently accept a password that violates the API policy.

## Rollout and verification plan

1. Add the owner-scoped aggregate service/route and contract checks; verify terminal, empty, paused, retry-wait, mixed-success/failure, and foreign-owner cases.
2. Replace the detail page's repeated full-entry request with the compact one-second visibility-aware poll. Integrate the UIArc progress component and check responsive layout, reduced motion, keyboard/screen-reader values, and terminal states.
3. Add the local estimator and separate policy hint; update client/server signup minimum and remove composition checks. Add API blocklist validation and Argon2id for new registrations while preserving legacy bcrypt login.
4. Run API/web lint, typecheck, tests, and build. Verify UI against small and large viewports; exercise progress with a live import and confirm paused/resumed/failure behavior against persisted rows. Confirm Render worker deploy compatibility and never infer job progress from Render health.

## Acceptance criteria

- The progress bar and its percentage correspond to the same `settled / total` aggregate; saved, paused, active/waiting, and failed counts remain visible and consistent.
- The import page does not refetch all entry rows during polling, pauses polling in a hidden tab, resumes promptly, and stops after completion.
- Password feedback updates on each keystroke without waiting for individual rule checks; the minimum-length guidance is independent of the guessability score.
- Registration accepts a 15+ character passphrase without character-class composition, rejects shorter or blocklisted inputs server-side, and hashes the entire accepted input without bcrypt truncation for new accounts.
- Existing bcrypt accounts can still sign in during rollout; no bulk password reset is introduced.

## References

- [NIST SP 800-63B-4: Passwords](https://pages.nist.gov/800-63-4/sp800-63b.html) — 15-character single-factor minimum, no composition rules, Unicode code-point counting, full-password verification, blocklists, and password storage requirements.
- [USENIX: zxcvbn password strength estimation](https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/wheeler) — research basis for guessability feedback over character-class counting.
- [UIArc Progress](https://uiarc.dev/components/progress) — supplied determinate progress component guidance.
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — Argon2id recommendation and bcrypt's 72-byte limit.
- [Render health checks](https://render.com/docs/health-checks) — service readiness is distinct from per-import job progress.
