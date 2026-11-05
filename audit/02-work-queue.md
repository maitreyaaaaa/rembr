# Work queue

- [x] Confirm repo, Git state, stack entrypoints and project memory.
- [x] Create isolated `audit/fixes` branch.
- [x] Map modules, architecture, entrypoints, database, routes, deployment config, and feature groups.
- [x] Capture baseline: check, dependency audit, tests/build, history marker scan, available scanner gaps.
- [x] Review architecture, correctness, performance, security, tests/config; record evidence and limits.
- [x] Independently reproduce COR-001 before acting; regression fails on baseline and passes after fix.
- [x] Triage permitted fixes and document deferred items.
- [x] Fix one finding per commit; run full gate after source commit.
- [x] Final security review on changed code, final gate, parity matrix, report, README_FIRST.
- [x] Save concise Obsidian session note.
- [x] Preserve branch-only/no-deploy rule from attached audit procedure; see `DECISIONS.md`.

## Repository map

Verified root workspaces: `apps/api`, `apps/web`. Source/test/migration entrypoints are in `01-architecture.md`. Inventory: 69 API source files, 67 web source files, 25 API test files, 72 route declarations. No web test files were identified. The 30 largest tracked TypeScript/TSX/SQL/CSS files were measured; largest are `apps/web/src/styles.css` (2063 lines), `apps/api/test/phase-two.test.ts` (811), and `apps/api/test/phase-three-imports.test.ts` (564). No monolith refactor was justified.
