import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { EmbeddingProvider } from '../ai/embedding.provider';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { chunkPages } from './chunker';
import { extractPages } from './pdf-text';

// A problem with the file itself. Retrying won't help, and the message is safe to show users.
export class PermanentIngestionError extends Error {}

const toVectorLiteral = (vector: number[]) => `[${vector.join(',')}]`;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  // PDF → pages → chunks → embeddings → database. Safe to run again for the same
  // document: it replaces any chunks left by an earlier attempt.
  async process(documentId: string, isFinalAttempt: boolean): Promise<void> {
    const [doc] = await this.db.query<{ workspace_id: string; storage_key: string }>(
      `UPDATE documents SET status = 'processing', error = NULL, updated_at = now()
       WHERE id = $1
       RETURNING workspace_id, storage_key`,
      [documentId],
    );
    if (!doc) {
      this.logger.warn(`Document ${documentId} no longer exists; skipping`);
      return;
    }

    try {
      const data = await this.storage.read(doc.storage_key);

      let pages;
      try {
        pages = await extractPages(data);
      } catch {
        throw new PermanentIngestionError('This PDF could not be read. It may be damaged or password-protected.');
      }

      const chunks = chunkPages(pages);
      if (chunks.length === 0) {
        throw new PermanentIngestionError(
          'No text was found in this PDF. Scanned documents need OCR, which DocuMind does not support yet.',
        );
      }

      const vectors = await this.embeddings.embed(
        chunks.map((c) => c.content),
        'document',
      );

      await this.db.transaction(async (query) => {
        await query(`DELETE FROM chunks WHERE document_id = $1`, [documentId]);
        // One INSERT for all chunks: unnest() turns the parallel arrays into rows.
        await query(
          `INSERT INTO chunks (document_id, workspace_id, chunk_index, page_number, content, embedding)
           SELECT $1, $2, t.chunk_index, t.page_number, t.content, t.embedding::vector
           FROM unnest($3::int[], $4::int[], $5::text[], $6::text[])
             AS t(chunk_index, page_number, content, embedding)`,
          [
            documentId,
            doc.workspace_id,
            chunks.map((c) => c.index),
            chunks.map((c) => c.pageNumber),
            chunks.map((c) => c.content),
            vectors.map(toVectorLiteral),
          ],
        );
        await query(
          `UPDATE documents
           SET status = 'ready', page_count = $2, chunk_count = $3, embedding_model = $4, updated_at = now()
           WHERE id = $1`,
          [documentId, pages.length, chunks.length, this.embeddings.model],
        );
      });

      this.logger.log(`Document ${documentId}: ${pages.length} pages, ${chunks.length} chunks`);
    } catch (err) {
      const permanent = err instanceof PermanentIngestionError;
      this.logger.error(`Document ${documentId} failed: ${(err as Error).message}`);

      if (permanent || isFinalAttempt) {
        await this.markFailed(
          documentId,
          permanent ? err.message : 'Processing failed after several attempts. Please try again later.',
        );
      }
      // UnrecoverableError tells BullMQ not to retry; anything else is retried with backoff.
      throw permanent ? new UnrecoverableError(err.message) : err;
    }
  }

  private async markFailed(documentId: string, message: string): Promise<void> {
    await this.db.query(
      `UPDATE documents SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [documentId, message],
    );
  }
}
