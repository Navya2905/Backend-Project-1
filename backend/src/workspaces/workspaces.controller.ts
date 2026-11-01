import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.decorators';
import { CurrentUser } from '../auth/auth.decorators';
import type { WorkspaceAccess } from './workspace-access.guard';
import { CurrentWorkspace, RequireRole, WorkspaceAccessGuard } from './workspace-access.guard';
import { AddMemberDto, CreateWorkspaceDto } from './workspaces.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, dto.name);
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceAccessGuard)
  members(@CurrentWorkspace() workspace: WorkspaceAccess) {
    return this.workspaces.listMembers(workspace.workspaceId);
  }

  @Post(':workspaceId/members')
  @UseGuards(WorkspaceAccessGuard)
  @RequireRole('owner')
  addMember(@CurrentWorkspace() workspace: WorkspaceAccess, @Body() dto: AddMemberDto) {
    return this.workspaces.addMember(workspace.workspaceId, dto.email, dto.role ?? 'member');
  }
}
