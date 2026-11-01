import { Injectable } from '@nestjs/common';
import { EmbeddingProvider } from '../ai/embedding.provider';
import { DatabaseService } from '../database/database.service';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number;
  content: string;
  // Cosine similarity: 1 = same direction (same meaning), 0 = unrelated.
  similarity: number;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async search(workspaceId: string, query: string, limit: number): Promise<RetrievedChunk[]> {
    const [vector] = await this.embeddings.embed([query], 'query');
    // A query with no usable words (e.g. only "the a of") has no direction to compare.
    if (vector.every((v) => v === 0)) return [];

    return this.db.transaction(async (q) => {
      // The HNSW index finds nearest neighbours first and applies WHERE filters after.
      // Iterative scan keeps searching until it has `limit` rows that pass the
      // workspace filter, instead of returning too few for small workspaces.
      await q(`SET LOCAL hnsw.iterative_scan = relaxed_order`);

      const rows = await q<Omit<RetrievedChunk, 'similarity'> & { distance: number }>(
        `SELECT * FROM (
           SELECT c.id AS "chunkId", c.document_id AS "documentId", d.filename,
                  c.page_number AS "pageNumber", c.content,
                  c.embedding <=> $2::vector AS distance
           FROM chunks c
           JOIN documents d ON d.id = c.document_id
           WHERE c.workspace_id = $1          -- tenant isolation: only this team's chunks
             AND d.status = 'ready'
             AND d.embedding_model = $3       -- only vectors from the current model
           ORDER BY c.embedding <=> $2::vector
           LIMIT $4
         ) nearest
         ORDER BY distance`, // relaxed_order can return rows slightly out of order
        [workspaceId, `[${vector.join(',')}]`, this.embeddings.model, limit],
      );

      return rows.map(({ distance, ...row }) => ({ ...row, similarity: 1 - distance }));
    });
  }
}
