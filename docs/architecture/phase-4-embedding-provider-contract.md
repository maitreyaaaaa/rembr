# Phase 4 embedding provider contract

## Status

Rembr has a provider-neutral semantic embedding service boundary in `apps/api/src/library/semantic-embeddings.ts`. It can index bounded text and rank a repository's owner-scoped vector matches through injected interfaces. Fake provider/repository tests verify the contract. **This is not production semantic search:** Rembr has no selected embedding model, provider adapter, vector persistence adapter, database route integration, or UI mode connected to this service.

## Contract enforced in code

- Providers declare a model identifier and fixed dimensions and implement `embed(text, purpose)` for `query` or `document` input.
- Vectors must match the declared model and dimensions, contain finite numbers, and not be all zeroes. Dimensions are capped at 4,096.
- Query text is limited to 1,200 characters; indexed document text to 12,000; a call can index at most 16 documents and request at most 50 results.
- Index writes carry owner ID, item ID, content hash, model, and vector. Source text is not passed to the persistence interface.
- Similarity queries require an owner ID and model. Returned hits must echo that owner/model, be unique, carry a valid cosine score, and match the current source content hash. Stale vectors are discarded; results sort by score then item ID.
- The service is called sequentially for a bounded batch. Provider errors are allowed to propagate so a future route can preserve the lexical fallback and report provider failure accurately.

## Decisions required before production integration

1. **Model and provider:** choose a privacy-reviewed adapter, model/version, output dimension, endpoint and credential location. If sending saved text externally, add a separate off-by-default disclosure and revocation state. Existing grounded-answer consent is scoped to its documented Meta answer/summary use and must not silently authorize embedding requests to another provider.
2. **Text contract:** define which source fields are embedded (page body, note body, effective title/description, and optionally existing analysis), per-field and total input limits, normalization, and a stable source hash. Do not embed private notes/media without explicit consent for the selected provider.
3. **Storage and indexing:** select vector storage (for example, pgvector versus a provider-neutral repository), dimension/index strategy, owner/item foreign keys, RLS and API-role access, model-version isolation, and deletion/cascade behavior. The semantic service's repository contract requires owner-filtered writes/searches and current-source hashes; the eventual adapter must enforce both in SQL and tests.
4. **Refresh workflow:** decide how existing and newly captured items are indexed, how failures/retries work, how stale vectors are hidden until reindexed, and whether indexing is user-triggered or queued. Never synchronously embed the full library during a search request.
5. **Usage and ranking:** set provider-specific cost accounting, reservation/uncertain-outcome policy, rate caps, minimum similarity and how lexical and semantic ranks combine. Keep deterministic lexical search available when the provider, index or embedding is missing.
6. **Product and evaluation:** choose explicit semantic/hybrid search UI and degraded states. Evaluate with synthetic cases for implementation and a separately human-reviewed owner-local query set before making retrieval-quality claims; never store private qrels in the repository.

## IScraper parity reference

IScraper's text semantic path uses OpenAI's `text-embedding-3-small` with 1,536 dimensions, persisted owner-scoped item vectors, and a vector similarity RPC; query embedding is optional and falls back to keyword search. It also supports an OpenRouter document-embedding credential path. Visual similarity uses a separate local-ML visual-vector path plus deterministic token overlap. Rembr has not selected or ported either provider/storage design; this reference is not an authorization to transmit Rembr library content to those services.
