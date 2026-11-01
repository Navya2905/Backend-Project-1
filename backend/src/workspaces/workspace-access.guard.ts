import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../auth/auth.decorators';
import { DatabaseService } from '../database/database.service';

export type WorkspaceRole = 'owner' | 'member';

export interface WorkspaceAccess {
  workspaceId: string;
  role: WorkspaceRole;
}

type WorkspaceRequest = AuthenticatedRequest & { workspace: WorkspaceAccess };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUIRED_ROLE_KEY = 'requiredWorkspaceRole';
export const RequireRole = (role: WorkspaceRole) => SetMetadata(REQUIRED_ROLE_KEY, role);

// Gives a controller method the workspace the guard verified.
export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceAccess => ctx.switchToHttp().getRequest<WorkspaceRequest>().workspace,
);

// Tenant isolation, layer 1: any route with :workspaceId only runs if the logged-in
// user is a member of that workspace. Non-members get 404, not 403, so the API
// doesn't reveal which workspace IDs exist.
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const workspaceId = request.params.workspaceId;
    if (typeof workspaceId !== 'string' || !UUID.test(workspaceId)) {
      throw new NotFoundException('Workspace not found');
    }

    const [membership] = await this.db.query<{ role: WorkspaceRole }>(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, request.user.id],
    );
    if (!membership) throw new NotFoundException('Workspace not found');

    const required = this.reflector.get<WorkspaceRole | undefined>(REQUIRED_ROLE_KEY, context.getHandler());
    if (required === 'owner' && membership.role !== 'owner') {
      throw new ForbiddenException('Only workspace owners can do this');
    }

    request.workspace = { workspaceId, role: membership.role };
    return true;
  }
}
