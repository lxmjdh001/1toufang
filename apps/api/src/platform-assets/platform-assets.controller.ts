import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { PlatformAssetsService } from "./platform-assets.service";

@ApiTags("Platform Assets")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("platform-assets")
export class PlatformAssetsController {
  constructor(private readonly platformAssetsService: PlatformAssetsService) {}

  @Get()
  @RequirePermissions("ad_accounts.view")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("platform") platform?: string,
    @Query("type") type?: string
  ) {
    return this.platformAssetsService.list(user, platform, type);
  }

  @Post("sync")
  @RequirePermissions("ad_accounts.manage")
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.platformAssetsService.sync(user);
  }
}
