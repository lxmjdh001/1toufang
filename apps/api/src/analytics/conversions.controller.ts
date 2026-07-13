import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsQueryDto } from "./dto";

@ApiTags("Conversions")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("conversions")
export class ConversionsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @RequirePermissions("reports.view")
  list(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.conversions(query, user);
  }
}
