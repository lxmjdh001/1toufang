import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TeamMemberStatus, TeamStatus, TeamType, UserStatus } from "@1toufang/database/client";
import { DatabaseService } from "../database/database.service";
import { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from "./dto";

function optionalDate(value?: string | null) {
  if (value === undefined) return undefined;
  if (!value) return null;
  return new Date(value);
}

@Injectable()
export class TeamsService {
  constructor(private readonly db: DatabaseService) {}

  list() {
    return this.db.team.findMany({
      include: {
        owner: { include: { profile: true } },
        members: {
          include: { user: { include: { profile: true } }, role: true },
          orderBy: { createdAt: "asc" }
        },
        employeeAccounts: { include: { user: { include: { profile: true } }, role: true } },
        _count: { select: { members: true, employeeAccounts: true, adAccounts: true, campaigns: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(dto: CreateTeamDto) {
    if (dto.ownerId) {
      await this.assertOwnerCanOwnTeam(dto.ownerId);
    }

    const team = await this.db.team.create({
      data: {
        name: dto.name,
        ownerId: dto.ownerId,
        type: dto.type ?? TeamType.TEAM,
        seatLimit: dto.seatLimit ?? 3,
        status: dto.status ?? TeamStatus.ACTIVE,
        expiresAt: optionalDate(dto.expiresAt),
        notes: dto.notes
      }
    });

    if (dto.ownerId) {
      await this.upsertOwnerMember(team.id, dto.ownerId);
    }

    return this.get(team.id);
  }

  async get(id: string) {
    const team = await this.db.team.findUnique({
      where: { id },
      include: {
        owner: { include: { profile: true } },
        members: {
          include: { user: { include: { profile: true } }, role: true, dataScopes: true },
          orderBy: { createdAt: "asc" }
        },
        employeeAccounts: { include: { user: { include: { profile: true } }, role: true, dataScopes: true } },
        _count: { select: { members: true, employeeAccounts: true, adAccounts: true, campaigns: true } }
      }
    });

    if (!team) throw new NotFoundException("Team not found");
    return team;
  }

  async update(id: string, dto: UpdateTeamDto) {
    const existing = await this.db.team.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Team not found");

    if (dto.ownerId && dto.ownerId !== existing.ownerId) {
      await this.assertOwnerCanOwnTeam(dto.ownerId, id);
    }

    const team = await this.db.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId || null } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.seatLimit !== undefined ? { seatLimit: dto.seatLimit } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: optionalDate(dto.expiresAt) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {})
      }
    });

    if (dto.ownerId) {
      await this.upsertOwnerMember(team.id, dto.ownerId);
    }

    return this.get(team.id);
  }

  async addMember(id: string, dto: AddTeamMemberDto) {
    const team = await this.db.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException("Team not found");
    this.assertTeamCanManageMembers(team);

    const existing = await this.db.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId: dto.userId } }
    });

    if (!existing || existing.status !== TeamMemberStatus.ACTIVE) {
      await this.assertTeamHasSeat(id, team.seatLimit);
    }

    const member = await this.db.teamMember.upsert({
      where: { teamId_userId: { teamId: id, userId: dto.userId } },
      create: {
        teamId: id,
        userId: dto.userId,
        roleId: dto.roleId,
        status: TeamMemberStatus.ACTIVE
      },
      update: {
        roleId: dto.roleId,
        status: TeamMemberStatus.ACTIVE
      }
    });

    return member;
  }

  async disableMember(teamId: string, memberId: string) {
    const member = await this.db.teamMember.findFirst({ where: { id: memberId, teamId } });
    if (!member) throw new NotFoundException("Team member not found");

    return this.db.teamMember.update({
      where: { id: memberId },
      data: { status: TeamMemberStatus.DISABLED }
    });
  }

  async enableMember(teamId: string, memberId: string) {
    const team = await this.db.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException("Team not found");
    this.assertTeamCanManageMembers(team);

    const member = await this.db.teamMember.findFirst({ where: { id: memberId, teamId } });
    if (!member) throw new NotFoundException("Team member not found");
    if (member.status !== TeamMemberStatus.ACTIVE) {
      await this.assertTeamHasSeat(teamId, team.seatLimit);
    }

    return this.db.teamMember.update({
      where: { id: memberId },
      data: { status: TeamMemberStatus.ACTIVE }
    });
  }

  private assertTeamCanManageMembers(team: { status: TeamStatus; expiresAt: Date | null }) {
    if (team.status !== TeamStatus.ACTIVE || (team.expiresAt && team.expiresAt <= new Date())) {
      throw new BadRequestException("团队未启用或已到期，不能调整成员");
    }
  }

  private async assertOwnerCanOwnTeam(ownerId: string, excludeTeamId?: string) {
    const owner = await this.db.user.findUnique({
      where: { id: ownerId },
      include: { _count: { select: { ownedTeams: true } } }
    });

    if (!owner) throw new NotFoundException("Owner user not found");
    if (owner.status !== UserStatus.ACTIVE) {
      throw new BadRequestException("负责人必须是已开通用户");
    }

    const ownedCount = await this.db.team.count({
      where: {
        ownerId,
        ...(excludeTeamId ? { id: { not: excludeTeamId } } : {})
      }
    });

    if (ownedCount >= owner.maxTeamCount) {
      throw new BadRequestException(`该用户最多可管理 ${owner.maxTeamCount} 个团队`);
    }
  }

  private async assertTeamHasSeat(teamId: string, seatLimit: number) {
    const activeMembers = await this.db.teamMember.count({
      where: { teamId, status: TeamMemberStatus.ACTIVE }
    });

    if (activeMembers >= seatLimit) {
      throw new BadRequestException(`该团队最多可开通 ${seatLimit} 个成员`);
    }
  }

  private async upsertOwnerMember(teamId: string, userId: string) {
    const role = await this.db.role.upsert({
      where: { teamId_name: { teamId, name: "Owner" } },
      create: {
        teamId,
        name: "Owner",
        description: "Team owner",
        isSystem: true
      },
      update: {}
    });

    await this.db.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: {
        teamId,
        userId,
        roleId: role.id,
        status: TeamMemberStatus.ACTIVE
      },
      update: {
        roleId: role.id,
        status: TeamMemberStatus.ACTIVE
      }
    });
  }
}
