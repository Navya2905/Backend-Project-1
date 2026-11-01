export const DOCUMENTS_QUEUE = 'documents';
export const PROCESS_DOCUMENT_JOB = 'process-document';

export interface ProcessDocumentJob {
  documentId: string;
}
