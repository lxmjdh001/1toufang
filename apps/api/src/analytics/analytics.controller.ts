import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsQueryDto } from "./dto";

@ApiTags("Analytics")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  @RequirePermissions("reports.view")
  overview(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.overview(query, user);
  }

  @Get("visitors")
  @RequirePermissions("reports.view")
  visitors(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.visitors(query, user);
  }
}
