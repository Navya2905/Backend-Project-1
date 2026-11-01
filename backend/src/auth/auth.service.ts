import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService, isUniqueViolation } from '../database/database.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { PasswordService } from './password.service';

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

const toPublicUser = (row: Pick<UserRow, 'id' | 'email' | 'name'>): PublicUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
});

@Injectable()
export class AuthService {
  // Compared against when the email doesn't exist, so a login attempt takes the
  // same time whether or not the account is real (prevents email enumeration by timing).
  private dummyHash?: Promise<string>;

  constructor(
    private readonly db: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await this.passwords.hash(dto.password);

    try {
      const { user, workspace } = await this.db.transaction(async (query) => {
        const [user] = await query<UserRow>(
          `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
           RETURNING id, email, name`,
          [dto.email, passwordHash, dto.name],
        );
        const [workspace] = await query<{ id: string; name: string }>(
          `INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name`,
          [dto.workspaceName ?? `${dto.name}'s workspace`],
        );
        await query(
          `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [workspace.id, user.id],
        );
        return { user, workspace };
      });

      return {
        accessToken: await this.signToken(user.id, user.email),
        user: toPublicUser(user),
        workspace: { ...workspace, role: 'owner' as const },
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }
  }

  async login(dto: LoginDto) {
    const [user] = await this.db.query<UserRow>(
      `SELECT id, email, name, password_hash FROM users WHERE lower(email) = lower($1)`,
      [dto.email],
    );

    this.dummyHash ??= this.passwords.hash('not-a-real-password');
    const valid = await this.passwords.verify(dto.password, user?.password_hash ?? (await this.dummyHash));
    if (!user || !valid) {
      // Same message for "no such user" and "wrong password".
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      accessToken: await this.signToken(user.id, user.email),
      user: toPublicUser(user),
    };
  }

  async me(userId: string) {
    const [user] = await this.db.query<UserRow>(`SELECT id, email, name FROM users WHERE id = $1`, [userId]);
    if (!user) throw new NotFoundException('User no longer exists');

    const workspaces = await this.db.query<{ id: string; name: string; role: string }>(
      `SELECT w.id, w.name, m.role
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
       ORDER BY w.created_at`,
      [userId],
    );
    return { user: toPublicUser(user), workspaces };
  }

  private signToken(userId: string, email: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, email });
  }
}
