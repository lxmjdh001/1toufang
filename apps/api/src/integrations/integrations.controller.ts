import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateIntegrationDto } from "./dto";
import { IntegrationsService } from "./integrations.service";

type OAuthCallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  error_reason?: string;
};

type RedirectResponse = {
  redirect(url: string): void;
};

@ApiTags("Integrations")
@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("ad_accounts.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.list(user);
  }

  @Get(":platform/oauth-url")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("ad_accounts.manage")
  oauthUrl(
    @Param("platform") platform: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("returnUrl") returnUrl?: string
  ) {
    return this.integrationsService.oauthUrl(platform, user, returnUrl);
  }

  @Get(":platform/callback")
  async callback(
    @Param("platform") platform: string,
    @Query() query: OAuthCallbackQuery,
    @Res() response: RedirectResponse
  ) {
    response.redirect(await this.integrationsService.callback(platform, query));
  }

  @Post("manual")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("ad_accounts.manage")
  createManual(@Body() dto: CreateIntegrationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.createManual(dto, user);
  }

  @Post(":id/refresh")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("ad_accounts.manage")
  refresh(@Param("id") id: string) {
    return this.integrationsService.refresh(id);
  }
}
