import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateMediaAssetDto, UpdateMediaAssetDto } from "./dto";
import { MediaAssetsService } from "./media-assets.service";

@ApiTags("Media Assets")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("media.manage")
@Controller("media-assets")
export class MediaAssetsController {
  constructor(private readonly mediaAssetsService: MediaAssetsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.mediaAssetsService.list(user);
  }

  @Post()
  create(@Body() dto: CreateMediaAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaAssetsService.create(dto, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateMediaAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaAssetsService.update(id, dto, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaAssetsService.remove(id, user);
  }
}
