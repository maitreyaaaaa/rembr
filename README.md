# Rembr

Rembr is a fresh, source-informed rebuild of IScraper. It has its own code and history; the reference repository remains read-only. Capture, import, processing, and library behavior are deterministic and do not require an AI provider.

## Current phase

Phases 1 and 2 passed their local gates on October 28, 2026. Phase 3 is in progress: platform imports, durable jobs, recovery, and bounded private image downloads are implemented, but media parity and resilience/browser gates remain open. See the [Phase 1 record](docs/rebuild-plan/phase-1-record.md), [Phase 2 record](docs/rebuild-plan/phase-2-record.md), [Phase 3 design/checkpoint](docs/architecture/phase-3-architecture-design.md), and [roadmap](docs/rebuild-plan/phase-gated-roadmap.md). Hosted CI, database, and storage behavior remain unverified.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer

The API and worker use the connected Supabase Postgres database. Set `DATABASE_URL` in the project-root `.env` to the Supabase Postgres connection string before starting either process. The browser app uses only the Rembr API and never receives database credentials. Schema changes live in `supabase/migrations/` and are applied to the connected project.

## Render deployment

`render.yaml` defines a Singapore web service and a separate background worker. Both use the `master` branch and deploy automatically for each commit. The API serves the built web app from the same origin, while queued imports and capture jobs run continuously in the worker. This repository currently has no independent scheduled task, so it does not define a Render cron job; the queue consumer is a background worker rather than a cron process.

The Blueprint asks for `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as protected Render secrets for both services. Enter the Supabase connection string and service-role key in Render's secure environment form; never commit them. `SUPABASE_URL` is the project URL. The server creates private Storage buckets named `rembr-assets`, `rembr-imports`, and `rembr-media` when each service starts. Keep Vercel serving traffic until the Render deployment passes its health check and the app is reviewed.

## Setup

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Open `http://127.0.0.1:5173` for the public marketing site. Choose **Make your library** to open the product at `/app`. In a second terminal, run `npm run worker` to advance imports, captures, and media processing. The web client proxies `/api` requests to the API server. The worker is a separate process and reads the same local database.

The marketing pages and their product-claim boundaries are documented in [the marketing identity](docs/marketing/positioning-and-identity.md) and [page map](docs/marketing/page-map-and-content.md). Optionally configure `VITE_CONTACT_EMAIL` in `apps/web/.env` to enable the contact page's email-draft action. It opens an email draft in the visitor's mail app; it does not send or store the message.

## Available commands

```powershell
npm run dev          # API and web UI
npm run worker       # durable capture worker
npm run typecheck
npm run lint
npm test
npm run build
```

No real IScraper user data, credentials, provider keys, or repository history are used. Use synthetic accounts and test pages only.

## Documentation

- [Documentation index](docs/INDEX.md)
- [Phase roadmap](docs/rebuild-plan/phase-gated-roadmap.md)
- [Screen/workflow phase matrix](docs/rebuild-plan/screen-workflow-phase-matrix.md)
- [API and data architecture](docs/architecture/system-design-and-boundaries.md)
- [Rembr design-system plan](docs/screens/rembr-design-system-brief.md)
