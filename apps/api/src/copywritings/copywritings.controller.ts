import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CopywritingsService } from "./copywritings.service";
import { CreateCopywritingDto, GenerateCopywritingDto, UpdateCopywritingDto } from "./dto";

@ApiTags("Copywritings")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("copywriting.manage")
@Controller("copywritings")
export class CopywritingsController {
  constructor(private readonly copywritingsService: CopywritingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.copywritingsService.list(user);
  }

  @Post()
  create(@Body() dto: CreateCopywritingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.copywritingsService.create(dto, user);
  }

  @Post("generate")
  generate(@Body() dto: GenerateCopywritingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.copywritingsService.generate(dto, user);
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.copywritingsService.duplicate(id, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCopywritingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.copywritingsService.update(id, dto, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.copywritingsService.remove(id, user);
  }
}
