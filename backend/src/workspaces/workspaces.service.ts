import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, isUniqueViolation } from '../database/database.service';
import { WorkspaceRole } from './workspace-access.guard';

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export interface Member {
  userId: string;
  email: string;
  name: string;
  role: WorkspaceRole;
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly db: DatabaseService) {}

  listForUser(userId: string): Promise<WorkspaceSummary[]> {
    return this.db.query<WorkspaceSummary>(
      `SELECT w.id, w.name, m.role
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
       ORDER BY w.created_at`,
      [userId],
    );
  }

  create(userId: string, name: string): Promise<WorkspaceSummary> {
    return this.db.transaction(async (query) => {
      const [workspace] = await query<{ id: string; name: string }>(
        `INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name`,
        [name],
      );
      await query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [
        workspace.id,
        userId,
      ]);
      return { ...workspace, role: 'owner' as const };
    });
  }

  listMembers(workspaceId: string): Promise<Member[]> {
    return this.db.query<Member>(
      `SELECT u.id AS "userId", u.email, u.name, m.role
       FROM workspace_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1
       ORDER BY m.created_at`,
      [workspaceId],
    );
  }

  async addMember(workspaceId: string, email: string, role: WorkspaceRole): Promise<Member> {
    const [user] = await this.db.query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    if (!user) throw new NotFoundException('No account exists with this email');

    try {
      await this.db.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)`, [
        workspaceId,
        user.id,
        role,
      ]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('This person is already a member');
      throw err;
    }
    return { userId: user.id, email: user.email, name: user.name, role };
  }
}
