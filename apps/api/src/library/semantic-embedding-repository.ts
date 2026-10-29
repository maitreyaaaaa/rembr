import type { DatabaseHandle } from '../db/database.js';
import { lockActiveOwner } from '../account/owner-lifecycle.js';
import type {
  SemanticEmbeddingRecord,
  SemanticEmbeddingRepository,
  SemanticSearchHit,
} from './semantic-embeddings.js';
import { buildSemanticDocumentText, hashSemanticDocumentText } from './semantic-source.js';

const VECTOR_DIMENSIONS = 1_536;
const CANDIDATE_PAGE_SIZE = 200;

type SemanticRow = {
  ownerId: string;
  itemId: string;
  contentHash: string;
  model: string;
  similarity: number | string;
  title: string | null;
  description: string | null;
  noteBody: string | null;
  extractedText: string | null;
};

function vectorLiteral(values: readonly number[]): string {
  if (values.length !== VECTOR_DIMENSIONS || values.some((value) => !Number.isFinite(value))) {
    throw new Error('semantic_embedding_invalid_vector');
  }
  return `[${values.join(',')}]`;
}

function asHit(row: SemanticRow): SemanticSearchHit {
  const source = buildSemanticDocumentText({
    title: row.title,
    description: row.description,
    noteBody: row.noteBody,
    extractedText: row.extractedText,
  });
  const similarity = Number(row.similarity);
  if (!Number.isFinite(similarity)) throw new Error('semantic_embedding_invalid_similarity');
  return {
    ownerId: row.ownerId,
    itemId: row.itemId,
    contentHash: row.contentHash,
    sourceContentHash: source ? hashSemanticDocumentText(source) : null,
    model: row.model,
    similarity,
  };
}

export function createSemanticEmbeddingRepository(database: DatabaseHandle): SemanticEmbeddingRepository {
  return {
    async upsertOwnerEmbedding(record: SemanticEmbeddingRecord): Promise<void> {
      const vector = vectorLiteral(record.vector);
      const now = new Date().toISOString();
      await database.transaction(async () => {
        if (!await lockActiveOwner(database, record.ownerId)) throw new Error('account_inactive');
        await database.prepare(`INSERT INTO semantic_item_embeddings
          (owner_id,item_id,content_hash,model,embedding,created_at,updated_at)
          VALUES (?,?,?,?,?::extensions.vector,?,?)
          ON CONFLICT(owner_id,item_id,model) DO UPDATE SET
            content_hash=excluded.content_hash, embedding=excluded.embedding, updated_at=excluded.updated_at`)
          .run(record.ownerId, record.itemId, record.contentHash, record.model, vector, now, now);
      })();
    },

    async searchOwnerEmbeddings(input): Promise<readonly SemanticSearchHit[]> {
      const vector = vectorLiteral(input.vector);
      const page = database.prepare(`SELECT
          embedding.owner_id AS "ownerId", embedding.item_id AS "itemId",
          embedding.content_hash AS "contentHash", embedding.model AS "model",
          1 - (embedding.embedding OPERATOR(extensions.<=>) ?::extensions.vector) AS "similarity",
          COALESCE(item.title_override,item.title) AS "title",
          COALESCE(item.description_override,item.description) AS "description",
          note.body AS "noteBody", artifact.text_content AS "extractedText"
        FROM semantic_item_embeddings AS embedding
        JOIN saved_items AS item
          ON item.owner_id=embedding.owner_id AND item.id=embedding.item_id
        LEFT JOIN notes AS note
          ON note.owner_id=item.owner_id AND note.item_id=item.id
        LEFT JOIN extracted_artifacts AS artifact
          ON artifact.owner_id=item.owner_id AND artifact.item_id=item.id
        WHERE embedding.owner_id=? AND embedding.model=?
        ORDER BY embedding.embedding OPERATOR(extensions.<=>) ?::extensions.vector ASC, embedding.item_id ASC
        LIMIT ? OFFSET ?`);
      const hits: SemanticSearchHit[] = [];
      let offset = 0;
      while (hits.length < input.limit) {
        const rows = await page.all<SemanticRow>(vector, input.ownerId, input.model, vector, CANDIDATE_PAGE_SIZE, offset);
        for (const row of rows) {
          const hit = asHit(row);
          if (hit.ownerId !== input.ownerId || hit.model !== input.model) {
            throw new Error('semantic_embedding_repository_scope_violation');
          }
          // Continue paging past stale rows so they cannot displace current matches.
          if (hit.sourceContentHash === hit.contentHash) hits.push(hit);
          if (hits.length >= input.limit) break;
        }
        if (rows.length < CANDIDATE_PAGE_SIZE) break;
        offset += rows.length;
      }
      return hits;
    },
  };
}
