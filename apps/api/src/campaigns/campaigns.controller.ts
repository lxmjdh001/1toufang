import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CampaignsService } from "./campaigns.service";
import { BulkCampaignActionDto, CreateCampaignDto, UpdateCampaignBudgetDto, UpdateCampaignDto } from "./dto";

@ApiTags("Campaigns")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("campaigns")
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @RequirePermissions("campaigns.create")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.list(user);
  }

  @Post()
  @RequirePermissions("campaigns.create")
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.create(dto, user);
  }

  @Post("bulk")
  @RequirePermissions("campaigns.status.update")
  bulk(@Body() dto: BulkCampaignActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.bulk(dto, user);
  }

  @Patch(":id/budget")
  @RequirePermissions("campaigns.budget.update")
  updateBudget(@Param("id") id: string, @Body() dto: UpdateCampaignBudgetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.updateBudget(id, dto, user);
  }

  @Patch(":id")
  @RequirePermissions("campaigns.status.update")
  update(@Param("id") id: string, @Body() dto: UpdateCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.update(id, dto, user);
  }

  @Post(":id/publish")
  @RequirePermissions("campaigns.publish")
  publish(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.publish(id, user);
  }

  @Post(":id/retry-publish")
  @RequirePermissions("campaigns.publish")
  retryPublish(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.retryPublish(id, user);
  }

  @Get(":id/preflight")
  @RequirePermissions("campaigns.publish")
  preflight(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.preflight(id, user);
  }

  @Get(":id/publish-tasks")
  @RequirePermissions("campaigns.publish")
  publishTasks(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.publishTasks(id, user);
  }

  @Delete(":id")
  @RequirePermissions("campaigns.delete")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.remove(id, user);
  }
}
