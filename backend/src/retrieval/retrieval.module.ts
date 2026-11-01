import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RetrievalService } from './retrieval.service';
import { SearchController } from './search.controller';

@Module({
  imports: [WorkspacesModule],
  controllers: [SearchController],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
