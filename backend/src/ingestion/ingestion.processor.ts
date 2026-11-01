import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DOCUMENTS_QUEUE, ProcessDocumentJob } from './ingestion.constants';
import { IngestionService } from './ingestion.service';

// The background worker: BullMQ hands it jobs from Redis one at a time (per worker).
// It runs inside the API process for simplicity; it could move to its own process
// without code changes, since jobs only carry a document ID.
@Processor(DOCUMENTS_QUEUE, { concurrency: 2 })
export class IngestionProcessor extends WorkerHost {
  constructor(private readonly ingestion: IngestionService) {
    super();
  }

  async process(job: Job<ProcessDocumentJob>): Promise<void> {
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await this.ingestion.process(job.data.documentId, isFinalAttempt);
  }
}
