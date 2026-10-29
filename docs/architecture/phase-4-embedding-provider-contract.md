# Phase 4 semantic search provider and contract

## Status

The provider-neutral service boundary in `apps/api/src/library/semantic-embeddings.ts` is connected to OpenRouter's `openai/text-embedding-3-small` route, Supabase pgvector, consent/index/search APIs, and a keyword/semantic mode in the library UI. A synthetic live request succeeded on 2026-10-30 through the server-only `OPENROUTER_API_KEY`; a separate OpenAI key is not required. The configured key was found in the IScraper orchestration environment and was neither printed nor copied into Rembr files. Render still needs the server key configured when this branch is integrated and deployed.

## Contract enforced in code

- Providers declare a model identifier and fixed dimensions and implement `embed(text, purpose)` for `query` or `document` input.
- Vectors must match the declared model and dimensions, contain finite numbers, and not be all zeroes. Dimensions are capped at 4,096.
- Query text is limited to 1,200 characters; indexed document text to 12,000; the service accepts at most 16 documents and request 50 results. The API indexes four documents per resumable request.
- Index writes carry owner ID, item ID, content hash, model, and vector. Source text is not passed to the persistence interface.
- Similarity queries require an owner ID and model. Returned hits must echo that owner/model, be unique, carry a valid cosine score, and match the current source content hash. Stale vectors are discarded; results sort by score then item ID.
- The service is called sequentially for a bounded batch. Provider errors are sanitized at the route boundary and preserve lexical fallback.

## Selected design and remaining proof

1. **Model and provider — selected:** OpenRouter at its fixed `/api/v1/embeddings` endpoint, model `openai/text-embedding-3-small`, 1,536 dimensions. Keep `OPENROUTER_API_KEY` on the server; do not use an OpenAI key or expose either credential in the browser.
2. **Text and consent:** a separate, versioned, off-by-default OpenRouter disclosure gates all saved-text and query embedding. Consent alone does not index the library; the user explicitly starts indexing. The embedded payload is effective title, description, note body, and extracted page text only; media-analysis output and raw media are excluded. Existing Meta consent does not apply. Revoke consent to stop new calls and delete Rembr's vectors; upstream provider retention is governed by their terms.
3. **Storage:** Supabase's `extensions.vector(1536)` stores owner/item/model/content-hash/vector rows with a composite owner/item foreign key, cascade deletion, RLS, and no direct `PUBLIC`, `anon`, or `authenticated` grants. The API filters every read/write by authenticated owner and model. It exact-scans per owner/model without an approximate vector index until real scale justifies a benchmarked index.
4. **Refresh workflow:** indexing is user-triggered in small resumable batches and skips unchanged hashes. The user can rerun “Index or refresh saved text” after new saves or edits. Search never embeds a full library synchronously; it embeds only the query and uses current vectors. Stale vectors are suppressed by comparing a canonical hash against current source text.
5. **Usage and ranking:** each request reserves against Rembr's shared monthly AI budget; OpenRouter input-token usage settles the reservation, and uncertain outcomes remain held. Endpoint rate limits and a 200-microUSD maximum request reservation apply. Semantic mode blends the top semantic matches with the existing lexical matches; provider-off, consent-off, budget-full, empty-index, and provider-failure states return keyword search.
6. **Verification and evaluation:** mocked provider/repository tests cover local behavior. The hosted migration is applied and verified, and a synthetic live provider request returned the expected model and 1,536 dimensions. The final full local suite passed with 125 API tests, typecheck, lint, and production builds. Review the semantic UI in a browser before claiming that UI review is complete. Human-reviewed owner-local queries remain required for relevance claims; do not store private judgments in the repository.

## IScraper parity reference

IScraper's text semantic path uses OpenAI's `text-embedding-3-small` with 1,536 dimensions, persisted owner-scoped item vectors, and a vector similarity RPC; query embedding is optional and falls back to keyword search. It also supports an OpenRouter document-embedding credential path. Visual similarity uses a separate local-ML visual-vector path plus deterministic token overlap. Rembr's provider choice is now explicit; this reference does not authorize sending any other content or media to a provider.
