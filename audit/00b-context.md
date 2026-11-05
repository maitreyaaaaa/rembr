# Context discovery

- Repository: `D:\meta hacks\Rembr` (verified from Obsidian project note and checked-out files).
- Product: Rembr, independent source-informed rebuild (notes only; verify implementation in repo).
- Git: clean checkout initially on `master`, HEAD `06f5482`; remote `origin` points to `maitreyaaaaa/rembr`; work branch created as `audit/fixes`.
- Deployment: `render.yaml`, `Dockerfile.worker`, `.vercel` present; hosting target and current live state require config inspection. No production service access or deployment occurred.
- Verified stack evidence: root npm workspaces `apps/api`, `apps/web`, Node engine `>=22.13`; package scripts include typecheck, lint, test, build, check.
- Notes warn that prior hosted DB/RLS, migrations, worker and UI states may be unverified; treat as historical context only.
- Relevant prior Rembr rollout: `C:\Users\Admin\.codex\memories_v2\rollout_summaries\2026-11-03T11-45-25-L3D2-rembr_smart_collections_and_interaction_ui_audit.md` records Smart Collections and interaction work and explicitly says deployment remained pending at that time. Current repo and live provider state must be independently checked.
- Obsidian project note consulted: `C:\Users\Admin\Documents\Obsidian Vault\Codex Memory\Projects\Rembr Hackathon.md`.
- Open-page context: no Codex Page was visible.
- Credential sources: `.env` and `.env.local*` exist locally; contents are not copied or logged. Tracked-file listing shows only `.env.example` among `.env*` files.
- Skill/tool routing details are in `00-skills.md`; full unrelated skill inventory omitted as non-actionable.
