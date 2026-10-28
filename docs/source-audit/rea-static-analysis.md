# REA static analysis record

## Execution

- Tool: Reverse Engineering Agent (REA), npm package `rea-agents@6.8.0`.
- Command: `npx.cmd --yes rea-agents@6.8.0 analyze-javascript-application D:/IScraper-main/IScraper-main --source-paths-json 'D:/meta hacks/Rembr/docs/source-audit/rea-source-selection.json' --detail summary --evidence_output 'D:/meta hacks/Rembr/docs/source-audit/rea-evidence' --format json`.
- Selection: 181 tracked JavaScript/TypeScript files, captured in `rea-source-selection.json`. This deliberately excludes untracked browser profiles/logs, local dependencies, build output, and non-JavaScript sources.
- Result: command exited successfully. REA reported the application graph and Electron boundaries reconstructed. Summary evidence ID: `ev_4c34c54283dab6c1f45a00982ca4757f699e328876fcc723790f467e9c92f619`; parent evidence ID: `ev_ad3b891204ffa2928fb28e22ab8c67838ff6486535c1cb7c9ee9cab9b9cf90ce`. The summary reported 3,452/3,452 facts examined within its selected view and an artifact SHA-256 of `54d4173dbe267080eb34b58f33c58e145a87b61a16d2919b3b86f22b781ecd1a` at execution time.
- Environment warning: local Node was `v24.13.1`; package engine declaration is `^22.23.4 || ^24.22.1 || >=26.12.1`, so the installed runtime is below the supported 24.x version. The command nevertheless exited successfully. Re-run with a supported Node version before relying on it for a release audit.
- REA emitted a 186,948,179-byte bundle at `docs/source-audit/rea-evidence`. This is generated tool evidence rather than human-authored documentation and is excluded by the project `.gitignore` rule; keep it out of any commit unless a separate evidence-archive decision is made.

## What the result means

REA is a static structural cross-check for source relationships, routes, bindings, requests, events, and selected data-flow patterns. It does not replace direct source reading, tests, threat modeling, browser execution, live provider checks, or code review. It analyzes source as inert text and does not execute application code.

The tool itself reported important limits:

- The caller-selected analysis left 5,683 inventoried files outside the selected view. This number includes the broader local artifact inventory and is not a count of tracked repo source files.
- Graph coverage is incomplete; unavailable facts remain unknown, not absent.
- It does not provide full control-flow-sensitive reaching definitions or arbitrary dynamic-property resolution.
- Certain large store and test files exceeded the parent's expanded relationship budget. Their complete static facts were retained at file nodes, but their relationships should be checked directly in source.
- 187 additional limitations were omitted from the bounded summary; the source remains the authoritative evidence.

REA was therefore used to help validate the source map, not as a claim that all 370 tracked files were semantically analyzed or that all defects were found. Human source traces remain in the UI, backend, and extension coverage documents.


## Related documents

- [Backend source coverage](backend-source-coverage.md)
- [Extension source coverage](extension-source-coverage.md)
- [Support-code coverage](support-code-coverage.md)
- [UI source coverage](ui-source-coverage.md)
