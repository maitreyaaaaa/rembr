# Rembr

Rembr is a fresh, source-informed rebuild of IScraper. It has its own code and history; the reference repository remains read-only. This first implementation slice is focused on a secure, deterministic save-to-library journey. AI providers are not required for capture or processing.

## Current phase

Phase 1's local gate passed on October 28, 2026. The evidence and residual hosted-environment limits are recorded in [the Phase 1 record](docs/rebuild-plan/phase-1-record.md). The authoritative phase definition remains [the roadmap](docs/rebuild-plan/phase-gated-roadmap.md).

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer

Phase 1 uses a local SQLite database for a repeatable offline development path. The database file is stored under `data/` and is ignored by Git. A hosted PostgreSQL/Supabase adapter is a pre-deployment requirement, not assumed to exist in this workspace.

## Setup

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Open `http://127.0.0.1:5173` for the public marketing site. Choose **Make your library** to open the product at `/app`. In a second terminal, run `npm run worker` to process queued captures. The web client proxies `/api` requests to the API server. The worker is a separate process and reads the same local database.

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
