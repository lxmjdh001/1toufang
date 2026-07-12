import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateStrategyDto, UpdateStrategyDto } from "./dto";
import { StrategiesService } from "./strategies.service";

@ApiTags("Strategies")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("strategies.manage")
@Controller("strategies")
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.strategiesService.list(user);
  }

  @Post()
  create(@Body() dto: CreateStrategyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.strategiesService.create(dto, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateStrategyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.strategiesService.update(id, dto, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.strategiesService.remove(id, user);
  }
}
