import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from "./dto";
import { TeamsService } from "./teams.service";

@ApiTags("Teams")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("users.manage")
@Controller("teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  list() {
    return this.teamsService.list();
  }

  @Post()
  create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.teamsService.get(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto);
  }

  @Post(":id/members")
  addMember(@Param("id") id: string, @Body() dto: AddTeamMemberDto) {
    return this.teamsService.addMember(id, dto);
  }

  @Post(":teamId/members/:memberId/enable")
  enableMember(@Param("teamId") teamId: string, @Param("memberId") memberId: string) {
    return this.teamsService.enableMember(teamId, memberId);
  }

  @Post(":teamId/members/:memberId/disable")
  disableMember(@Param("teamId") teamId: string, @Param("memberId") memberId: string) {
    return this.teamsService.disableMember(teamId, memberId);
  }
}
