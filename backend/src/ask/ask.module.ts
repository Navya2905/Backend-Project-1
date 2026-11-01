import { Module } from '@nestjs/common';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({
  imports: [RetrievalModule, WorkspacesModule],
  controllers: [AskController],
  providers: [AskService],
})
export class AskModule {}
