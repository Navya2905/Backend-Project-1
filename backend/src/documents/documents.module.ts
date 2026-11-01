import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { IngestionModule } from '../ingestion/ingestion.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [
    WorkspacesModule,
    IngestionModule,
    // Files are kept in memory only long enough to validate and store them.
    // Anything over the limit is rejected with 413 before it reaches our code.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: { fileSize: Number(config.get('MAX_UPLOAD_MB') ?? 20) * 1024 * 1024, files: 1 },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
