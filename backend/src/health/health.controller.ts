import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check() {
    const [row] = await this.db.query<{ now: Date; pgvector: string | null }>(
      `SELECT now() AS now,
              (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector`,
    );
    return { status: 'ok', database: 'connected', time: row.now, pgvector: row.pgvector };
  }
}