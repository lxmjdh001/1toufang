import { Injectable, NotFoundException } from "@nestjs/common";
import {
  EmployeeStatus,
  ReviewStatus,
  TeamMemberStatus,
  UserStatus
} from "@1toufang/database/client";
import { DatabaseService } from "../database/database.service";
import { ApproveUserDto, AssignRoleDto, RejectUserDto, SetUserStatusDto } from "./dto";

type UserStatusInput = keyof typeof UserStatus;

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  list() {
    return this.db.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        profile: true,
        employeeAccounts: true,
        teamMemberships: { include: { team: true, role: true } }
      }
    });
  }

  pending() {
    return this.db.user.findMany({
      where: { status: UserStatus.PENDING_REVIEW },
      orderBy: { createdAt: "asc" },
      include: { profile: true, reviewRequests: true }
    });
  }

  async get(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      include: {
        profile: true,
        reviewRequests: true,
        employeeAccounts: { include: { team: true, role: true } },
        teamMemberships: { include: { team: true, role: true, dataScopes: true } }
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

      const team =
        dto.teamId != null
          ? await tx.team.findUniqueOrThrow({ where: { id: dto.teamId } })
          : await tx.team.create({
              data: {
                name: dto.teamName ?? user.profile?.companyName ?? `${user.email} Team`,
                ownerId: user.id
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
          metadata: { employeeNo: dto.employeeNo, roleId: role?.id }
        }
      });

      return id;
    });

    return this.get(id);
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
