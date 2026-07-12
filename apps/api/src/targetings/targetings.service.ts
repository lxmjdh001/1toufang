import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateTargetingDto, UpdateTargetingDto } from "./dto";

@Injectable()
export class TargetingsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    return this.db.targeting.findMany({
      where: { teamId },
      include: { createdBy: { include: { profile: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(dto: CreateTargetingDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    const targeting = await this.db.targeting.create({
      data: {
        teamId,
        createdById: user.id,
        platform: dto.platform,
        name: dto.name,
        config: toJson(dto.config),
        tags: dto.tags ?? []
      }
    });

    await this.audit(user.id, teamId, "TARGETING_CREATED", targeting.id, {
      platform: targeting.platform,
      name: targeting.name
    });

    return targeting;
  }

  async update(id: string, dto: UpdateTargetingDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensureTargeting(id, teamId);
    const targeting = await this.db.targeting.update({
      where: { id },
      data: {
        platform: dto.platform,
        name: dto.name,
        config: dto.config ? toJson(dto.config) : undefined,
        tags: dto.tags
      }
    });

    await this.audit(user.id, teamId, "TARGETING_UPDATED", id, {
      platform: targeting.platform,
      name: targeting.name
    });

    return targeting;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const targeting = await this.ensureTargeting(id, teamId);
    await this.db.targeting.delete({ where: { id } });
    await this.audit(user.id, teamId, "TARGETING_DELETED", id, {
      platform: targeting.platform,
      name: targeting.name
    });
    return { ok: true };
  }

  private async ensureTargeting(id: string, teamId: string) {
    const targeting = await this.db.targeting.findFirst({ where: { id, teamId } });
    if (!targeting) throw new NotFoundException("Targeting not found");
    return targeting;
  }

  private async resolveTeamId(user: AuthenticatedUser) {
    if (user.teamId) return user.teamId;

    const membership = await this.db.teamMember.findFirst({
      where: { userId: user.id, status: TeamMemberStatus.ACTIVE },
      orderBy: { createdAt: "asc" }
    });
    if (!membership) {
      throw new BadRequestException("User does not belong to a team");
    }
    return membership.teamId;
  }

  private audit(actorId: string, teamId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    return this.db.auditLog.create({
      data: {
        actorId,
        teamId,
        action,
        entityType: "targeting",
        entityId,
        metadata: toJson(metadata)
      }
    });
  }
}

function toJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}
