import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { CreateRoleDto, SetRolePermissionsDto } from "./permissions.dto";
import { PermissionsService } from "./permissions.service";

@ApiTags("Permissions")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("roles.manage")
@Controller("permissions")
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  list() {
    return this.permissionsService.list();
  }

  @Get("roles")
  roles(@Query("teamId") teamId?: string) {
    return this.permissionsService.roles(teamId);
  }

  @Post("roles")
  createRole(@Body() dto: CreateRoleDto) {
    return this.permissionsService.createRole(dto);
  }

  @Patch("roles/:id/permissions")
  setRolePermissions(@Param("id") id: string, @Body() dto: SetRolePermissionsDto) {
    return this.permissionsService.setRolePermissions(id, dto);
  }
}
