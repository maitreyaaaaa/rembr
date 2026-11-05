# Feature inventory and parity matrix

The source-backed product surfaces remain present. The audit changed failed-import finalization, CI permissions, and AI-consent defaults/gates. “PASS” means local source/tests/build only; it does not establish hosted operation.

| Feature group | Before | After | Evidence / status |
|---|---|---|---|
| Registration, login/logout, sessions, profiles, onboarding | PASS | PASS | AI features now start disabled; API tests assert explicit opt-in |
| Workspace demo mode | PASS | PASS | Existing test; production demo configuration unverified |
| Capture URL, extraction, retries, item status | PASS | PASS | API/worker suite |
| Library list, search, filters, sorting, pagination, item detail | PASS | PASS | API suite; browser UX coverage absent |
| Notes, tags, collections, saved-item organization | PASS | PASS | API suite; manual UI flows remain |
| Instagram imports, staging, parsing, deduplication, progress, cancellation, cleanup | PASS | PASS | API suite; COR-001 regression verifies final failed job settles import |
| Media fetch/storage and cleanup | PASS | PASS | API tests; hosted storage credentials/state unverified |
| AI analysis, preferences, provider budgets/limits | Implicit signup consent | Explicit opt-in required | API tests with simulated providers; live Meta provider untested |
| Semantic search and consent | Implicit signup consent | Explicit opt-in required | API tests; live embeddings and hosted pgvector unverified |
| Visual similarity search and consent | Implicit signup consent | Explicit opt-in required | API tests with controlled provider behavior; real model runtime untested |
| Knowledge graph and Obsidian export | PASS | PASS | API suite/build; browser interaction manual |
| Intent memory/recall prompts | PASS | PASS | API tests assert owner scoping and disclosure behavior |
| Smart Collections | PASS | PASS | API tests/build; hosted persistence/background worker state unverified |
| Personal API keys and REST v1 | PASS | PASS | API tests and source review; external client roundtrip manual |
| MCP endpoint and WorkOS metadata | PASS | PASS | Metadata/unauthenticated challenge test; authenticated OAuth roundtrip manual |
| Account export/deletion/privacy settings | PASS | PASS | API tests/build; hosted storage cleanup manual |
| Marketing pages, public pages, tour, responsive UI | PASS | PASS | Build/source review; WEB-001 modal focus issue deferred |
| CI, Render web/worker deployment config | CI credential scope open | CI least privilege | CFG-001 fixed; deployment/rollback needs hosted verification |

## Hosted verification

No feature is labeled hosted PASS based only on local tests. Production release status and `/api/health` are recorded after the authorized push. Follow `NEEDS_USER.md` for remaining OAuth, provider, database, browser/device and operational checks.
