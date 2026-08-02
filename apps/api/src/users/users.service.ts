import { Injectable, NotFoundException } from "@nestjs/common";
import {
  EmployeeStatus,
  ReviewStatus,
  TeamStatus,
  TeamMemberStatus,
  TeamType,
  UserStatus
} from "@1toufang/database/client";
import { DatabaseService } from "../database/database.service";
import { ApproveUserDto, AssignRoleDto, RejectUserDto, SetUserStatusDto, UpdateUserAccessDto } from "./dto";

type UserStatusInput = keyof typeof UserStatus;

function optionalDate(value?: string | null) {
  if (value === undefined) return undefined;
  if (!value) return null;
  return new Date(value);
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  list() {
    return this.db.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        profile: true,
        employeeAccounts: true,
        teamMemberships: { include: { team: true, role: true } },
        ownedTeams: true,
        _count: { select: { employeeAccounts: true, teamMemberships: true, ownedTeams: true } }
      }
    });
  }

  pending() {
    return this.db.user.findMany({
      where: { status: UserStatus.PENDING_REVIEW },
      orderBy: { createdAt: "asc" },
      include: { profile: true, reviewRequests: true, ownedTeams: true }
    });
  }

  async get(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      include: {
        profile: true,
        reviewRequests: true,
        employeeAccounts: { include: { team: true, role: true } },
        teamMemberships: { include: { team: true, role: true, dataScopes: true } },
        ownedTeams: true,
        _count: { select: { employeeAccounts: true, teamMemberships: true, ownedTeams: true } }
      }
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async approve(id: string, dto: ApproveUserDto) {
    await this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        include: { profile: true }
      });
      if (!user) throw new NotFoundException("User not found");

      const maxTeamCount = dto.maxTeamCount ?? 1;
      const teamType = dto.teamType ?? (maxTeamCount > 1 ? TeamType.TEAM : TeamType.PERSONAL);
      const seatLimit = dto.seatLimit ?? maxTeamCount;
      const teamExpiresAt = optionalDate(dto.teamExpiresAt ?? dto.accessExpiresAt);
      const teamNotes = dto.teamNotes ?? dto.reviewNotes;
      const team =
        dto.teamId != null
          ? await tx.team.update({
              where: { id: dto.teamId },
              data: {
                ...(dto.teamName ? { name: dto.teamName } : {}),
                ownerId: user.id,
                type: teamType,
                seatLimit,
                status: TeamStatus.ACTIVE,
                expiresAt: teamExpiresAt,
                ...(teamNotes ? { notes: teamNotes } : {})
              }
            })
          : await tx.team.create({
              data: {
                name: dto.teamName ?? user.profile?.companyName ?? `${user.email} Team`,
                ownerId: user.id,
                type: teamType,
                seatLimit,
                status: TeamStatus.ACTIVE,
                expiresAt: teamExpiresAt,
                notes: teamNotes
              }
            });

      const role =
        dto.roleId != null
          ? await tx.role.findUnique({ where: { id: dto.roleId } })
          : await tx.role.upsert({
              where: { teamId_name: { teamId: team.id, name: "Owner" } },
              create: {
                teamId: team.id,
                name: "Owner",
                description: "Team owner",
                isSystem: true
              },
              update: {}
            });

      await tx.user.update({
        where: { id },
        data: {
          status: UserStatus.ACTIVE,
          accessExpiresAt: optionalDate(dto.accessExpiresAt),
          maxTeamCount,
          failedLoginAttempts: 0,
          lockedUntil: null
        }
      });

      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId: id } },
        create: {
          teamId: team.id,
          userId: id,
          roleId: role?.id,
          status: TeamMemberStatus.ACTIVE
        },
        update: {
          roleId: role?.id,
          status: TeamMemberStatus.ACTIVE
        }
      });

      if (dto.employeeNo) {
        await tx.employeeAccount.upsert({
          where: { employeeNo: dto.employeeNo },
          create: {
            employeeNo: dto.employeeNo,
            userId: id,
            teamId: team.id,
            roleId: role?.id,
            status: EmployeeStatus.ACTIVE
          },
          update: {
            userId: id,
            teamId: team.id,
            roleId: role?.id,
            status: EmployeeStatus.ACTIVE
          }
        });
      }

      await tx.userReviewRequest.updateMany({
        where: { userId: id, status: ReviewStatus.PENDING },
        data: {
          status: ReviewStatus.APPROVED,
          reviewNotes: dto.reviewNotes,
          reviewedById: dto.actorId,
          reviewedAt: new Date()
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: dto.actorId,
          teamId: team.id,
          action: "USER_APPROVED",
          entityType: "user",
          entityId: id,
          metadata: {
            employeeNo: dto.employeeNo,
            roleId: role?.id,
            accessExpiresAt: dto.accessExpiresAt,
            maxTeamCount,
            teamType,
            seatLimit,
            teamExpiresAt: dto.teamExpiresAt
          }
        }
      });

      return id;
    });

    return this.get(id);
  }

  async updateAccess(id: string, dto: UpdateUserAccessDto) {
    const updated = await this.db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.accessExpiresAt !== undefined ? { accessExpiresAt: optionalDate(dto.accessExpiresAt) } : {}),
          ...(dto.maxTeamCount !== undefined ? { maxTeamCount: dto.maxTeamCount } : {})
        }
      });

      await tx.team.updateMany({
        where: { ownerId: id },
        data: {
          ...(dto.accessExpiresAt !== undefined ? { expiresAt: optionalDate(dto.accessExpiresAt) } : {}),
          ...(dto.maxTeamCount !== undefined ? { seatLimit: dto.maxTeamCount } : {})
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: dto.actorId,
          action: "USER_ACCESS_UPDATED",
          entityType: "user",
          entityId: id,
          metadata: {
            accessExpiresAt: dto.accessExpiresAt,
            maxTeamCount: dto.maxTeamCount,
            reason: dto.reason
          }
        }
      });

      return user;
    });

    return updated;
  }

  async reject(id: string, dto: RejectUserDto) {
    await this.db.$transaction([
      this.db.user.update({
        where: { id },
        data: { status: UserStatus.REJECTED }
      }),
      this.db.userReviewRequest.updateMany({
        where: { userId: id, status: ReviewStatus.PENDING },
        data: {
          status: ReviewStatus.REJECTED,
          reviewNotes: dto.reviewNotes,
          reviewedById: dto.actorId,
          reviewedAt: new Date()
        }
      }),
      this.db.auditLog.create({
        data: {
          actorId: dto.actorId,
          action: "USER_REJECTED",
          entityType: "user",
          entityId: id,
          metadata: { reason: dto.reviewNotes }
        }
      })
    ]);

    return this.get(id);
  }

  async setStatus(id: string, status: UserStatusInput, dto: SetUserStatusDto) {
    const updated = await this.db.user.update({
      where: { id },
      data: { status: UserStatus[status] }
    });

    await this.db.auditLog.create({
      data: {
        actorId: dto.actorId,
        action: `USER_${status}`,
        entityType: "user",
        entityId: id,
        metadata: { reason: dto.reason }
      }
    });

    return updated;
  }

  async unlock(id: string, dto: SetUserStatusDto) {
    const updated = await this.db.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    await this.db.auditLog.create({
      data: {
        actorId: dto.actorId,
        action: "USER_UNLOCKED",
        entityType: "user",
        entityId: id,
        metadata: { reason: dto.reason }
      }
    });

    return updated;
  }

  async assignRole(id: string, dto: AssignRoleDto) {
    return this.db.teamMember.upsert({
      where: { teamId_userId: { teamId: dto.teamId, userId: id } },
      create: {
        teamId: dto.teamId,
        userId: id,
        roleId: dto.roleId,
        status: TeamMemberStatus.ACTIVE
      },
      update: { roleId: dto.roleId }
    });
  }

  loginLogs(id: string) {
    return this.db.loginLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  auditLogs(id: string) {
    return this.db.auditLog.findMany({
      where: { actorId: id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }
}
