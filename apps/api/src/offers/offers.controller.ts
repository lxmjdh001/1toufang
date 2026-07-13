import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateOfferDto, UpdateOfferDto } from "./dto";
import { OffersService } from "./offers.service";

@ApiTags("Offers")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("offers")
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @RequirePermissions("campaigns.create")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.offersService.list(user);
  }

  @Post()
  @RequirePermissions("campaigns.create")
  create(@Body() dto: CreateOfferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.offersService.create(dto, user);
  }

  @Post(":id/duplicate")
  @RequirePermissions("campaigns.create")
  duplicate(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.offersService.duplicate(id, user);
  }

  @Patch(":id")
  @RequirePermissions("campaigns.create")
  update(@Param("id") id: string, @Body() dto: UpdateOfferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.offersService.update(id, dto, user);
  }

  @Delete(":id")
  @RequirePermissions("campaigns.create")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.offersService.remove(id, user);
  }
}
