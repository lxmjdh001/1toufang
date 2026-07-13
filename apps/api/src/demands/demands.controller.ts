import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateDemandDto, UpdateDemandDto } from "./dto";
import { DemandsService } from "./demands.service";

@ApiTags("Demands")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("demands")
export class DemandsController {
  constructor(private readonly demandsService: DemandsService) {}

  @Get()
  @RequirePermissions("campaigns.create")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.demandsService.list(user);
  }

  @Post()
  @RequirePermissions("campaigns.create")
  create(@Body() dto: CreateDemandDto, @CurrentUser() user: AuthenticatedUser) {
    return this.demandsService.create(dto, user);
  }

  @Post(":id/duplicate")
  @RequirePermissions("campaigns.create")
  duplicate(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.demandsService.duplicate(id, user);
  }

  @Patch(":id")
  @RequirePermissions("campaigns.create")
  update(@Param("id") id: string, @Body() dto: UpdateDemandDto, @CurrentUser() user: AuthenticatedUser) {
    return this.demandsService.update(id, dto, user);
  }

  @Delete(":id")
  @RequirePermissions("campaigns.create")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.demandsService.remove(id, user);
  }
}
