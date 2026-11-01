// Every embedding provider returns vectors of this length; it must match vector(1024)
// in migrations/002_create_documents_and_chunks.sql.
export const EMBEDDING_DIMENSIONS = 1024;

// "document" for chunks being stored, "query" for a user's question. Some models
// embed the two slightly differently to improve retrieval.
export type EmbeddingKind = 'document' | 'query';

export abstract class EmbeddingProvider {
  // Stored with each document so search never compares vectors from different models.
  abstract readonly model: string;
  abstract embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
}

export class EmbeddingProviderError extends Error {}

export function assertDimensions(vectors: number[][], expectedCount: number): number[][] {
  if (vectors.length !== expectedCount) {
    throw new EmbeddingProviderError(`Expected ${expectedCount} embeddings, got ${vectors.length}`);
  }
  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingProviderError(
        `Expected ${EMBEDDING_DIMENSIONS}-dimensional embeddings, got ${vector.length}`,
      );
    }
  }
  return vectors;
}
