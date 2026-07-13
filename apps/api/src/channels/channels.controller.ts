import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { ChannelsService } from "./channels.service";
import { FacebookAccountActionDto } from "./dto";

@ApiTags("Channels")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("channels")
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get("facebook")
  @RequirePermissions("ad_accounts.view")
  facebook(
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: string,
    @Query("resource") resource?: string
  ) {
    return this.channelsService.facebook(user, status, resource);
  }

  @Post("facebook/accounts/:id/action")
  @RequirePermissions("ad_accounts.manage")
  facebookAccountAction(
    @Param("id") id: string,
    @Body() dto: FacebookAccountActionDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.channelsService.facebookAccountAction(id, dto, user);
  }

  @Get("tiktok")
  @RequirePermissions("ad_accounts.view")
  tiktok(@CurrentUser() user: AuthenticatedUser, @Query("resource") resource?: string) {
    return this.channelsService.tiktok(user, resource);
  }
}
