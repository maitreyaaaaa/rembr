# IScraper Source and Decision Context for Rembr

## Purpose

This file reconciles current repository evidence with product and architecture material in Notion, Obsidian, and relevant Codex threads. It preserves intent and history without treating old plans, mock behavior, or deployment claims as current proof.

## Inspected reference snapshot

- Repository: `D:\IScraper-main\IScraper-main`
- Branch: `codex/icebreaker-automation-preview`, one commit ahead of its origin at audit time.
- HEAD: `7f25fb598bf7c8aaa56d40852fc10425f2531cc5`.
- The inspected working tree also included pre-existing dirty changes: `docs/architecture/adr-010-ml-first-indexing-and-enrichment.md`, `package-lock.json`, and untracked `docs/architecture/iscraper-low-level-architecture.md` plus its PDF. These were not created or modified by the Rembr audit. Treat observations from these dirty files as working-tree evidence rather than committed HEAD evidence.
- The working-tree inventory contained 370 Git-tracked files. The REA evidence separately records its artifact digest and selected JS/TS scope.

## Source-of-truth order

1. Current IScraper working tree and tests establish behavior in the checked-out snapshot.
2. Committed Git history explains when behavior entered the repo. The current checkout is on codex/icebreaker-automation-preview, ahead by one commit, with pre-existing edits to package-lock.json and architecture documents. Those parent-repo changes are reference-only.
3. Current-looking Notion pages provide product and architecture intent, but several were last verified against earlier repo snapshots.
4. Obsidian decisions and session notes help reconstruct why code exists and what was already tried.
5. Prior Codex conversations provide additional implementation and validation evidence; their summaries do not replace the source.
6. Vercel, Render, Supabase, browser-store, and provider claims require live evidence. Historical notes are not proof of current deployment state.

## Product direction found across sources

The product brief and current app README describe a private library for saving internet references, reviewing them before indexing, searching across their text and media context, and reusing the resulting knowledge. The codebase also contains a specialized creator/marketing workflow: selected saved references ground content plans, captions, media prompts, scheduling, and approval-gated actions.

These narratives are related but not identical. Rembr documentation must distinguish the general saved-content memory product from its marketing-workflow use case, and then map both to features actually present in source. Do not infer that a planned product surface is implemented merely because a Notion page describes it.

## Decisions and historical constraints

- **Indexing direction:** Obsidian’s ML-first decision and Notion ADR 010 describe a deterministic baseline for approved saves, optional local OCR/ASR/visual extraction, and provider-backed enrichment or synthesis where configured. Notion’s low-level architecture explicitly says local OCR/ASR/visual binaries are optional and not packaged in the repo snapshot it reviewed. Confirm current code and label deployed availability separately.
- **Durable jobs:** Notion ADR 001 records the choice to keep processing_jobs, use leases and bounded retries/backoff, and avoid introducing a new queue without evidence. Local JSON storage is not safe for multiple independent workers.
- **Worker boundary:** ADR 002 and Worker Operations keep one application workflow contract across the API and CLI worker. A separate worker runtime is planned/manifested, while splitting the API deployment is a separate decision that needs operational evidence.
- **Scale and migration:** ADR 007, Scalability Readiness, and Migration-Ready Cutover favor collecting authenticated workload evidence before moving hosting or changing regions. Historical measurements must be checked against current source and deployment.
- **Privacy and permissions:** Current Extension Privacy and Current Extension Permissions describe user-triggered capture, scoped extension credentials, and purpose-limited data use. The code-level extension audit is authoritative for present behavior; store review and deployed policy claims remain external.
- **UI/flow plans:** Notion contains screen and flow designs for landing interactions, imports/indexing, search preferences, library chat, privacy export, indexing issues, account requests, and enrichment controls. Each must be matched to current routes/components before being included as parity.
- **Historical branches:** Notion’s Product Experiments and Historical Branches explicitly labels older extension, Android, visual-search, and UI documents as historical or superseded. They are useful for context, not automatic Rembr requirements.

## Reconciliation findings

| Topic | Evidence | Rembr documentation treatment |
| --- | --- | --- |
| General library vs marketing workspace | Product Brief, Current App README, source UI and workflow code | Document the broad library and specialized workflow separately; trace both to implemented screens and routes. |
| ML-first vs hosted model capability | ML-first decision, ADR 010, low-level architecture, current extractor/provider source | Describe implemented contracts and optional integrations separately. Do not claim packaged local models or live provider execution without proof. |
| Queue and deployment | ADR 001/002/007, worker manifest, worker source, runtime notes | Explain current worker behavior from source; mark hosted worker health and migration status unverified unless queried. |
| Extension distribution | Current Extension README and permissions/privacy notes plus manifest/source | Document source behavior and store-submission history independently. Current store listing state is not inferred from older “coming soon” copy. |
| UI designs and implementation | Notion UX pages, current UI source, recent tour/mobile sessions | Treat design pages as intent. Source and current rendering establish implementation; prior visual QA is time-bounded evidence. |
| Security audit status | Prior Codex security-audit and scan threads, current security source | Some prior safe fixes were reported; several Codex Security scans ended in spawn EPERM. Do not claim a successful automated deep scan from those failed sessions. Recheck source and report current evidence. |

## Relevant Notion source library

The root library reports that product documentation was collected from seven IScraper worktrees and consolidated into text pages, with duplicate copies deduplicated and generated/dependency/private backup paths excluded. The library itself warns that operational, benchmark, and roadmap claims require validation.

### Primary product and architecture pages

- [IScraper source library](https://app.notion.com/p/39ad75324407811aa315d78363cc8c4e)
- [Product Brief](https://app.notion.com/p/39ad7532440781a08f93eef70e4d3f74)
- [Current App README](https://app.notion.com/p/39ad75324407814d8311c48d155b8b2b)
- [Low-Level System Architecture](https://app.notion.com/p/3edd753244078171bc82dd25b96b2f34)
- [ML-First Product Pivot](https://app.notion.com/p/3d1d7532440781748760ea40ac001729)
- [ADR 010: ML-First Indexing and Enrichment](https://app.notion.com/p/3d1d7532440781d28f95e2793c3a1302)
- [ADR 001: Indexing Reliability](https://app.notion.com/p/39ad753244078116bb61e2f9b566baee)
- [ADR 002: Worker Runtime Boundary](https://app.notion.com/p/39ad7532440781beb955fb460c3ec783)
- [Worker Operations](https://app.notion.com/p/39ad7532440781b0ba83db8f87f4cea4)
- [Route Inventory](https://app.notion.com/p/39ad7532440781ed87bced7a9f82de54)
- [Scalability Readiness](https://app.notion.com/p/39ad75324407818fae8fd598f7753eca)
- [Migration-Ready Cutover](https://app.notion.com/p/39ad75324407812b8ac5f40c87fa1cd2)

### Product and surface design references

- [Landing Interaction Design](https://app.notion.com/p/39ad75324407813b86b2cc95ebf10c53)
- [Current Landing Interaction System Plan](https://app.notion.com/p/39ad7532440781388ceddd19109a69e2)
- [Upload and Indexing Redesign](https://app.notion.com/p/39ad7532440781c791f1dda176c2429e)
- [Library Chat Panel Plan](https://app.notion.com/p/39ad75324407814abad3f75a2fa62e01)
- [Search Preferences Design](https://app.notion.com/p/39ad75324407819c9d2af887fcb5e563)
- [Indexing Issues Design](https://app.notion.com/p/39ad7532440781fe8c7fddf70b59bac2)
- [Privacy Export Design](https://app.notion.com/p/39ad7532440781bd94b5c259597f4545)
- [Import Summary](https://app.notion.com/p/39ad75324407819682d6c233597219aa)

### Extension and historical references

- [Current Extension README](https://app.notion.com/p/39ad7532440781aa9639c6fe4a7f566a)
- [Current Extension Permissions](https://app.notion.com/p/39ad75324407810290e3e579dfc8914c)
- [Current Extension Privacy](https://app.notion.com/p/39ad7532440781fba117d27448248c24)
- [Product Experiments and Historical Branches](https://app.notion.com/p/39ad7532440781a58931ef70b890b7ba)
- [Visual Similar Search and Agent/MCP Snapshot](https://app.notion.com/p/39ad753244078132960cc888306b829b)

Other investor, market, and brand pages were found in the same library. Their private commercial claims, contact data, and fundraising information are not copied into Rembr’s technical documentation.

## Relevant Obsidian and Codex history

Read-only context reviewed includes:

- Obsidian project notes: IScraper Main and IScraper Mobile.
- Obsidian decisions: ML-first indexing pivot and Icebreaker Automation Runtime V1.
- Obsidian sessions: repo structure map, architecture audit, guided-tour release, mobile/motion release, and workflow/automation history.
- Codex threads: UI/mobile implementation and QA, product-positioning question, prior security audit, and failed deep-scan continuations.

Historical mobile-width QA covered selected browser widths and flows, but it does not prove current authenticated/provider-backed behavior. Historical Vercel and Supabase checks similarly need revalidation. The reviewed source checkout contains no separate Expo/mobile application. The Android-only build brief is historical intent documentation, not implementation evidence or an in-scope Rembr app requirement; preserve its context without treating it as current source behavior.

## Reconciliation and remaining external verification

- Current UI and extension behavior is reconciled against the screen specifications and per-file coverage ledgers.
- Routes, worker/job states, all 38 migration bodies, and provider paths are mapped in backend documentation. Test behavior is source-mapped, but no test suite was executed.
- Current source is distinguished from the historical Notion/Obsidian product and architecture decisions; design docs that do not match source are recorded as intent or discrepancy.
- The parent repo’s pre-existing dirty changes were preserved and treated as working-tree evidence separate from committed HEAD.
- Live deployment revisions, Supabase migration/RLS/RPC ACL state, external provider authorization and retention, browser store listing, and production performance remain unverified.
- Asset pixel/licensing review and dependency-by-dependency package-lock review remain outside this source logic audit.


## Related documents

- [Reference documentation inventory](reference-documentation-inventory.md)
- [Research method](research-method-and-tooling.md)
- [Support-code coverage](../source-audit/support-code-coverage.md)
- [Phase roadmap](../rebuild-plan/phase-gated-roadmap.md)
