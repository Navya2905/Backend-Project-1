import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DOCUMENTS_QUEUE, PROCESS_DOCUMENT_JOB, ProcessDocumentJob } from './ingestion.constants';

@Injectable()
export class IngestionQueue {
  constructor(@InjectQueue(DOCUMENTS_QUEUE) private readonly queue: Queue<ProcessDocumentJob>) {}

  async enqueue(documentId: string): Promise<void> {
    await this.queue.add(
      PROCESS_DOCUMENT_JOB,
      { documentId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 }, // 5s, then 10s
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }
}
