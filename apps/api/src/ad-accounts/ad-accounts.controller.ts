import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { AdAccountsService } from "./ad-accounts.service";
import { CreateAdAccountDto } from "./dto";

@ApiTags("Ad Accounts")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("ad-accounts")
export class AdAccountsController {
  constructor(private readonly adAccountsService: AdAccountsService) {}

  @Get()
  @RequirePermissions("ad_accounts.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.adAccountsService.list(user);
  }

  @Post("manual")
  @RequirePermissions("ad_accounts.manage")
  createManual(@Body() dto: CreateAdAccountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adAccountsService.createManual(dto, user);
  }

  @Post(":id/sync")
  @RequirePermissions("ad_accounts.manage")
  sync(@Param("id") id: string) {
    return this.adAccountsService.sync(id);
  }
}
