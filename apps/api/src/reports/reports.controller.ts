import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DryRunReportSyncDto, GlobalSearchQueryDto, ReportOverviewQueryDto, ReportSyncDto } from "./reports.dto";
import { ReportsService } from "./reports.service";

@ApiTags("Reports")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("overview")
  @RequirePermissions("reports.view")
  overview(@Query() query: ReportOverviewQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.overview(query, user);
  }

  @Get("dashboard")
  @RequirePermissions("reports.view")
  dashboard(@Query() query: ReportOverviewQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.dashboard(query, user);
  }

  @Get("search")
  @RequirePermissions("reports.view")
  search(@Query() query: GlobalSearchQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.search(query, user);
  }

  @Get("notifications")
  @RequirePermissions("reports.view")
  notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.notifications(user);
  }

  @Post("sync/dry-run")
  @RequirePermissions("reports.view")
  dryRunSync(@Body() dto: DryRunReportSyncDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.dryRunSync(dto, user);
  }

  @Post("sync")
  @RequirePermissions("reports.view")
  sync(@Body() dto: ReportSyncDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.sync(dto, user);
  }
}
