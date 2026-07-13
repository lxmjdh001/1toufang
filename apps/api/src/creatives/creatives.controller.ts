import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreativesService } from "./creatives.service";
import { BulkCreativeTagsDto, CreateCreativeDto, UpdateCreativeDto } from "./dto";

@ApiTags("Creatives")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("media.manage", "copywriting.manage")
@Controller("creatives")
export class CreativesController {
  constructor(private readonly creativesService: CreativesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.creativesService.list(user);
  }

  @Post()
  create(@Body() dto: CreateCreativeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.creativesService.create(dto, user);
  }

  @Post("bulk-tags")
  bulkTags(@Body() dto: BulkCreativeTagsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.creativesService.bulkTags(dto, user);
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.creativesService.duplicate(id, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCreativeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.creativesService.update(id, dto, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.creativesService.remove(id, user);
  }
}
