import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateWorkspaceRecordDto, UpdateWorkspaceRecordDto, WorkspaceRecordActionDto } from "./dto";
import { WorkspaceRecordsService } from "./workspace-records.service";

@ApiTags("Workspace records")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("campaigns.create")
@Controller("workspace-records")
export class WorkspaceRecordsController {
  constructor(private readonly service: WorkspaceRecordsService) {}

  @Get()
  list(@Query("module") module: string | undefined, @Query("q") query: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user, module, query);
  }

  @Post()
  create(@Body() dto: CreateWorkspaceRecordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateWorkspaceRecordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Post(":id/action")
  action(@Param("id") id: string, @Body() dto: WorkspaceRecordActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.action(id, dto.action, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }
}
