import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreatePwaAppDto, UpdatePwaAppDto } from "./dto";
import { PwaAppsService } from "./pwa-apps.service";

@ApiTags("PWA Apps")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("pwa-apps")
export class PwaAppsController {
  constructor(private readonly pwaAppsService: PwaAppsService) {}

  @Get()
  @RequirePermissions("campaigns.create")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.pwaAppsService.list(user);
  }

  @Post()
  @RequirePermissions("campaigns.create")
  create(@Body() dto: CreatePwaAppDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pwaAppsService.create(dto, user);
  }

  @Post(":id/duplicate")
  @RequirePermissions("campaigns.create")
  duplicate(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pwaAppsService.duplicate(id, user);
  }

  @Patch(":id")
  @RequirePermissions("campaigns.create")
  update(@Param("id") id: string, @Body() dto: UpdatePwaAppDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pwaAppsService.update(id, dto, user);
  }

  @Delete(":id")
  @RequirePermissions("campaigns.create")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pwaAppsService.remove(id, user);
  }
}
