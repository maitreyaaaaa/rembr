# Meta AI in Rembr

**Evidence review:** 5 November 2026
**Purpose:** Explain which Meta products Rembr uses, where they appear in the implementation, what has been verified in production, and what must not be inferred from that evidence.

## Summary

Rembr integrates two Meta Model API models in the product:

1. **Muse Spark 1.3** handles opted-in text and media analysis, visual-search query understanding, grounded answers over a user's saved library, and an explicitly requested saved-item summary.
2. **Muse Voice Transcribe 1.0** transcribes supported WAV audio made available by the media pipeline.

The models are called by the server using Meta's hosted Model API. Rembr does not ship model weights or fine-tune a Meta model. The source, tests, and production evidence support the product-integration claims below. They do not establish that Muse Code authored the repository.

## Where each Meta model is used

| Meta product | Product behavior | Implementation evidence | Evidence boundary |
| --- | --- | --- | --- |
| **Muse Spark 1.3** (`muse-spark-1.3`) | Analyzes saved images, supported video, or text-only posts when media is unavailable. It returns structured summaries, visual descriptions, OCR text, keywords, tags, and supported entity names. | [Model IDs and Responses API client](../apps/api/src/ai/meta-client.ts#L4); [consent-gated analysis worker](../apps/api/src/ai/worker.ts#L224). | Image analysis has persisted production evidence. Video and text paths are implemented; see the dated production snapshot below. |
| **Muse Spark 1.3** | Powers Ask Rembr answers over retrieved, owner-scoped saves. The server supplies selected saved content and validates returned source IDs so the answer can cite those items. | [Grounded library answer route](../apps/api/src/knowledge/routes.ts#L166). | The route is implemented. Existing usage reservations do not identify this route, so they cannot establish a production call count for Ask Rembr. |
| **Muse Spark 1.3** | Interprets an image selected for Visual Search, returns a textual query and description, then Rembr searches the owner's library with those terms. | [Visual Search route](../apps/api/src/ai/visual-search-routes.ts#L102). | This is image understanding followed by term search; it is not a visual-embedding or object-segmentation pipeline. It requires a separate disclosure and consent. |
| **Muse Spark 1.3** | Creates a separate summary for a saved item when the user explicitly requests one. | [Saved-item summary route](../apps/api/src/knowledge/routes.ts#L289), [summary persistence](../apps/api/src/knowledge/summaries.ts#L1). | The feature is implemented. The production table contained no explicit saved-item summary records in the snapshot below. |
| **Muse Voice Transcribe 1.0** (`muse-voice-transcribe-1.0`) | Transcribes supported WAV audio exposed by the media pipeline and stores the transcript with the analysis result. | [Transcription API client](../apps/api/src/ai/meta-client.ts#L354); [worker call and result handling](../apps/api/src/ai/worker.ts#L354). | The route is implemented and request validation is tested. The production snapshot contained no recorded audio seconds. |

The analysis worker uses strict structured outputs. Before and after provider calls it checks the user's current AI-analysis preference and reserves/settles usage against the shared budget. The selected media is processed in bounded jobs so the browser does not have to remain open. See [worker orchestration](../apps/api/src/worker/index.ts#L1), [analysis job implementation](../apps/api/src/ai/worker.ts#L224), and [Meta client tests](../apps/api/test/meta-client.test.ts#L37).

### Media path

1. A user saves or imports content. Rembr stores the item and queues work in PostgreSQL.
2. The worker obtains supported public-page text and media, and resolves temporary analysis media for eligible video posts.
3. Muse Spark analyzes image groups or supported MP4 input. For supported video audio, the media path can prepare WAV input for Muse Voice Transcribe.
4. Rembr stores the structured output beside its source item, including whether analysis completed or was partial.

The provider client rejects unsupported or oversized inputs before sending them. The current integration does not mean every Instagram link exposes downloadable media: inaccessible, non-MP4, or missing media can result in partial analysis. See [temporary media resolution](../apps/api/src/ai/temporary-media.ts#L1), [public media handling](../apps/api/src/items/safe-fetch.ts#L1), and [the phase-three media limits](./architecture/phase-3-architecture-design.md).

## Production evidence snapshot

An aggregate, read-only query of Rembr's connected Supabase project on **4 November 2026 UTC** returned:

- **296 completed** `muse-spark-1.3` analysis records covering **3,021 image inputs**.
- **2 partial** `muse-spark-1.3` records, with no image inputs recorded on those rows.
- **0 recorded video items** and **0 audio seconds** across the stored analysis results.
- **0 rows** in the separate explicit saved-item-summary table.
- The worker status row reported `meta_api_configured = true`, with a heartbeat at `2026-11-04T23:54:45Z`.

These are aggregate counts only; no saved text, media, prompts, account identifiers, or other customer records were read for this check. The analysis table does not record a route name, so these counts do not reveal how many production calls came from Visual Search, Ask Rembr, or another Spark-backed route. The worker heartbeat proves that the server reported a configured key at that time; it does not prove a particular feature call succeeded.

**What can be claimed:** Muse Spark image analysis is both implemented and evidenced by persisted production records. Muse Spark video analysis, text analysis, grounded answers, Visual Search, explicit summaries, and Muse Voice transcription have code paths; this snapshot does not prove production calls for each of them. In particular, do not describe video or audio analysis as production-verified based on this snapshot.

## What the tests prove

[`meta-client.test.ts`](../apps/api/test/meta-client.test.ts) substitutes a mock `fetch` response to check model IDs, API payloads, structured-output parsing, usage accounting, and invalid input handling. It is a provider-contract test; it does not call Meta or prove live model quality. The existing synthetic smoke script is [`smoke-meta-api.ts`](../apps/api/scripts/smoke-meta-api.ts). A successful run with synthetic text would verify connectivity only, not quality on saved content or production usage.

## Provider boundaries and products not used

- **OpenRouter is a separate provider.** Rembr uses it for public web search and for semantic embeddings through `openai/text-embedding-3-small`. Those are not Meta model calls. See [`openrouter-web-search.ts`](../apps/api/src/ai/openrouter-web-search.ts#L1) and [`openrouter-embedding-provider.ts`](../apps/api/src/library/openrouter-embedding-provider.ts#L1).
- **Muse Image** is not integrated. Rembr does not generate or edit user images through it.
- **SAM 3.1** is not integrated. Rembr does not use Meta segmentation masks or boxes.
- **Muse Spark Open** and **Muse Glimmer** are not integrated or self-hosted by Rembr.
- **Muse Code** is a coding agent, not the model API used by the product. No Muse Code session export or trajectory for authorship of this repository is present in this checkout. Do not claim it authored existing code. That claim would require a genuine, reviewable session export linked to work produced in that session.

Meta's current [Model API model catalog](https://dev.meta.ai/docs/models) explains the distinction between Spark for multimodal reasoning, Muse Voice for speech-to-text, Muse Image for image generation/editing, and SAM for segmentation.

## Why this product uses multimodal models

Rembr's problem is retrieval: people save visual posts and short videos, then later need to find the idea inside them. A text caption alone can omit the content that made a save useful. Muse Spark supplies a single hosted model interface for text, image, and video understanding; the separate Voice model provides a transcription path when supported audio is available. The model extracts searchable context, while Rembr keeps the original item and source alongside that context.

The design follows three research-informed choices:

1. **External memory should reduce recall work while preserving a route back to the source.** Risko and Gilbert's review describes cognitive offloading as using actions or the environment to reduce cognitive demands. Sparrow, Liu, and Wegner's work on internet access and memory is relevant background, while later reviews show that effects depend on context and should not be reduced to “people forget everything online.” Rembr's product claim is therefore about saving context and improving retrieval, not improving human memory. See [Cognitive Offloading (2016)](https://doi.org/10.1016/j.tics.2016.07.002), [Google Effects on Memory (2011)](https://pubmed.ncbi.nlm.nih.gov/21764755/), and [the 2024 meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC10830778/).
2. **Video understanding needs temporal and multimodal evaluation.** Video-MME covers clips from seconds to an hour and evaluates frames alongside subtitles and audio; its experiments show that adding subtitle/audio information can improve performance in some settings. Video-MME-v2 adds grouped consistency and reasoning-faithfulness checks. These results motivate testing OCR, speech, and temporal sequence together; they do not benchmark Muse Spark or prove Rembr's accuracy. See [Video-MME (CVPR 2025)](https://arxiv.org/abs/2405.21075) and [Video-MME-v2 (2026)](https://arxiv.org/abs/2604.05015).
3. **Long-video systems need memory and retrieval strategies.** MovieChat studies sparse memory for long-video question answering. Rembr does not implement MovieChat's architecture; the paper is relevant prior work for future improvements to frame selection and temporal recall. See [MovieChat (CVPR 2024)](https://arxiv.org/abs/2307.16449).

Meta's [Muse Spark announcement](https://ai.meta.com/blog/introducing-muse-spark-msl/) and [Model API documentation](https://dev.meta.ai/docs/protocols/responses) describe Meta's model and its supported multimodal request format. Rembr uses the documented Model API; it does not train or fine-tune Muse Spark.

## Research implications for evaluation

Research supports the *shape* of Rembr's approach, not a claim that its analyses are correct. A useful evaluation set should sample different source platforms and reel formats, label the post's visible text and spoken words, compare time-ordered frames to the generated summary, and verify that answers cite the right saved items. Track partial media acquisition separately from model mistakes. The current production snapshot has no recorded video-analysis rows, so video accuracy needs a controlled, consented evaluation before it can be reported as production performance.
