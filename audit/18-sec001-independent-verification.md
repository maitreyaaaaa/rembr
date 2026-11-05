# Independent verification: SEC-001

Verdict: CONFIRMED. Account registration grants AI-processing preferences without separate AI consent.

Evidence:

- `apps/api/src/app.ts:137-148` inserts the user after checking only `registerSchema`/`acceptedTerms`, then inserts all four AI-related preference records with `enabled=TRUE` and the current disclosure version/timestamp.
- `apps/web/src/App.tsx:109-114` submits `acceptedTerms` on registration; there is no AI-specific consent field in the registration request.
- `apps/web/src/components/SupportPages.tsx:103-109` says the legal page is not a published policy.
- `apps/api/test/phase-three-ai-routes.test.ts:9-25` explicitly asserts that accepting Terms enables AI media analysis by default.
- `apps/api/src/imports/repository.ts:39-47,61-68` queues AI jobs for imported Instagram items if that preference is enabled and has the disclosure version.
- `apps/api/src/ai/worker.ts:108-116` claims jobs only when that enabled/versioned preference exists; the worker then uses saved-item/extracted data, and the API's AI provider path can send it to the configured provider.

Impact: A newly registered user can have imported media queued for AI analysis under a consent timestamp they did not explicitly provide. The product treats a Terms acceptance as AI-analysis consent despite the displayed legal page being unpublished. This is a privacy/security issue, not merely a copy mismatch.

Confidence/severity: CONFIRMED, High. The behavior is directly asserted by an existing test and implemented in the account-creation transaction. No production account or provider was accessed.

Independent reviewer did not edit application files. Recommended minimal direction for the integrator: new registrations must start with AI-related preferences disabled and null consent fields; external processing must require the existing explicit opt-in flow. Update characterization tests to assert opt-in is off until the user explicitly enables it.
