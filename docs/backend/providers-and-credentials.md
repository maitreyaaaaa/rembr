# Provider catalogs, credentials, and analysis calls

**Scope:** source-derived orchestration behavior only. See source paths under `apps/orchestration/src`. User-configured provider credentials appear only partially wired, so do not describe them as a working product feature without additional code evidence.

## Provider registry

`services/providers.js` declares provider-purpose catalogs (`:1-71`): text providers OpenRouter, OpenAI, Anthropic, DeepSeek, Gemini, GLM and OpenAI-compatible; media providers Gemini and OpenRouter; embeddings OpenRouter. `assertProviderPurpose` validates that combination; media models are allowlisted (`:73-86`). App defaults are DeepSeek text, Gemini media, OpenAI embedding model via OpenRouter (`:5-7`). `credentialOptions` exposes provider metadata and model defaults (`:164-177`). This catalog does not itself configure providers or prove the worker uses each option.

For OpenAI-compatible text, `normalizeOpenAICompatibleBaseUrl` requires a valid HTTPS URL, forbids embedded credentials, strips query/fragment/trailing slash/chat-completions suffix, and calls public-host checks (`:88-108`). Localhost, common private/link-local IPv4, selected IPv6, `.local`, `.internal`, `.lan`, and home.arpa names are rejected (`:126-161`). Hostname DNS resolution is not pinned or rechecked here, so DNS rebinding/private-address resolution is not ruled out by this string-only validation. Because the provider credential path is not wired in the reviewed runtime, treat this as a future integration boundary; Rembr should enforce egress restrictions at connection time too.

## Credential helper versus runtime wiring

`services/credentials.js` derives a 256-bit AES key as SHA-256 of the configured key string, encrypts with AES-256-GCM using random 12-byte IV and auth tag, stores a versioned `v1:iv:tag:ciphertext` text format, authenticates/decrypts on read, and provides a display mask (`credentials.js:3-34`). Tests cover round-trip and masking, but not key rotation, malformed base64, wrong-key migration, or production secret management.

Repository-wide callsite search found `encryptSecret`, `decryptSecret`, and `maskSecret` only in their module and `credentials.test.js`; no orchestration production module imports them. `config.js` reads `CREDENTIAL_ENCRYPTION_KEY`; migrations define `user_provider_credentials` and `user_ai_keys`; Supabase store only disables or deletes provider rows as part of account deletion. There are no provider credential read/write methods or API routes in the reviewed `apps/orchestration/src`. This means encryption helper and schema are not proof of an implemented BYOK experience.

`chooseAnalysisPlan` in `services/worker.js:473-533` only selects the configured app OpenAI key, checks paid credits, and otherwise runs basic analysis. It never resolves user credentials. `test/worker.test.js:6-31` explicitly gives a fake `getPreferredProviderCredential` and asserts it is ignored. `services/credentials.js` may therefore be residual/planned functionality. Keep provider catalog/schema/helper availability distinct from live feature support in Rembr docs and UI.

## Provider-client behavior

`services/providerClients.js` routes text generation to OpenRouter, fixed OpenAI-compatible endpoints (OpenAI, DeepSeek, GLM), custom HTTPS-compatible endpoint, Anthropic, or Gemini (`:20-77`). `testProviderCredential` sends a short “Reply OK” request for selected provider types (`:79-159`); there is no API route integration found in orchestration source. OpenAI-compatible and Anthropic calls build JSON requests from analyzer prompts; provider HTTP errors become thrown errors (`:161-224`).

Media analysis supports Gemini, OpenAI and OpenRouter. OpenAI media filters video files out and sends images; OpenRouter media checks the allowlist; screenshot image-buffer calls similarly dispatch to Gemini/OpenAI/OpenRouter (`:225-443`). Media files are read from local disk, encoded as data URLs, and posted with caption/context; MIME is inferred from file suffix (`:285-374`). Gemini uses its SDK. The provider receives saved-item text/media, so privacy disclosure and consent need to explain external data transfer; provider retention behavior is outside repository evidence.

`isProviderLimitError` classifies message substrings including “unauthorized,” “invalid api key,” and generic “api key” as provider limits (`:16-18`); worker then pauses as `paused_api_limit`. This can conflate invalid credentials/configuration with quota limits and produce misleading user status. Rembr should use provider HTTP status/code categories (auth, permission, quota, transient, invalid request) and preserve sanitized operator details separately.

## Worker and screenshot differences

The indexing worker uses app OpenAI model settings and paid credits; no provider credential registry. Screenshot analysis also uses app OpenAI, can try local ML first, and falls back to paid app AI only if credits permit (`application/screenshotWorkflow.js:8-45`, `:78-110`). Local ML plans carry `source: null`; no usage event is recorded for that path. Screenshot budget is checked before analysis (`:47-54`). This path is separate from item indexing and has its own 60-second timeout (`:6`).

## Full provider and credential helper trace

`services/credentials.js` was read in full (40 lines): `deriveKey` (`:3-8`) requires configured string and derives AES-256 key as SHA-256; `encryptSecret` (`:10-16`) uses random 12-byte IV/AES-256-GCM and stores `v1:base64(iv):base64(tag):base64(ciphertext)`; `decryptSecret` (`:18-27`) validates version/fields, authenticates/decrypts; `maskSecret` (`:29-34`) reveals first 1–3 and last 2–4 chars according to length; exports at `:36-40`. It does not provide key versioning beyond literal `v1`, rotation or explicit base64/length validation. Repository callsite search still finds no production usage.

`services/providers.js` was read in full (193 lines). Catalogs/defaults are `:1-71`; purpose/model validators `assertProviderPurpose`/`assertMediaModelAllowed` `:73-86`; base URL parser `normalizeOpenAICompatibleBaseUrl` `:88-108`; endpoint and display-name helpers `:110-117`; config validation `:119-124`; host screening `assertPublicHostname` `:126-141`; IPv4 blocked ranges `:143-158`; IPv6 prefix check `:160-162`; public metadata `credentialOptions` `:164-179`; exports `:181-193`. Host screening is string-only: DNS resolution, alternate numeric IP spellings and connection-time redirect targets are not validated here.

`services/providerClients.js` was read in full (520 lines). Endpoint constants/app ref/JSON parsing/provider-limit classifier: `:14-31`. Text dispatcher `analyzeTextWithCredential` `:33-77` routes OpenRouter, fixed OpenAI/DeepSeek/GLM, custom OpenAI-compatible, Anthropic, Gemini; absent key/unsupported provider returns null. `testProviderCredential` `:79-153` issues provider-specific lightweight calls; no route or production store read/write usage was found. `simpleOpenAICompatibleRequest` `:155-172`; OpenAI-compatible text call `:174-193`; Anthropic `:195-215`; Gemini `:217-223`.

Media dispatcher `analyzeMediaWithCredential` `:225-249` and image-buffer dispatcher `:251-283` select Gemini/OpenAI/OpenRouter; unsupported/missing key returns null. OpenAI media `:285-320` drops video paths and sends image data; OpenRouter media `:322-356` checks media allowlist and sends image/video parts; `mediaContentPart` `:358-373` synchronously reads entire file and base64 encodes without its own byte cap. OpenAI image buffer `:375-399`, OpenRouter image buffer `:401-427` (allowlist), Gemini image buffer `:429-442`; common image projection `:444-451`; screenshot prompt `:453-464`; screenshot output normalizer `:466-484`; text/list caps `:486-492`; MIME inference `:494-504`; base text analysis/merge `:506-518`; exports `:520`.

### Provider-client findings

- Provider request errors generally become plain `Error` without stable HTTP status/code. Worker classifies by message regex; `isProviderLimitError` (`:28-31`) treats unauthorized/invalid key as quota/limit, risking a misleading pause state.
- Most raw `fetch` calls have no AbortSignal at this layer. Higher-level timeout races do not cancel them, and direct tests do not validate timeout/error handling.
- Media path reads are synchronous/unbounded in `mediaContentPart`; ensure worker/download size caps are established before dispatch and avoid blocking event loop for large files.
- Gemini calls use SDK and do not share HTTP response/status normalization with the other providers.
- `testProviderCredential` routes OpenAI-compatible and OpenRouter text/embedding plus Anthropic/Gemini probes; it does not enforce provider purpose/model constraints itself. The higher-level credential CRUD route is absent, so those checks must happen before use if feature is implemented.
- Keys and source media/caption are placed in outbound auth/body to external vendors by design. Record a data-transfer boundary and retention consent; repo does not establish vendor retention.

## Rembr design decisions and checks

1. Choose app-managed provider, user BYOK, or both; if both, define selection priority and billable source explicitly.
2. Either wire secure provider CRUD end-to-end (validated purpose/model, authenticated owner, encryption, rotate/revoke, masked read, server-only decrypt, tests) or remove unreachable schema/catalog/helper from the Rembr MVP plan.
3. Never return encrypted secrets/ciphertext to clients; store only encrypted secrets and safe key hints; use a KMS-backed/rotatable key strategy rather than a single unversioned SHA-256-derived env secret for new production work.
4. Use outbound allowlisting/private IP blocking after DNS resolution for custom endpoints; prevent redirects to internal targets and bound response body/time.
5. Give provider-specific errors stable machine categories; distinguish quota from invalid API key and transient network errors.
6. Document which item fields/media leave the app, who is billed, when analysis runs, and how deletion reaches third-party systems (currently unknown).


## Related documents

- [Backend architecture](backend-architecture.md)
- [API contracts](api-routes-and-contracts.md)
- [Worker contract](indexing-worker-contract.md)
- [Migration and RPC contracts](critical-migration-contracts.md)
