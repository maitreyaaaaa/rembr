# Agent ledger

| Role | Scope | Status | Output | Verified by |
|---|---|---|---|---|
| Orchestrator | Branch, baseline, triage, fix, integration | Active | audit/* | Self + gate |
| Security reviewer | API route/auth/input/secrets code review | Complete | `audit/13-security.md` | Orchestrator evidence spot-check |
| Architecture/correctness reviewer | API/worker flow | Complete | `audit/10-architecture.md`, `audit/11-correctness.md` | Orchestrator reproduced COR-001 |
| Performance/test reviewer | Manifests, CI, bundles, tests | Complete | `audit/12-performance.md`, `audit/14-tests-and-quality.md` | Orchestrator baseline |

All reviewer work was read-only; no reviewer edited application source.
