# Remaining verification

No user input is required to complete the authorized release. These checks remain beyond the local audit evidence and should be completed during normal hosted operations:

1. Confirm Supabase RLS/grants and object-storage policies under hosted roles.
2. Complete authenticated WorkOS OAuth/MCP roundtrip with a non-production client.
3. Verify Meta/OpenRouter provider behavior and worker processing using non-sensitive test data.
4. Exercise two-user owner isolation, import flows, consent settings/revocation, and account deletion in a staged browser session.
5. Run keyboard and screen-reader checks on onboarding, settings, dialogs, tour, library and mobile layouts. WEB-001 needs keyboard focus regression coverage.
6. Monitor Render errors, queues, storage and spend after deployment; confirm rollback procedure in staging.

The production deployment check for this release is tracked in `30-progress.md` and the session handoff. No production customer records or credentials were read for the audit.

The bounded local Git-history marker scan found no key requiring rotation. This is not comprehensive secret-scanner evidence.
