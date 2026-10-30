# Phase 4 search evaluation harness

The existing six-item retrieval test is synthetic sanity coverage, not representative relevance evidence. This harness lets a reviewer provide a separate owner-local dataset of graded item judgments and measure current API rankings without exporting query or item text into the report.

## Dataset

Validate dataset files against `phase-4-retrieval-dataset.schema.json`. Each query lists judged saved-item UUIDs with grades from 0 (not relevant) to 3 (highly relevant). `judgmentSource` must be `human-reviewed` or `synthetic`; the report carries that label. The runner rejects duplicate query IDs/item judgments and requires at least one positive grade per query. Keep query text and item IDs local to the reviewer; do not commit private library datasets.

Example shape (synthetic only):

```json
{
  "schemaVersion": 1,
  "judgmentSource": "synthetic",
  "description": "Synthetic test data; not a representative corpus.",
  "queries": [
    {
      "id": "q-design-01",
      "query": "design system",
      "judgments": [
        { "itemId": "7b2f6db0-6936-48de-b809-090b22079031", "grade": 3 },
        { "itemId": "8f4bf0ab-0939-4c7f-a487-c07fded91ea4", "grade": 1 }
      ]
    }
  ]
}
```

## Run

Start a local Rembr API with a synthetic signed-in account and the labeled items loaded. Set `REMBR_EVAL_SESSION_COOKIE` in the process environment; the runner never reads it from or writes it to the dataset. By default it connects only to `http://127.0.0.1:4000` and retrieves up to 1,000 results per query. Remote API targets require the explicit `--allow-remote` flag and HTTPS.

```powershell
$env:REMBR_EVAL_SESSION_COOKIE = '<local test session cookie>'
npm.cmd --workspace @rembr/api run evaluate-search -- .\local-search-qrels.json
```

The JSON report contains macro and index-only per-query MRR@10, nDCG@10, recall@10, judged/result counts, and whether a query exceeded the 1,000-result cap. It omits raw query strings, dataset descriptions, query IDs, item IDs, and cookie values. Search API calls may create normal owner-scoped search-event telemetry (query hash and length only).

## Semantic retrieval status

The current retrieval stack includes deterministic lexical search and a separate semantic path. Semantic retrieval uses OpenAI `text-embedding-3-small` through OpenRouter, with separate off-by-default consent, owner-scoped Supabase vector storage, explicit resumable indexing, hybrid API/UI, keyword fallback, and vector cleanup on consent revocation. Local mocked/API coverage and a synthetic live embedding request are recorded in [`phase-4-record.md`](../rebuild-plan/phase-4-record.md). Render still needs `OPENROUTER_API_KEY` configured for deployed semantic requests, and representative human-reviewed relevance judgments remain unrun. This harness measures lexical API rankings; it does not by itself establish semantic retrieval quality.

Do not claim retrieval quality from a synthetic dataset. A representative result requires a human-reviewed query set drawn from an agreed corpus, multiple judgments per ambiguous query where practical, and documented corpus scope. Measure latency separately from ranking quality.
