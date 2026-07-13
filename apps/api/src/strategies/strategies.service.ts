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
    const strategies = await this.db.strategy.findMany({
      where: { teamId },
      include: { createdBy: { include: { profile: true } } },
      orderBy: { updatedAt: "desc" }
    });
    const strategyIds = strategies.map((strategy) => strategy.id);
    const campaigns = strategyIds.length
      ? await this.db.campaign.findMany({
          where: { teamId },
          select: { config: true }
        })
      : [];
    const usageCountByStrategy = new Map<string, number>();
    for (const campaign of campaigns) {
      const strategyId = stringValue(asRecord(campaign.config).strategyId);
      if (!strategyId) continue;
      usageCountByStrategy.set(strategyId, (usageCountByStrategy.get(strategyId) ?? 0) + 1);
    }

    return strategies.map((strategy) => ({
      ...strategy,
      version: versionOf(strategy.config),
      usageCount: usageCountByStrategy.get(strategy.id) ?? 0
    }));
  }

  async create(dto: CreateStrategyDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    const strategy = await this.db.strategy.create({
      data: {
        teamId,
        createdById: user.id,
        platform: dto.platform,
        name: dto.name,
        config: toJson(withInitialVersion(dto.config)),
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
    const existing = await this.ensureStrategy(id, teamId);
    const nextConfig = dto.config ? nextVersionConfig(existing.config, dto.config) : undefined;
    const strategy = await this.db.strategy.update({
      where: { id },
      data: {
        platform: dto.platform,
        name: dto.name,
        config: nextConfig ? toJson(nextConfig) : undefined,
        notes: dto.notes
      }
    });

    await this.audit(user.id, teamId, "STRATEGY_UPDATED", id, {
      platform: strategy.platform,
      name: strategy.name
    });

    return strategy;
  }

  async duplicate(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const source = await this.ensureStrategy(id, teamId);
    const strategy = await this.db.strategy.create({
      data: {
        teamId,
        createdById: user.id,
        platform: source.platform,
        name: `${source.name} 副本`,
        config: toJson({
          ...asRecord(source.config),
          version: 1,
          duplicatedFrom: source.id
        }),
        notes: source.notes
      }
    });

    await this.audit(user.id, teamId, "STRATEGY_DUPLICATED", strategy.id, {
      sourceId: source.id,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function versionOf(config: unknown) {
  const parsed = Number(asRecord(config).version ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 1;
}

function withInitialVersion(config: Record<string, unknown>) {
  return { ...config, version: versionOf(config) };
}

function nextVersionConfig(existing: unknown, next: Record<string, unknown>) {
  const existingRecord = asRecord(existing);
  const version = versionOf(existingRecord) + 1;
  const history = Array.isArray(existingRecord.versionHistory) ? existingRecord.versionHistory : [];
  return {
    ...next,
    version,
    versionHistory: [
      ...history.slice(-4),
      {
        version: version - 1,
        snapshot: existingRecord,
        archivedAt: new Date().toISOString()
      }
    ]
  };
}
