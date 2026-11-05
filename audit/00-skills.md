# Audit skill routing

| Skill / tool | Why relevant | Phase |
|---|---|---|
| `audit-context-building` | Repository/module and trust-boundary mapping before findings | Recon, architecture, security |
| `cc-skill-security-review` | Authentication, authorization, validation, secrets, storage, deployment review | Security |
| `code-reviewer` | Evidence-based correctness and maintainability review | All audit chunks |
| `application-performance-performance-optimization` | Establish performance baseline and avoid speculative optimization | Baseline, performance |
| `accessibility-compliance-accessibility-audit` | Existing web UI accessibility coverage and manual-check gaps | UI / feature parity |
| `awt-e2e-testing` | Available browser verification approach; use only if configured locally | Baseline / final |
| Node/npm workspaces | Native typecheck, lint, tests, builds, dependency audit | Baseline / gate |
| Git CLI via `rtk` | Branch, history, diff and commit verification | All phases |
| Render/Supabase/GitHub connectors | Present in tool catalog; no live production access is authorized by the audit prompt | Context only |

The installed tool catalog contains many unrelated skills and connectors; the above are the task-relevant subset. Tools available include filesystem/shell, Git, web, browser UI automation, image generation, MCP resources, and connected app tools. No specialized static-analysis or secret-scanning executable has been confirmed yet. Shell commands are prefixed with `rtk` where supported, per RTK.md.

## Subagent plan

The audit prompt requests parallel review. Use read-only independent workers for bounded architecture/correctness, performance/quality, and security areas; integrate only evidenced findings. No agent may edit source files.
