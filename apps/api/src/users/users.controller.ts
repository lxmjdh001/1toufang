import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { ApproveUserDto, AssignRoleDto, RejectUserDto, SetUserStatusDto, UpdateUserAccessDto } from "./dto";
import { UsersService } from "./users.service";

@ApiTags("User Management")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("admin/users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions("users.manage")
  list() {
    return this.usersService.list();
  }

  @Get("pending")
  @RequirePermissions("users.review")
  pending() {
    return this.usersService.pending();
  }

  @Get(":id")
  @RequirePermissions("users.manage")
  get(@Param("id") id: string) {
    return this.usersService.get(id);
  }

  @Post(":id/approve")
  @RequirePermissions("users.review")
  approve(@Param("id") id: string, @Body() dto: ApproveUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.approve(id, { ...dto, actorId: user.id });
  }

  @Post(":id/reject")
  @RequirePermissions("users.review")
  reject(@Param("id") id: string, @Body() dto: RejectUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.reject(id, { ...dto, actorId: user.id });
  }

  @Post(":id/suspend")
  @RequirePermissions("users.manage")
  suspend(@Param("id") id: string, @Body() dto: SetUserStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.setStatus(id, "SUSPENDED", { ...dto, actorId: user.id });
  }

  @Post(":id/enable")
  @RequirePermissions("users.manage")
  enable(@Param("id") id: string, @Body() dto: SetUserStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.setStatus(id, "ACTIVE", { ...dto, actorId: user.id });
  }

  @Post(":id/disable")
  @RequirePermissions("users.manage")
  disable(@Param("id") id: string, @Body() dto: SetUserStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.setStatus(id, "DISABLED", { ...dto, actorId: user.id });
  }

  @Patch(":id/access")
  @RequirePermissions("users.manage")
  updateAccess(@Param("id") id: string, @Body() dto: UpdateUserAccessDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.updateAccess(id, { ...dto, actorId: user.id });
  }

  @Post(":id/unlock")
  @RequirePermissions("users.manage")
  unlock(@Param("id") id: string, @Body() dto: SetUserStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.unlock(id, { ...dto, actorId: user.id });
  }

  @Patch(":id/role")
  @RequirePermissions("roles.manage")
  assignRole(@Param("id") id: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(id, dto);
  }

  @Get(":id/login-logs")
  @RequirePermissions("users.manage")
  loginLogs(@Param("id") id: string) {
    return this.usersService.loginLogs(id);
  }

  @Get(":id/audit-logs")
  @RequirePermissions("audit_logs.view")
  auditLogs(@Param("id") id: string) {
    return this.usersService.auditLogs(id);
  }
}
