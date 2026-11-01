import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DOCUMENTS_QUEUE } from './ingestion.constants';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionQueue } from './ingestion.queue';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENTS_QUEUE })],
  providers: [IngestionService, IngestionProcessor, IngestionQueue],
  exports: [IngestionQueue],
})
export class IngestionModule {}
