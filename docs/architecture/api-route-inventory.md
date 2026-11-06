# API route inventory

> Generated from Express route declarations under `apps/api/src`. Middleware markers are source-level signals for review; they do not prove runtime authorization or policy correctness.

| Method | Path | Middleware markers | Source |
| --- | --- | --- | --- |
| GET | /api/ai/items/:id | signed-in | [apps/api/src/ai/routes.ts:38](../../apps/api/src/ai/routes.ts#L38) |
| GET | /api/ai/preferences | signed-in | [apps/api/src/ai/routes.ts:24](../../apps/api/src/ai/routes.ts#L24) |
| PUT | /api/ai/preferences | signed-in, terms-current | [apps/api/src/ai/routes.ts:28](../../apps/api/src/ai/routes.ts#L28) |
| GET | /api/ai/visual-search-preferences | signed-in | [apps/api/src/ai/visual-search-routes.ts:91](../../apps/api/src/ai/visual-search-routes.ts#L91) |
| PUT | /api/ai/visual-search-preferences | signed-in, terms-current | [apps/api/src/ai/visual-search-routes.ts:95](../../apps/api/src/ai/visual-search-routes.ts#L95) |
| GET | /api/assets/:id | profile-complete, signed-in | [apps/api/src/library/routes.ts:117](../../apps/api/src/library/routes.ts#L117) |
| POST | /api/auth/accept-terms | signed-in | [apps/api/src/account/routes.ts:51](../../apps/api/src/account/routes.ts#L51) |
| POST | /api/auth/demo | rate-limited | [apps/api/src/app.ts:177](../../apps/api/src/app.ts#L177) |
| POST | /api/auth/login | rate-limited | [apps/api/src/app.ts:151](../../apps/api/src/app.ts#L151) |
| POST | /api/auth/logout | none detected | [apps/api/src/app.ts:185](../../apps/api/src/app.ts#L185) |
| POST | /api/auth/register | rate-limited | [apps/api/src/app.ts:115](../../apps/api/src/app.ts#L115) |
| GET | /api/auth/session | signed-in | [apps/api/src/account/routes.ts:43](../../apps/api/src/account/routes.ts#L43) |
| POST | /api/auth/workos-mcp/complete | signed-in | [apps/api/src/auth/workos-mcp.ts:29](../../apps/api/src/auth/workos-mcp.ts#L29) |
| GET | /api/developer-keys | signed-in | [apps/api/src/auth/api-keys.ts:35](../../apps/api/src/auth/api-keys.ts#L35) |
| POST | /api/developer-keys | signed-in | [apps/api/src/auth/api-keys.ts:46](../../apps/api/src/auth/api-keys.ts#L46) |
| DELETE | /api/developer-keys/:id | signed-in | [apps/api/src/auth/api-keys.ts:62](../../apps/api/src/auth/api-keys.ts#L62) |
| GET | /api/health | none detected | [apps/api/src/app.ts:107](../../apps/api/src/app.ts#L107) |
| GET | /api/imports | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:24](../../apps/api/src/imports/routes.ts#L24) |
| POST | /api/imports | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:76](../../apps/api/src/imports/routes.ts#L76) |
| GET | /api/imports/:id | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:25](../../apps/api/src/imports/routes.ts#L25) |
| POST | /api/imports/:id/ai-analysis | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:34](../../apps/api/src/imports/routes.ts#L34) |
| POST | /api/imports/:id/cancel | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:53](../../apps/api/src/imports/routes.ts#L53) |
| POST | /api/imports/:id/discard-created-items | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:69](../../apps/api/src/imports/routes.ts#L69) |
| PUT | /api/imports/:id/files/:fileId/chunks/:chunkIndex | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:94](../../apps/api/src/imports/routes.ts#L94) |
| POST | /api/imports/:id/jobs/cancel | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:63](../../apps/api/src/imports/routes.ts#L63) |
| GET | /api/imports/:id/progress | profile-complete, signed-in, terms-current | [apps/api/src/imports/routes.ts:29](../../apps/api/src/imports/routes.ts#L29) |
| GET | /api/items | profile-complete, signed-in | [apps/api/src/library/routes.ts:36](../../apps/api/src/library/routes.ts#L36) |
| POST | /api/items | profile-complete, rate-limited, signed-in | [apps/api/src/app.ts:214](../../apps/api/src/app.ts#L214) |
| DELETE | /api/items/:id | profile-complete, signed-in | [apps/api/src/library/routes.ts:84](../../apps/api/src/library/routes.ts#L84) |
| GET | /api/items/:id | profile-complete, signed-in | [apps/api/src/library/routes.ts:70](../../apps/api/src/library/routes.ts#L70) |
| PATCH | /api/items/:id | profile-complete, signed-in | [apps/api/src/library/routes.ts:76](../../apps/api/src/library/routes.ts#L76) |
| GET | /api/items/:id/job | profile-complete, signed-in | [apps/api/src/jobs/routes.ts:19](../../apps/api/src/jobs/routes.ts#L19) |
| POST | /api/items/:id/job/cancel | profile-complete, signed-in | [apps/api/src/jobs/routes.ts:20](../../apps/api/src/jobs/routes.ts#L20) |
| POST | /api/items/:id/job/reprocess | profile-complete, signed-in | [apps/api/src/jobs/routes.ts:22](../../apps/api/src/jobs/routes.ts#L22) |
| POST | /api/items/:id/job/retry | profile-complete, signed-in | [apps/api/src/jobs/routes.ts:21](../../apps/api/src/jobs/routes.ts#L21) |
| DELETE | /api/items/:itemId/tags/:tagId | profile-complete, signed-in | [apps/api/src/organization/routes.ts:48](../../apps/api/src/organization/routes.ts#L48) |
| PUT | /api/items/:itemId/tags/:tagId | profile-complete, signed-in | [apps/api/src/organization/routes.ts:44](../../apps/api/src/organization/routes.ts#L44) |
| GET | /api/items/suggestions | profile-complete, signed-in | [apps/api/src/library/routes.ts:64](../../apps/api/src/library/routes.ts#L64) |
| GET | /api/knowledge/ai-preferences | profile-complete, signed-in | [apps/api/src/knowledge/routes.ts:69](../../apps/api/src/knowledge/routes.ts#L69) |
| PUT | /api/knowledge/ai-preferences | profile-complete, signed-in, terms-current | [apps/api/src/knowledge/routes.ts:73](../../apps/api/src/knowledge/routes.ts#L73) |
| POST | /api/knowledge/answer | profile-complete, rate-limited, signed-in, terms-current | [apps/api/src/knowledge/routes.ts:129](../../apps/api/src/knowledge/routes.ts#L129) |
| GET | /api/knowledge/graph | profile-complete, signed-in | [apps/api/src/knowledge/routes.ts:83](../../apps/api/src/knowledge/routes.ts#L83) |
| GET | /api/knowledge/graph/export/obsidian | profile-complete, signed-in | [apps/api/src/knowledge/routes.ts:87](../../apps/api/src/knowledge/routes.ts#L87) |
| PATCH | /api/knowledge/items/:id/memory | profile-complete, signed-in | [apps/api/src/knowledge/routes.ts:95](../../apps/api/src/knowledge/routes.ts#L95) |
| GET | /api/knowledge/items/:itemId/summary | profile-complete, signed-in | [apps/api/src/knowledge/routes.ts:252](../../apps/api/src/knowledge/routes.ts#L252) |
| POST | /api/knowledge/items/:itemId/summary | profile-complete, rate-limited, signed-in, terms-current | [apps/api/src/knowledge/routes.ts:260](../../apps/api/src/knowledge/routes.ts#L260) |
| POST | /api/knowledge/recall/next | profile-complete, signed-in | [apps/api/src/knowledge/routes.ts:105](../../apps/api/src/knowledge/routes.ts#L105) |
| POST | /api/knowledge/recall/prompts/:id/respond | profile-complete, signed-in | [apps/api/src/knowledge/routes.ts:119](../../apps/api/src/knowledge/routes.ts#L119) |
| POST | /api/knowledge/recall/prompts/:id/reveal | profile-complete, signed-in | [apps/api/src/knowledge/routes.ts:109](../../apps/api/src/knowledge/routes.ts#L109) |
| GET | /api/media/:id | profile-complete, signed-in | [apps/api/src/library/routes.ts:127](../../apps/api/src/library/routes.ts#L127) |
| POST | /api/notes | profile-complete, signed-in, upload | [apps/api/src/library/routes.ts:104](../../apps/api/src/library/routes.ts#L104) |
| PATCH | /api/notes/:id | profile-complete, signed-in, upload | [apps/api/src/library/routes.ts:105](../../apps/api/src/library/routes.ts#L105) |
| DELETE | /api/notes/:id/assets/:assetId | profile-complete, signed-in | [apps/api/src/library/routes.ts:107](../../apps/api/src/library/routes.ts#L107) |
| GET | /api/onboarding | signed-in | [apps/api/src/account/routes.ts:79](../../apps/api/src/account/routes.ts#L79) |
| PUT | /api/onboarding | signed-in | [apps/api/src/account/routes.ts:83](../../apps/api/src/account/routes.ts#L83) |
| GET | /api/profile | signed-in | [apps/api/src/account/routes.ts:60](../../apps/api/src/account/routes.ts#L60) |
| PATCH | /api/profile | signed-in | [apps/api/src/account/routes.ts:65](../../apps/api/src/account/routes.ts#L65) |
| POST | /api/search/feedback | profile-complete, signed-in | [apps/api/src/library/routes.ts:54](../../apps/api/src/library/routes.ts#L54) |
| POST | /api/semantic/index | profile-complete, rate-limited, signed-in, terms-current | [apps/api/src/library/semantic-routes.ts:155](../../apps/api/src/library/semantic-routes.ts#L155) |
| GET | /api/semantic/preferences | signed-in | [apps/api/src/library/semantic-routes.ts:126](../../apps/api/src/library/semantic-routes.ts#L126) |
| PUT | /api/semantic/preferences | signed-in, terms-current | [apps/api/src/library/semantic-routes.ts:130](../../apps/api/src/library/semantic-routes.ts#L130) |
| GET | /api/semantic/search | profile-complete, rate-limited, signed-in, terms-current | [apps/api/src/library/semantic-routes.ts:201](../../apps/api/src/library/semantic-routes.ts#L201) |
| GET | /api/smart-collections | profile-complete, signed-in | [apps/api/src/smart-collections/routes.ts:27](../../apps/api/src/smart-collections/routes.ts#L27) |
| PATCH | /api/smart-collections/:collectionId | profile-complete, signed-in | [apps/api/src/smart-collections/routes.ts:43](../../apps/api/src/smart-collections/routes.ts#L43) |
| GET | /api/smart-collections/:collectionId/items | profile-complete, signed-in | [apps/api/src/smart-collections/routes.ts:37](../../apps/api/src/smart-collections/routes.ts#L37) |
| PUT | /api/smart-collections/:collectionId/items/:itemId/override | profile-complete, signed-in | [apps/api/src/smart-collections/routes.ts:49](../../apps/api/src/smart-collections/routes.ts#L49) |
| POST | /api/smart-collections/refresh | profile-complete, signed-in | [apps/api/src/smart-collections/routes.ts:32](../../apps/api/src/smart-collections/routes.ts#L32) |
| GET | /api/tags | profile-complete, signed-in | [apps/api/src/organization/routes.ts:27](../../apps/api/src/organization/routes.ts#L27) |
| POST | /api/tags | profile-complete, signed-in | [apps/api/src/organization/routes.ts:28](../../apps/api/src/organization/routes.ts#L28) |
| DELETE | /api/tags/:tagId | profile-complete, signed-in | [apps/api/src/organization/routes.ts:40](../../apps/api/src/organization/routes.ts#L40) |
| PATCH | /api/tags/:tagId | profile-complete, signed-in | [apps/api/src/organization/routes.ts:34](../../apps/api/src/organization/routes.ts#L34) |
| GET | /api/v1/collections | api-key | [apps/api/src/integrations/api-v1.ts:56](../../apps/api/src/integrations/api-v1.ts#L56) |
| GET | /api/v1/items | api-key | [apps/api/src/integrations/api-v1.ts:28](../../apps/api/src/integrations/api-v1.ts#L28) |
| POST | /api/v1/items | api-key, profile-complete | [apps/api/src/integrations/api-v1.ts:42](../../apps/api/src/integrations/api-v1.ts#L42) |
| GET | /api/v1/items/:id | api-key | [apps/api/src/integrations/api-v1.ts:34](../../apps/api/src/integrations/api-v1.ts#L34) |
| POST | /api/visual-search | profile-complete, rate-limited, signed-in, terms-current, upload | [apps/api/src/ai/visual-search-routes.ts:105](../../apps/api/src/ai/visual-search-routes.ts#L105) |
| POST | /api/web-search | profile-complete, rate-limited, signed-in, terms-current | [apps/api/src/ai/web-search-routes.ts:24](../../apps/api/src/ai/web-search-routes.ts#L24) |

Route declarations found: 77.
