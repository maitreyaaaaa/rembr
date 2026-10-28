# Browser Extension: Security, Privacy, Reliability, and Open Findings

## Scope and evidence

This review covers the checked-in extension source and its server-side token/API boundaries. Findings are source-backed observations, not penetration-test results. No extension was installed, no real account token was used, and no hosted provider, store listing, or production endpoint was tested. The extension's policy and store documents are design evidence, not proof of publication or review approval.

## Trust boundaries and controls observed

| Boundary | Existing control | Evidence / limit |
|---|---|---|
| Web app → extension connection | Manifest restricts external messaging to `https://iscraper.vercel.app/*`; worker checks sender origin and checks the `isx_` prefix and matching app URL | `manifest.json:43-49`; `service-worker.js:29-54`. Server later verifies the full token cryptographically by hash. |
| Extension → backend | HTTPS URL parsing, scoped extension header, request ID and action label | `service-worker.js:126-230`, `241-249`, `314-334`; server `http/auth.js:22-35`. |
| Token creation and storage | 32 random bytes; SHA-256 digest stored server-side; one-year default expiry; public listing strips secret; DB RLS is enabled | `services/extensionTokens.js:3-25`; private routes `integrationPrivateRoutes.js:26-62`; migration `202605080006_lens_extension_tokens.sql:1-29`. |
| Per-request authorization | Token must exist, not be expired/revoked, and contain the required scope; extension routes check account deletion/profile state | `http/auth.js:22-35`; `integrationRoutes.js:63-80`; store lookup `supabaseStore.js:931-947`. |
| Item ownership and Undo | Routes load items under authenticated extension user's ID and check extension source marker/import source before deletion; screenshot assets are removed | `integrationRoutes.js:170-188`, `324-340`. |
| Page content and UI rendering | Content is only sent on capture click; dock results use `textContent`; no remote script/eval patterns allowed by validator | `content/content.js:230-318`; `sidepanel/sidepanel.js:85-134`; `scripts/validate-extension.mjs:15-26`, `110-137`. |
| Uploads and providers | Screenshot uses the shared note upload middleware and server-side optional analysis; analysis failure leaves capture saved and emits a warning | `server.js` note uploader construction; `integrationRoutes.js:191-266`. Exact deployed limits/provider state were not checked. |

Manifest requests `activeTab`, `scripting`, `sidePanel`, and `storage`; `host_permissions` names only the production IScraper domain, while content scripts match all HTTP(S) pages (`manifest.json:25-61`). The privacy/permissions copy accurately describes much of this boundary but conflicts with actual status-check behavior noted below. Content overlay DOM is attached directly to the host page rather than an isolated Shadow DOM (`content/content.js:113-127`, CSS `content/content.css:1-18`); this can make UI styling/interaction more vulnerable to hostile page CSS or DOM mutation. For Rembr, maintain a permission-by-feature matrix that records required manifest/runtime permission, user gesture or consent, data accessed, least-privilege alternative, and browser test; request optional permissions at point of use where the product supports that flow.

## Findings

### EXT-01 — Page URL status checks are not controlled by the stated preference

**Severity:** P1 privacy/consent mismatch (not an exploit claim).  
**Evidence:** `refreshPersistentCaptureState()` derives `passiveEnabled` from `alwaysShowCaptureIcon`, session, and URL. If passive mode is on it calls `checkSavedPageStatus()` (`content/content.js:87-93`). If off, a refresh while `quickMode === 'passive'` stops that mode and skips the status call; otherwise the `else` branch still calls it (`:94-98`). On initial page setup `quickMode` is empty, so a connected browser checks status even when the icon preference is off. `checkSavedPageStatus()` sends the current URL through the worker (`:491-498`), which performs the status API request with a valid stored session (`background/service-worker.js:210-231`). The options privacy note says pages can check saved state “when the save icon setting is on” (`options/options.html:69-70`), while `PRIVACY.md` says current URLs may be checked while browsing (`PRIVACY.md:46`).

**Impact:** With a valid extension session, page URLs can still reach IScraper on initial page setup and other non-passive refreshes after the visible passive capture control is disabled. The privacy note implies a narrower behavior than the source implements.  
**Rembr requirement:** Make background status checks an explicit, separately named opt-in preference or stop them when passive capture is off. Make copy, permission rationale, and behavior consistent. Test connected/disconnected states and toggling the preference.

### EXT-02 — Local disconnect does not revoke the server token

**Severity:** P1 credential lifecycle weakness.  
**Evidence:** Settings `disconnect()` removes `extensionToken`, ID, email, legacy token, and local request state, but performs no request to `DELETE /api/extension-tokens/:id` (`options/options.js:80-85`). The server token remains valid until server-side revocation or its one-year expiry (`integrationPrivateRoutes.js:51-62`; `extensionTokens.js:40-44`). Account-side token revocation is separate.

**Impact:** Disconnecting a browser only unlinks local state. A previously copied or compromised token remains usable until expiry/revocation. Users may reasonably interpret “Disconnect this browser” as invalidating the credential.  
**Rembr requirement:** Revoke server-side token from an authenticated app flow when possible, or present “remove locally” vs “revoke token” distinctly and make revocation easy. Test that a disconnected/revoked token receives 401 and cannot read or mutate library data.

### EXT-03 — User-configurable HTTPS origin conflicts with the manifest and connection allowlist

**Severity:** P2 origin-policy correctness; credential-destination boundary requires runtime verification.  
**Evidence:** Options accept any string matching `https://` (`options/options.js:56-78`); popup/content/side panel similarly accept any HTTPS base URL. The manifest grants network host permission only for `https://iscraper.vercel.app/*` and external messaging only to that origin (`manifest.json:26-49`). The worker external-connection handler rejects any app URL not exactly equal to the allowlisted origin (`service-worker.js:29-41`). Request helpers then use the provided URL as the API base (`service-worker.js:126-169`, `251-255`, `314-318`).

**Impact:** A custom HTTPS URL can be saved in preferences but cannot complete the documented connection flow under the manifest allowlist. Request construction uses the configured base URL and attaches the extension token (`service-worker.js:126-230`, `241-249`, `314-318`), but the manifest declares host permission only for the canonical origin. Whether the browser blocks requests to other origins was not exercised, so this audit does **not** claim a demonstrated token exfiltration path. This is a configuration inconsistency and a destination-validation boundary that needs an explicit policy and runtime test. There is no evidence that a remote party can silently change the stored preference.  
**Rembr requirement:** Either hard-code and validate the official origin everywhere or explicitly support custom instances with optional host permissions, origin confirmation, and matching external-connect allowlists. Reject unsupported origins before storing a token or issuing a request. Add browser verification proving that unsupported origins cannot receive the token.

### EXT-04 — Undo failure path is not handled consistently

**Severity:** P2 reliability.  
**Evidence:** Content toast Undo awaits `sendRuntimeMessage` without `try/catch` (`content/content.js:400-447`). A runtime messaging rejection can leave the click handler rejected without user-visible recovery. An API response with `{ok:false}` changes button text to “Failed” and returns without resetting it; the toast's dismissal timer is five seconds.

**Impact:** Temporary messaging/network failures produce an unclear or inaccessible Undo outcome.  
**Rembr requirement:** Handle both rejected messages and non-2xx responses; announce the failure, retain a retry path for the remaining undo window, and clear/restore state deterministically.

### EXT-05 — Injected controls share page DOM and CSS

**Severity:** P2 resilience/accessibility.  
**Evidence:** Overlay roots are regular `div` elements appended to `document.documentElement` (`content/content.js:113-127`), styled via ordinary page stylesheets (`content/content.css`). No Shadow DOM isolation or modal semantics/focus management is present in the capture overlay.

**Impact:** Complex host-page CSS can alter controls; host scripts can locate and remove/mutate the overlay; keyboard users do not get a clearly managed dialog focus/cancel model. This may be an accepted browser-extension tradeoff, but should be addressed for reliable capture.

**Rembr requirement:** Put controls in Shadow DOM or an equivalent isolated surface; define accessible dialog semantics, focus entry/return, Escape cancellation, status announcements, and robust teardown. Verify on pages with aggressive CSS and keyboard/screen-reader flows.

### EXT-06 — Automated extension coverage stops at static validation and API-level tests

**Severity:** P2 verification gap.  
**Evidence:** `validate-extension.mjs` checks manifest permissions, required files, risky-code patterns, privacy text, and submission wording; `build-extension.mjs` copies files into an unpacked `dist`. Its required-file array includes the side panel HTML path but not the referenced side panel JS/CSS (`scripts/validate-extension.mjs:94-117`), so it does not fully validate that UI's dependency closure. API tests cover Lens scope/revocation (`apps/orchestration/test/api.test.js:2320`), URL capture/Undo (`:2533`, `:2660`), screenshot save/Undo (`:2707`), selection save/Undo (`:2758`), and recent/search/status (`:2814`). No extension JavaScript unit or browser automation tests are present in the tracked extension package. Store notes supply a manual checklist (`STORE_SUBMISSION.md:54-72`).

**Impact:** Message boundaries, preference persistence, popup states, crop math, Undo error handling, and manifest runtime behavior are not proven by current automated tests.  
**Rembr requirement:** Add extension-context unit tests with Chrome API fakes plus a small unpacked-extension browser suite for connect/capture/undo/disconnect and privacy toggles. Make static validation check every packaged dependency (including sidepanel scripts/styles) and smoke-test the built output. Keep server contract tests for ownership, scope, expiry, and request limits.

## Documentation statements requiring external verification

- “Coming soon” and Chrome/Edge store submission status are repository documentation; no store listing was checked.
- HTTPS/TLS, production origin availability, hosted API configuration, deployed token schema/RLS, and provider analysis behavior were not verified against live infrastructure.
- Policy claims such as “data is sent only to the configured IScraper app URL” assume the configurable URL is trusted; source permits arbitrary HTTPS base URLs in settings/message payloads.
- The extension does not run remote JavaScript according to source/validator, but the manual store review and listing approval remain unverified.

## Risk-to-requirement traceability

## Reconciliation status for EXT-01–06

| Finding | Source status | Test status in current checkout | Audit conclusion |
|---|---|---|---|
| EXT-01 | Confirmed: initial content-script setup with icon disabled reaches the saved-status request branch; `:94-98` also shows the passive-mode transition exception. The request carries `window.location.href` at `:491-498`; worker sends it to status API with a valid stored session at `service-worker.js:217-230`. | API test `api.test.js:2814` exercises the endpoint, but no extension preference/browser test verifies this off-toggle path. | Confirmed privacy-copy/behavior mismatch; exact affected page transitions are stated above. Recommendation: opt-in status setting or suppress request when disabled, with browser test. |
| EXT-02 | Confirmed: local `disconnect()` removes local secret/session metadata only at `options.js:80-85`; server revoke exists separately at `integrationPrivateRoutes.js:51-62`, token expiry is one year at `extensionTokens.js:40-44`. | API test `api.test.js:2320` verifies token stops working after explicit server revocation. No test joins options Disconnect to revocation. | Confirmed unlink-versus-revoke behavior. Recommendation: revoke server-side or label/localize action semantics clearly and test old secret invalidation. |
| EXT-03 | Confirmed mismatch: settings accept HTTPS-only (`options.js:56-78`), connect worker accepts only canonical origin (`service-worker.js:29-41`), manifest host permission is canonical (`manifest.json:26-49`), request construction uses provided app base (`service-worker.js:126-230`, `314-318`). | No origin-policy browser test was found. Chrome runtime blocking of off-allowlist fetches was not tested. | Confirmed configuration inconsistency; credential exfiltration is not confirmed. Recommendation: one explicit origin policy and test that unsupported destinations cannot receive a token. |
| EXT-04 | Confirmed: content Undo awaits worker message without `try/catch`; a negative response sets “Failed” and leaves disabled (`content.js:417-437`); timer dismisses at `:415-416`. | Server API save/Undo tests exist, but no content-script runtime-rejection test exists in extension package. | Confirmed failure-path handling gap. Recommendation: catch runtime failure, retain/re-enable retry when possible, and announce final state. |
| EXT-05 | Confirmed: overlays are inserted into ordinary document roots (`content.js:119-133`, `:135-174`, `:365-398`, `:439-441`) and styled by page-injected CSS; no Shadow DOM or explicit focus/ARIA dialog workflow appears in the reviewed files. | No hostile-style, keyboard, screen-reader, or browser overlay test found in extension package. | Confirmed shared-DOM resilience/accessibility limitation; severity reflects reliability/accessibility rather than a claim that the page can execute extension-privileged code. Recommendation: isolated, accessible UI and adversarial page QA. |
| EXT-06 | Confirmed: extension package has no tracked JS/browser tests; static validator is not a runtime suite and required files omit sidepanel JS/CSS (`validate-extension.mjs:94-117`). | Server API coverage is confirmed at `api.test.js:2320`, `:2533`, `:2660`, `:2707`, `:2758`, `:2814`; store checklist is manual (`STORE_SUBMISSION.md:54-72`). | Confirmed verification gap. Recommendation: extension-context unit tests, dependency-closure validation, and clean-profile browser flow tests. |

The tests cited here were inspected, not executed during this read-only documentation pass. Their presence proves the test code exists, not that it passes in this checkout or that hosted/browser behavior is correct.

| Finding | Rebuild requirement | Acceptance evidence |
|---|---|---|
| EXT-01 | Status check is opt-in and matches UI privacy language | Test no request when disabled; test expected request when explicitly enabled |
| EXT-02 | Disconnect/revoke semantics revoke secret server-side or explain unlink | Verify old token fails after revoke; local disconnect UI state is explicit |
| EXT-03 | One supported origin policy for UI, worker, manifest, and server | Invalid-origin tests; valid custom-origin integration test only if custom mode is supported |
| EXT-04 | Undo has deterministic success/failure/retry UI | Simulate API failure and runtime disconnect; assert live retry affordance/status |
| EXT-05 | Isolated, accessible page controls | Hostile CSS test; keyboard-only and screen-reader review |
| EXT-06 | Browser-level extension regression coverage | Automated clean-profile connect, capture, search, undo, revoke, and privacy setting flows |



## Related documents

- [Extension architecture](extension-architecture-and-rebuild.md)
- [Screen/workflow phase matrix](../rebuild-plan/screen-workflow-phase-matrix.md)
- [Phase roadmap](../rebuild-plan/phase-gated-roadmap.md)
- [Final review checklist](../quality/final-review-checklist.md)
