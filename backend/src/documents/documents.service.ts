import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DatabaseService } from '../database/database.service';
import { IngestionQueue } from '../ingestion/ingestion.queue';
import { looksLikePdf } from '../ingestion/pdf-text';
import { StorageService } from '../storage/storage.service';
import type { WorkspaceAccess } from '../workspaces/workspace-access.guard';

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface DocumentView {
  id: string;
  filename: string;
  sizeBytes: number;
  status: DocumentStatus;
  error: string | null;
  pageCount: number | null;
  chunkCount: number | null;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Selected with aliases so rows come back already in the API's camelCase shape.
const DOCUMENT_COLUMNS = `
  id, filename, size_bytes AS "sizeBytes", status, error,
  page_count AS "pageCount", chunk_count AS "chunkCount",
  uploaded_by AS "uploadedBy", created_at AS "createdAt", updated_at AS "updatedAt"`;

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: IngestionQueue,
  ) {}

  async upload(workspaceId: string, userId: string, file: UploadedFile | undefined): Promise<DocumentView> {
    if (!file || file.size === 0) {
      throw new BadRequestException('Attach a PDF in the "file" field');
    }
    if (!looksLikePdf(file.buffer)) {
      throw new BadRequestException('Only PDF files are supported');
    }

    const id = randomUUID();
    const storageKey = `${workspaceId}/${id}.pdf`;
    await this.storage.save(storageKey, file.buffer);

    const [doc] = await this.db.query<DocumentView>(
      `INSERT INTO documents (id, workspace_id, uploaded_by, filename, storage_key, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${DOCUMENT_COLUMNS}`,
      [id, workspaceId, userId, safeFilename(file.originalname), storageKey, file.size],
    );

    await this.enqueueOrFail(id);
    return doc;
  }

  list(workspaceId: string): Promise<DocumentView[]> {
    return this.db.query<DocumentView>(
      `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId],
    );
  }

  async get(workspaceId: string, documentId: string): Promise<DocumentView> {
    const [doc] = await this.db.query<DocumentView>(
      `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = $1 AND workspace_id = $2`,
      [documentId, workspaceId],
    );
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  // Owners can delete anything in the workspace; members only what they uploaded.
  async remove(access: WorkspaceAccess, userId: string, documentId: string): Promise<void> {
    const doc = await this.get(access.workspaceId, documentId);
    if (access.role !== 'owner' && doc.uploadedBy !== userId) {
      throw new ForbiddenException('Only the uploader or a workspace owner can delete this document');
    }

    const [deleted] = await this.db.query<{ storage_key: string }>(
      `DELETE FROM documents WHERE id = $1 AND workspace_id = $2 RETURNING storage_key`,
      [documentId, access.workspaceId],
    );
    // Chunks are removed by ON DELETE CASCADE; the file is removed after the row,
    // so a failure here leaves an orphaned file rather than a row pointing at nothing.
    if (deleted) await this.storage.delete(deleted.storage_key);
  }

  async retry(workspaceId: string, documentId: string): Promise<DocumentView> {
    const [doc] = await this.db.query<DocumentView>(
      `UPDATE documents SET status = 'pending', error = NULL, updated_at = now()
       WHERE id = $1 AND workspace_id = $2 AND status = 'failed'
       RETURNING ${DOCUMENT_COLUMNS}`,
      [documentId, workspaceId],
    );
    if (!doc) {
      await this.get(workspaceId, documentId); // 404 if it doesn't exist here
      throw new BadRequestException('Only failed documents can be retried');
    }
    await this.enqueueOrFail(documentId);
    return doc;
  }

  private async enqueueOrFail(documentId: string): Promise<void> {
    try {
      await this.queue.enqueue(documentId);
    } catch (err) {
      this.logger.error(`Could not queue document ${documentId}: ${(err as Error).message}`);
      await this.db.query(
        `UPDATE documents SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
        [documentId, 'Could not start processing. Use "retry" once the service is back.'],
      );
      throw new ServiceUnavailableException('Processing service is unavailable. Try again shortly.');
    }
  }
}

// Keep only a display name: no directories, no control characters, bounded length.
function safeFilename(original: string): string {
  const base = path.basename(original.replace(/\\/g, '/'));
  // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return cleaned || 'document.pdf';
}
