# Rembr

Rembr is a fresh, source-informed rebuild of IScraper. It has its own code and history; the reference repository remains read-only. This first implementation slice is focused on a secure, deterministic save-to-library journey. AI providers are not required for capture or processing.

## Current phase

Phase 1 is in progress. The authoritative phase definition is [the roadmap](docs/rebuild-plan/phase-gated-roadmap.md). This scaffold is not yet Phase 1 complete: the gate requires authenticated capture, durable processing, library retrieval, deletion safety, and recorded checks.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer

Phase 1 uses a local SQLite database for a repeatable offline development path. The database file is stored under `data/` and is ignored by Git. A hosted PostgreSQL/Supabase adapter is a pre-deployment requirement, not assumed to exist in this workspace.

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`. In a second terminal, run `npm run worker` to process queued captures. The web client proxies `/api` requests to the API server. The worker is a separate process and reads the same local database.

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
