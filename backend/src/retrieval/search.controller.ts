import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { WorkspaceAccess } from '../workspaces/workspace-access.guard';
import { CurrentWorkspace, WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { RetrievalService } from './retrieval.service';

export class SearchDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  query: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

// Raw semantic search: the passages DocuMind would hand to the LLM. Useful for
// debugging retrieval separately from answer generation.
@Controller('workspaces/:workspaceId/search')
@UseGuards(WorkspaceAccessGuard)
export class SearchController {
  constructor(private readonly retrieval: RetrievalService) {}

  @Post()
  @HttpCode(200)
  search(@CurrentWorkspace() workspace: WorkspaceAccess, @Body() dto: SearchDto) {
    return this.retrieval.search(workspace.workspaceId, dto.query, dto.limit ?? 5);
  }
}
