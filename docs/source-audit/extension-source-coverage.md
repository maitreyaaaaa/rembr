# IScraper Extension Source Coverage for Rembr

## Audit scope and completeness

This ledger accounts for every tracked file returned by `git ls-files extensions/save-to-iscraper/*` in the read-only source checkout `D:\IScraper-main\IScraper-main` (25 files). All source, markup, styles, policy/submission documents, package metadata, and build/validation scripts were inspected. The five PNGs were inventoried as assets; their binary internals are not source logic. No file in the source checkout was changed. This coverage records static inspection only: it does not prove packaged behavior, browser compatibility, store acceptance, or production deployment.

Review depth: every one of the 25 tracked files has an individual ledger row and was inspected according to its role. Detailed function/handler block tracing applies to all five runtime JavaScript files (`background/service-worker.js`, `content/content.js`, `options/options.js`, `popup/popup.js`, and `sidepanel/sidepanel.js`), both `.mjs` scripts, and the server-side contract/auth/storage code; each is mapped in the architecture document. Markup and styles received UI/interface review, policy files received claim review, and the five binary assets were inventoried but not disassembled or pixel-audited. Thus, all 25 files were individually reviewed, but not all 25 received a code-block trace (non-code files and binary assets do not have executable blocks). API trace includes all eight extension-facing data routes, the three private token-management routes, extension-token parsing/expiry/projection, auth scope lookup, and Supabase/local store methods. The logic inventory is line-anchored; line anchors describe the current checkout and may shift in future revisions.

Detailed behavior and trust-boundary references are in [extension architecture and rebuild](../extension-security/extension-architecture-and-rebuild.md). Security and reliability findings are in [security review and findings](../extension-security/security-review-and-findings.md).

## Tracked-file ledger

| Tracked file | Kind | Reviewed / responsibility | Rembr rebuild note |
|---|---|---|---|
| `extensions/save-to-iscraper/PERMISSIONS.md` | Policy documentation | Reviewed. Explains the requested browser permissions and their intended use. | Derive permission rationale directly from the final manifest and behavior; keep explanations synchronized. |
| `extensions/save-to-iscraper/PRIVACY.md` | Privacy documentation | Reviewed. Describes page data, token handling, app communication, storage, and retention expectations. Source comparison identified a mismatch for status checks when the passive icon is disabled. | Re-author after data-flow decisions; map each claim to a tested behavior and disclose URL status checks accurately. |
| `extensions/save-to-iscraper/README.md` | Product/setup documentation | Reviewed. Describes extension purpose, installation/development, features, and “coming soon” release status. Availability was not externally checked. | Document supported browser/version, local setup, permissions, account connection, and verified distribution status. |
| `extensions/save-to-iscraper/STORE_SUBMISSION.md` | Release checklist | Reviewed. Contains store listing/submission material and a manual functional checklist. Checklist completion and store review are unverified. | Convert manual cases into release evidence and link test results; distinguish planned submission from approval. |
| `extensions/save-to-iscraper/background/service-worker.js` | Runtime JavaScript | Inspected end-to-end. Handles external connect validation, Chrome runtime message routing, scoped API requests, screenshot capture from active tab, badge state, and last-request diagnostics. See architecture and EXT-03. | Rebuild as narrow message/API boundary; validate sender, origin, URL, message schema, ownership context, and error states centrally. Never log secrets or captured content. |
| `extensions/save-to-iscraper/content/content.css` | Runtime stylesheet | Reviewed with injected UI. Styles capture crop, selection/media controls, persistent capture button, and toast/status surfaces in host-page DOM. | Isolate styles in Shadow DOM or equivalent; define responsive, high-contrast, reduced-motion, focus, and teardown behavior. |
| `extensions/save-to-iscraper/content/content.js` | Runtime JavaScript | Inspected end-to-end. Implements crop selection, screenshot handoff, text/media selection, passive capture affordance, saved-page status, toasts, and Undo. See EXT-01, EXT-04, EXT-05. | Rebuild state machine and message contracts explicitly; gate passive URL checks; handle messaging failures; add accessible, isolated overlays. |
| `extensions/save-to-iscraper/icons/icon128.png` | Binary asset | Inventoried as 128px extension icon; no executable logic. | Redesign for Rembr identity; verify generated sizes/contrast and package references. |
| `extensions/save-to-iscraper/icons/icon16.png` | Binary asset | Inventoried as 16px extension icon; no executable logic. | Redesign for Rembr identity; inspect at actual toolbar scale. |
| `extensions/save-to-iscraper/icons/icon32.png` | Binary asset | Inventoried as 32px extension icon; no executable logic. | Regenerate from the approved icon source and verify sharpness. |
| `extensions/save-to-iscraper/icons/icon48.png` | Binary asset | Inventoried as 48px extension icon; no executable logic. | Regenerate from the approved icon source and verify sharpness. |
| `extensions/save-to-iscraper/icons/logo.png` | Binary asset | Inventoried as page-visible branding asset and manifest web-accessible resource; no executable logic. | Decide whether page injection needs a public asset; minimize exposed resources and use Rembr branding. |
| `extensions/save-to-iscraper/manifest.json` | Browser manifest | Reviewed. MV3 version 0.4.0, declared Chrome minimum 116, permissions `activeTab`, `scripting`, `sidePanel`, `storage`; production host permission and external-connect allowlist; all-HTTP(S) content-script matches; popup, options, worker, side panel, icons, and web-accessible logo. | Treat as a threat-model artifact. Minimize permissions/matches, reconcile supported origins, and verify each browser-specific API requirement. |
| `extensions/save-to-iscraper/options/options.css` | Runtime stylesheet | Reviewed with options page; styles settings and connection/status states. | Rebuild from preference model and explicit connected/disconnected/error states; include keyboard and narrow-window behavior. |
| `extensions/save-to-iscraper/options/options.html` | Runtime markup | Reviewed. Settings UI includes app URL, default capture action, screenshot quality/analysis/source metadata, default collection, passive icon, connect/disconnect/reset, and privacy notice. | Keep labels and consent copy aligned with actual data behavior; validate semantics, labels, focus, and saved/error feedback. |
| `extensions/save-to-iscraper/options/options.js` | Runtime JavaScript | Inspected end-to-end. Reads/writes settings, connects via generated extension ID, displays request diagnostics, disconnects by clearing local state, and resets preferences. See EXT-02 and EXT-03. | Make origin validation authoritative; define unlink vs server revocation; validate each setting and surface persistence errors. |
| `extensions/save-to-iscraper/package.json` | Package metadata | Reviewed. Defines extension package identity/version and build/validation scripts. | Use reproducible commands and keep version/support metadata aligned with manifest and release docs. |
| `extensions/save-to-iscraper/popup/popup.css` | Runtime stylesheet | Reviewed with popup layout; styles actions, sign-in/connected panels, capture form, and feedback. | Redesign visual system for Rembr while preserving explicit action/result states and keyboard usability. |
| `extensions/save-to-iscraper/popup/popup.html` | Runtime markup | Reviewed. Declares toolbar popup surfaces and action controls for capture, screenshot, selection/media, dock, and connection. | Preserve semantic controls and make capture effects/permissions understandable before user action. |
| `extensions/save-to-iscraper/popup/popup.js` | Runtime JavaScript | Inspected end-to-end. Reads active-tab/session/settings/page metadata; handles URL capture, screenshot and selection delegation, dock launch, connect, duplicate response, and Undo. | Rebuild against typed worker messages; make tab/navigation failures and duplicate/undo outcomes deterministic. |
| `extensions/save-to-iscraper/scripts/build-extension.mjs` | Build script | Reviewed. Recreates the unpacked `dist` output and copies extension package files. The script was not run during this read-only audit. | Treat `dist` as generated output; define clean, deterministic packaging and ensure source maps/secrets are excluded. |
| `extensions/save-to-iscraper/scripts/validate-extension.mjs` | Validation script | Inspected. Static checks cover manifest shape/permissions, required files, dangerous code patterns, privacy/permission language, and store wording. It is not runtime security proof. | Keep static policy checks, add unit and browser integration coverage, and document the limits of each check. |
| `extensions/save-to-iscraper/sidepanel/sidepanel.css` | Runtime stylesheet | Reviewed with Research Dock layout. | Rebuild responsive search/results/empty/error states with accessible focus and status announcements. |
| `extensions/save-to-iscraper/sidepanel/sidepanel.html` | Runtime markup | Reviewed. Declares the dock search, recent items, save-link input, and result list. | Preserve semantic search/form behavior and explain what data is sent on submit. |
| `extensions/save-to-iscraper/sidepanel/sidepanel.js` | Runtime JavaScript | Inspected end-to-end. Loads recent items, searches, saves manually entered/dragged links, renders results with text-safe DOM APIs, and opens source/library items. | Rebuild with explicit loading/empty/error states, input validation, typed API contracts, and keyboard interaction tests. |

## Generated files and artifacts

- `scripts/build-extension.mjs` generates an unpacked `dist` directory; it is generated output, not a tracked source file in this ledger.
- Icon PNGs and `logo.png` are tracked binary assets, not generated runtime logic. Their design provenance and regeneration workflow were not established by this source audit.
- `package.json` metadata and the manifest version should be treated as distinct values to reconcile during Rembr packaging.
- `node_modules`, browser profile data, store-upload archives, and any local `dist` directory are outside the tracked-file inventory and were not audited as deliverables.

## External and runtime verification not performed

- No extension load/install, Chrome/Edge browser session, permission prompt, content-script runtime, or side-panel compatibility test was performed.
- No live account connection, API token issuance/revocation, upload, provider analysis, or production endpoint was exercised.
- No store listing, release artifact, privacy-policy URL, or reviewer outcome was checked.
- The static validation script and API tests were inspected but not executed as part of this read-only coverage pass.

## Evidence and issue cross-reference

- Manifest, UI, message routing, storage, and API contracts: [extension architecture and rebuild](../extension-security/extension-architecture-and-rebuild.md).
- Privacy, token lifecycle, origin validation, Undo, DOM isolation/accessibility, and testing gaps: [security review and findings](../extension-security/security-review-and-findings.md) (EXT-01 through EXT-06).


## Related documents

- [Backend source coverage](backend-source-coverage.md)
- [Support-code coverage](support-code-coverage.md)
- [UI source coverage](ui-source-coverage.md)
- [REA static-analysis record](rea-static-analysis.md)
