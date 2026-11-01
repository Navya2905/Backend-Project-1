import { Module } from '@nestjs/common';
import { WorkspaceAccessGuard } from './workspace-access.guard';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceAccessGuard],
  exports: [WorkspaceAccessGuard],
})
export class WorkspacesModule {}
