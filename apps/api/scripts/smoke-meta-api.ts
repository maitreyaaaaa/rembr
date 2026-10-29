import { config } from '../src/config.js';
import { createMetaModelClient, MetaApiError, MUSE_SPARK_MODEL } from '../src/ai/meta-client.js';

const client = createMetaModelClient({ apiKey: config.META_API_KEY });

try {
  const result = await client.analyzeText(
    'Synthetic connectivity check only. Reply with the single word READY. Do not use tools or external data.',
  );
  console.log(JSON.stringify({
    ok: result.text.trim().length > 0,
    model: MUSE_SPARK_MODEL,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error instanceof MetaApiError ? error.code : 'unexpected_error',
    ...(error instanceof MetaApiError && error.status ? { status: error.status } : {}),
  }));
  process.exitCode = 1;
}
