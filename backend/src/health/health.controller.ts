import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.decorators';
import { DatabaseService } from '../database/database.service';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check() {
    try {
      const [row] = await this.db.query<{ now: Date; pgvector: string | null }>(
        `SELECT now() AS now,
                (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector`,
      );
      return { status: 'ok', database: 'connected', time: row.now, pgvector: row.pgvector };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
  }
}