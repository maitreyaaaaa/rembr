# Independent SEC-001 fix review

Verdict: PASS. The new default and reviewed processing guards block implicit signup consent across the inspected paths. Initial review identified outdated semantic-index and other AI-processing fixtures; these were corrected in `a2542cd` to use explicit, time-valid consent. The timestamp edge was fixed in `4bc2266`.

## Controls verified

- Registration creates all four preference rows disabled with no consent timestamp (`apps/api/src/app.ts:133-143`).
- AI media analysis worker claim and per-provider checks require enabled preference, current disclosure version, and `consented_at > users.created_at` (`apps/api/src/ai/worker.ts:108-116,244-247`; image/video/audio/text calls re-check immediately before provider operations at `:294-305,332-338,352-373`). Prequeued legacy jobs are not claimable without that condition.
- Legacy AI media-analysis preference reads detect the old signup-seeded same-or-earlier timestamp, disable the preference, and cancel queued/paused jobs (`apps/api/src/ai/preferences.ts:17-34`). Import parsing and explicit AI-job queueing require consent timestamp later than account creation (`apps/api/src/imports/repository.ts:44-47,344-352`).
- Grounded library answers use the same time-qualified AI-search preference check before provider calls (`apps/api/src/knowledge/ai-search-preferences.ts:8-15`; `apps/api/src/knowledge/routes.ts:188-209,266-280`).
- Visual search checks the time-qualified preference before provider work and rechecks before image analysis (`apps/api/src/ai/visual-search-routes.ts:42-56,102-129`).
- Semantic index/search use an effective preference requiring a later consent timestamp. The legacy seeded state is disabled and stored vectors are removed; disable also removes embeddings (`apps/api/src/library/semantic-routes.ts:52-68,128-148,151-183`). Its embedding callback rechecks enabled/current disclosure before provider work (`:85-102`).
- UI has explicit opt-in labels naming the external data flow, and separate disable controls for import analysis, grounded answers, visual search, and semantic indexing (`apps/web/src/features/imports/pages.tsx:248-254`; `apps/web/src/features/library/pages.tsx:150-175,217-254,359,402,408-419`).

## Initial focused test run (before fixture updates)

Command: `rtk node --import tsx --test --test-concurrency=1 apps/api/test/phase-three-ai-routes.test.ts apps/api/test/phase-three-imports.test.ts apps/api/test/semantic-search-routes.test.ts apps/api/test/visual-search.test.ts`

Result: 25 passed, 1 failed. `semantic-search-routes.test.ts:104-117` expected `POST /api/semantic/index` to return 200 for a newly registered user without first issuing `PUT /api/semantic/preferences` with the current disclosure version. It correctly returned 403. This was a test fixture gap, not a control bypass.

The following focused tests passed in that initial run: AI signup default/revocation and legacy equal-timestamp denial; import consent gating; semantic indexing denial until disclosure consent; visual search unauthenticated/consent/provider gates and successful explicit-consent flow. Subsequent full-gate runs surfaced and corrected five more AI fixtures that likewise needed explicit consent. Commit `a2542cd` updates these tests; the complete gate now passes 143/143 tests.

## Timestamp-edge correction review (`4bc2266`)

Verdict: PASS. The timestamp edge identified above is addressed by `consentedAtAfterAccountCreation` in `apps/api/src/auth/consent.ts:1-5`. When current time is equal to or earlier than `created_at`, the helper returns account creation plus one millisecond; when current time is later, it preserves current time. With the application's normalized ISO UTC timestamps, lexicographic comparison preserves ordering.

All four explicit-consent setters use the helper after loading the account creation timestamp:

- AI media analysis: `apps/api/src/ai/preferences.ts:41-44`
- Grounded answers: `apps/api/src/knowledge/ai-search-preferences.ts:18-21`
- Visual search: `apps/api/src/ai/visual-search-routes.ts:57-60`
- Semantic indexing/search: `apps/api/src/library/semantic-routes.ts:135-138`

If the account row is unexpectedly missing, these setters store a null consent timestamp when enabling; downstream timestamp checks therefore fail closed. The helper unit test covers exact equality and the next millisecond (`apps/api/test/consent.test.ts:4-8`). Focused command `rtk node --import tsx --test apps/api/test/consent.test.ts`: PASS, 1/1.

Conclusion: no remaining same-millisecond opt-in edge found in the four setters. No production credentials, external providers, or hosted services were used. No application files were changed by the verifier.

