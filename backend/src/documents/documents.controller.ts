import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/auth.decorators';
import { CurrentUser } from '../auth/auth.decorators';
import type { WorkspaceAccess } from '../workspaces/workspace-access.guard';
import { CurrentWorkspace, WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import type { UploadedFile as UploadedPdf } from './documents.service';
import { DocumentsService } from './documents.service';

const documentId = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@Controller('workspaces/:workspaceId/documents')
@UseGuards(WorkspaceAccessGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // 202 Accepted: the file is stored, but processing happens later in the background.
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentWorkspace() workspace: WorkspaceAccess,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedPdf | undefined,
  ) {
    return this.documents.upload(workspace.workspaceId, user.id, file);
  }

  @Get()
  list(@CurrentWorkspace() workspace: WorkspaceAccess) {
    return this.documents.list(workspace.workspaceId);
  }

  @Get(':documentId')
  get(@CurrentWorkspace() workspace: WorkspaceAccess, @Param('documentId', documentId) id: string) {
    return this.documents.get(workspace.workspaceId, id);
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentWorkspace() workspace: WorkspaceAccess,
    @CurrentUser() user: AuthUser,
    @Param('documentId', documentId) id: string,
  ) {
    return this.documents.remove(workspace, user.id, id);
  }

  @Post(':documentId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  retry(@CurrentWorkspace() workspace: WorkspaceAccess, @Param('documentId', documentId) id: string) {
    return this.documents.retry(workspace.workspaceId, id);
  }
}
