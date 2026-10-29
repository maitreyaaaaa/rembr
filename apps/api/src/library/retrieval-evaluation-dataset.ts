import { z } from 'zod';

const judgmentSchema = z.object({ itemId: z.string().uuid(), grade: z.number().int().min(0).max(3) }).strict();
const querySchema = z.object({
  id: z.string().min(1).max(80),
  query: z.string().trim().min(1).max(120),
  judgments: z.array(judgmentSchema).min(1).max(2_000),
}).strict().superRefine((entry, context) => {
  const itemIds = entry.judgments.map(({ itemId }) => itemId);
  if (new Set(itemIds).size !== itemIds.length) context.addIssue({ code: 'custom', path: ['judgments'], message: 'Each item may have only one grade.' });
  if (!entry.judgments.some(({ grade }) => grade > 0)) context.addIssue({ code: 'custom', path: ['judgments'], message: 'At least one item must have a positive relevance grade.' });
});
const datasetSchema = z.object({
  schemaVersion: z.literal(1),
  judgmentSource: z.enum(['human-reviewed', 'synthetic']),
  description: z.string().min(1).max(500),
  queries: z.array(querySchema).min(1).max(1_000),
}).strict().superRefine((dataset, context) => {
  const ids = dataset.queries.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['queries'], message: 'Query IDs must be unique.' });
});

export type RetrievalEvaluationDataset = z.infer<typeof datasetSchema>;

export function parseRetrievalEvaluationDataset(input: unknown): RetrievalEvaluationDataset {
  const parsed = datasetSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid evaluation dataset: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  return parsed.data;
}
