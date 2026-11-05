# Feature inventory and parity matrix

Baseline and final local state are the same for all features except COR-001, which now settles import status before the worker resolves. Automated evidence is the passing 141-test baseline and final gate unless noted. This matrix groups source-backed features by user flow; hosted behavior needs the manual checks in `NEEDS_USER.md`.

| Feature group | Before | After | Evidence / status |
|---|---|---|---|
| Registration, login/logout, sessions, profiles, onboarding | PASS | PASS | API tests and typecheck/lint/build; hosted cookies/OAuth still manual |
| Workspace demo mode | PASS | PASS | Existing test `demo entry creates a normal session...`; production demo config unverified |
| Capture URL, extraction, retries, item status | PASS | PASS | API/worker suite; COR-001 adds failed-import regression |
| Library list, search, filters, sorting, pagination, item detail | PASS | PASS | API suite; browser UX coverage absent |
| Notes, tags, collections, saved-item organization | PASS | PASS | API suite; manual UI flows remain |
| Instagram imports, staging, parsing, deduplication, progress, cancellation, cleanup | PASS | PASS | API import tests; COR-001 focused test verifies final failed job settles import |
| Media fetch/storage and cleanup | PASS | PASS | API tests; production storage credentials/state unverified |
| AI analysis, preferences, provider budgets/limits | PASS | PASS | API tests with simulated providers; live Meta provider untested |
| Semantic search and consent | PASS | PASS | API tests; live embedding provider and hosted pgvector unverified |
| Visual similarity search and consent | PASS | PASS | API tests with controlled provider behavior; real model runtime untested |
| Knowledge graph and Obsidian export | PASS | PASS | API suite and build; browser interaction manual |
| Intent memory/recall prompts | PASS | PASS | API tests assert owner scoping, reveal, interval, weekly cap and skip behavior |
| Smart Collections | PASS | PASS | API tests/build; hosted persistence/background worker state unverified |
| Personal API keys and REST v1 | PASS | PASS | API tests and source security pass; real external client roundtrip manual |
| MCP endpoint and WorkOS metadata | PASS | PASS | Test confirms metadata and unauthenticated challenge; authenticated OAuth roundtrip manual |
| Account export/deletion/privacy settings | PASS | PASS | API tests/build; browser and hosted storage cleanup manual |
| Marketing pages, public pages, tour, responsive UI | PASS | PASS | Build and source review; no web tests or current browser walkthrough in this audit |
| CI, Render web/worker deployment config | PASS | PASS | Workflow/config inspection; hosted deploy/rollback not verified |

## Manual verification status

No feature is labeled hosted PASS. Follow the exact staged checks in `NEEDS_USER.md` for real browser/device, provider, OAuth, RLS, storage and production operations. “PASS” above means local source/tests/build only.
