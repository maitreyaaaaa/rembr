import { createHash } from 'node:crypto';

export interface SemanticSourceFields {
  title: string | null | undefined;
  description: string | null | undefined;
  noteBody?: string | null;
  extractedText?: string | null;
}

/**
 * Canonical text sent to the embedding provider and hashed for freshness.
 * Keep this shared between indexing and repository result validation.
 */
export function buildSemanticDocumentText(source: SemanticSourceFields): string {
  return [source.title, source.description, source.noteBody, source.extractedText]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 12_000);
}

export function hashSemanticDocumentText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
