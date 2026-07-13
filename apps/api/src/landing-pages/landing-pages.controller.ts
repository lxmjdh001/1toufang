import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateLandingPageDto, UpdateLandingPageDto } from "./dto";
import { LandingPagesService } from "./landing-pages.service";

@ApiTags("Landing Pages")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("landing-pages")
export class LandingPagesController {
  constructor(private readonly landingPagesService: LandingPagesService) {}

  @Get()
  @RequirePermissions("campaigns.create")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.landingPagesService.list(user);
  }

  @Post()
  @RequirePermissions("campaigns.create")
  create(@Body() dto: CreateLandingPageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.landingPagesService.create(dto, user);
  }

  @Patch(":id")
  @RequirePermissions("campaigns.create")
  update(@Param("id") id: string, @Body() dto: UpdateLandingPageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.landingPagesService.update(id, dto, user);
  }

  @Delete(":id")
  @RequirePermissions("campaigns.create")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.landingPagesService.remove(id, user);
  }
}
