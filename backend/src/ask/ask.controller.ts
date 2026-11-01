import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import type { WorkspaceAccess } from '../workspaces/workspace-access.guard';
import { CurrentWorkspace, WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { AskService } from './ask.service';

export class AskDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  question: string;
}

@Controller('workspaces/:workspaceId/ask')
@UseGuards(WorkspaceAccessGuard)
export class AskController {
  constructor(private readonly askService: AskService) {}

  // Each question can cost an LLM call, so it gets a tighter limit than the default.
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  ask(@CurrentWorkspace() workspace: WorkspaceAccess, @Body() dto: AskDto) {
    return this.askService.ask(workspace.workspaceId, dto.question);
  }
}
