import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateStrategyDto, UpdateStrategyDto } from "./dto";

@Injectable()
export class StrategiesService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    return this.db.strategy.findMany({
      where: { teamId },
      include: { createdBy: { include: { profile: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(dto: CreateStrategyDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    const strategy = await this.db.strategy.create({
      data: {
        teamId,
        createdById: user.id,
        platform: dto.platform,
        name: dto.name,
        config: toJson(dto.config),
        notes: dto.notes
      }
    });

    await this.audit(user.id, teamId, "STRATEGY_CREATED", strategy.id, {
      platform: strategy.platform,
      name: strategy.name
    });

    return strategy;
  }

  async update(id: string, dto: UpdateStrategyDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensureStrategy(id, teamId);
    const strategy = await this.db.strategy.update({
      where: { id },
      data: {
        platform: dto.platform,
        name: dto.name,
        config: dto.config ? toJson(dto.config) : undefined,
        notes: dto.notes
      }
    });

    await this.audit(user.id, teamId, "STRATEGY_UPDATED", id, {
      platform: strategy.platform,
      name: strategy.name
    });

    return strategy;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const strategy = await this.ensureStrategy(id, teamId);
    await this.db.strategy.delete({ where: { id } });
    await this.audit(user.id, teamId, "STRATEGY_DELETED", id, {
      platform: strategy.platform,
      name: strategy.name
    });
    return { ok: true };
  }

  private async ensureStrategy(id: string, teamId: string) {
    const strategy = await this.db.strategy.findFirst({ where: { id, teamId } });
    if (!strategy) throw new NotFoundException("Strategy not found");
    return strategy;
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
        entityType: "strategy",
        entityId,
        metadata: toJson(metadata)
      }
    });
  }
}

function toJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}
