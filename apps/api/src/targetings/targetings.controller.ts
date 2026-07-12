import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateTargetingDto, UpdateTargetingDto } from "./dto";
import { TargetingsService } from "./targetings.service";

@ApiTags("Targetings")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("targeting.manage")
@Controller("targetings")
export class TargetingsController {
  constructor(private readonly targetingsService: TargetingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.targetingsService.list(user);
  }

  @Post()
  create(@Body() dto: CreateTargetingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.targetingsService.create(dto, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTargetingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.targetingsService.update(id, dto, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.targetingsService.remove(id, user);
  }
}
