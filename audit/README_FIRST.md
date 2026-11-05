# README_FIRST

1. Branch: `audit/fixes`, based on `master` at `06f5482`.
2. Fixes: COR-001 (`d57f6ef`), CFG-001 (`6568c27`), SEC-001 (`4bc2266`), test follow-up (`a2542cd`).
3. SEC-001: AI processing is disclosed in Terms and covered by accepting them; existing users must accept the updated Terms once. Per-feature controls can disable AI functions.
4. COR-001 regression reproduced `PGlite is closing` before the fix and passed after.
5. Final gate after the Terms-flow correction: typecheck/lint passed, 144/144 API tests passed, API/web production builds passed; Vite reports the existing large-chunk advisory.
6. `npm audit --omit=dev`: 0 vulnerabilities; Vite large-chunk advisory remains.
7. WEB-001 focus handling is deferred for keyboard-test coverage; hosted RLS/OAuth/provider/browser checks remain open.
8. No keys were identified by the bounded history scan; no full secret-scanner result is available.
9. Direct user instruction authorizes production push and overrides the attached audit prompt's no-push constraint; Render auto-deploys `master`.
10. Final release outcome will be verified from fast-forward push, both Render services, and `/api/health`.
