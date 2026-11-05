# Needs user

## Hosted configuration / production evidence

The local audit cannot establish production Render deployment state, Supabase RLS/grants, demo-account exposure, WorkOS OAuth roundtrip, or provider configuration. Please review those in the provider consoles and run authenticated production smoke checks before a release. No production credentials or services were accessed, and no migration or deployment is proposed.

## Manual checklist

1. In a staging environment, sign up/sign in, save a URL, and confirm worker success and visible failure/retry behavior.
2. Import a valid and partially invalid export; verify partial status, per-entry outcomes, cancellation, and final completion after a failed last job.
3. Exercise library search, filters, pagination, tags, collections, notes, exports, and account deletion with two distinct users; confirm cross-owner requests return no data.
4. Verify Smart Collections refresh/persistence, graph, semantic/visual search consent and fallback, and API-key/MCP integrations with configured non-production accounts.
5. Use keyboard and screen reader on onboarding, library, settings, dialogs, tour, and mobile layouts. Run on target devices and browsers.
6. Validate hosted RLS/grants, object-storage policies, rate limits, OAuth registration/token roundtrip, Render health, worker processing and rollback in staging.
7. If production release is later authorized through the normal release branch, execute smoke checks and monitor errors, queues, storage, and spend.

No keys are identified for rotation by the bounded local scan; this is not a comprehensive secret-scanner result.
