import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { RevealPlatformSecretDto, UpdatePlatformConfigDto } from "./dto";
import { PlatformConfigsService } from "./platform-configs.service";

@ApiTags("Platform Configs")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("system.config.manage")
@Controller("platform-configs")
export class PlatformConfigsController {
  constructor(private readonly platformConfigsService: PlatformConfigsService) {}

  @Get()
  list() {
    return this.platformConfigsService.list();
  }

  @Get(":platform")
  get(@Param("platform") platform: string) {
    return this.platformConfigsService.getSafe(platform);
  }

  @Put(":platform")
  update(
    @Param("platform") platform: string,
    @Body() dto: UpdatePlatformConfigDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.platformConfigsService.upsert(platform, dto, user);
  }

  @Post(":platform/reveal-secret")
  revealSecret(
    @Param("platform") platform: string,
    @Body() dto: RevealPlatformSecretDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.platformConfigsService.revealSecret(platform, dto, user);
  }
}
