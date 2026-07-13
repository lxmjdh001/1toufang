import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateDomainDto, UpdateDomainDto } from "./dto";
import { DomainsService } from "./domains.service";

@ApiTags("Domains")
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("domains")
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Get()
  @RequirePermissions("campaigns.create")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.domainsService.list(user);
  }

  @Post()
  @RequirePermissions("campaigns.create")
  create(@Body() dto: CreateDomainDto, @CurrentUser() user: AuthenticatedUser) {
    return this.domainsService.create(dto, user);
  }

  @Post("buy")
  @RequirePermissions("campaigns.create")
  buy(@Body() dto: CreateDomainDto, @CurrentUser() user: AuthenticatedUser) {
    return this.domainsService.buy(dto, user);
  }

  @Patch(":id")
  @RequirePermissions("campaigns.create")
  update(@Param("id") id: string, @Body() dto: UpdateDomainDto, @CurrentUser() user: AuthenticatedUser) {
    return this.domainsService.update(id, dto, user);
  }

  @Delete(":id")
  @RequirePermissions("campaigns.create")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.domainsService.remove(id, user);
  }
}
