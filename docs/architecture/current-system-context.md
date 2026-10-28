# IScraper Reference System Context for the Rembr Rebuild

This system-level view has been reconciled against current route, UI, extension, worker, store, and migration source maps. It describes logical source boundaries, not live deployment topology. For the detailed ownership and processing rules see [system design and boundaries](system-design-and-boundaries.md), [architecture decisions](architecture-decisions.md), [API routes](../backend/api-routes-and-contracts.md), [backend architecture](../backend/backend-architecture.md), [data and worker](../backend/backend-data-and-worker.md), and [extension architecture](../extension-security/extension-architecture-and-rebuild.md).

## System boundary

~~~mermaid
flowchart LR
  User[User] --> Web[React and Vite web UI]
  User --> Ext[Chromium MV3 extension]
  Web --> Auth[Supabase Auth]
  Web --> API[Express API]
  Ext --> API
  API --> App[Application workflows and services]
  App --> Store[Local or Supabase store]
  App --> Jobs[Processing jobs]
  Worker[Node worker runtime] --> Jobs
  Worker --> App
  Store --> DB[(Postgres, RLS, RPC, pgvector)]
  Store --> Blob[Private object storage]
  App -. configured .-> AI[AI providers]
  Worker -. configured .-> ML[Optional local extractor]
  App -. configured .-> Composio[External integrations]
  Web -. optional .-> Analytics[PostHog]
~~~

## Architectural areas

1. Client surfaces: landing/authenticated React app and Chromium extension.
2. API boundary: Express initialization, route registration, authentication, rate limits, upload validation, and error mapping.
3. Application workflows: imports, library operations, search, indexing, automation, billing/account requests, integrations.
4. Persistence: local and Supabase stores, migrations, RLS policies, storage ownership, RPC functions, embeddings.
5. Background processing: durable job state, worker leases, retries, provider handling, scheduled tasks, and observability.
6. External services: Supabase Auth/Postgres/Storage, model and embedding providers, Composio, and optional local ML commands.
7. Delivery: Vercel app/API and Render worker manifests; actual deployed revisions and settings require external verification.

## Evidence note

The diagram is source-confirmed at the logical component level. Hosted configuration, applied database migration/RLS/RPC ACL state, production credentials, provider activity, store submission/approval, and current deployment revisions remain unverified. The source contains functionality and docs that disagree on extension release status; see the history and extension review. The parent worktree had pre-existing edits and was left unchanged during this documentation pass.


## Related documents

- [Architecture decisions](architecture-decisions.md)
- [System boundaries](system-design-and-boundaries.md)
- [Phase roadmap](../rebuild-plan/phase-gated-roadmap.md)
- [Final review checklist](../quality/final-review-checklist.md)
