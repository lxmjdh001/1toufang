import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateTargetingDto, UpdateTargetingDto } from "./dto";

type TargetingMetric = {
  campaigns: number;
  spend: number;
  impressions: number;
  clicks: number;
  event1: number;
  event2: number;
  event3: number;
  conversions: number;
  revenue: number;
};

@Injectable()
export class TargetingsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const targetings = await this.db.targeting.findMany({
      where: { teamId },
      include: { createdBy: { include: { profile: true } } },
      orderBy: { updatedAt: "desc" }
    });
    const targetingIds = targetings.map((targeting) => targeting.id);
    const campaigns = targetingIds.length
      ? await this.db.campaign.findMany({
          where: { teamId },
          select: { id: true, config: true }
        })
      : [];
    const campaignIdsByTargetingId = new Map<string, string[]>();
    for (const campaign of campaigns) {
      const targetingId = stringValue(asRecord(campaign.config).targetingId);
      if (!targetingId || !targetingIds.includes(targetingId)) continue;
      const current = campaignIdsByTargetingId.get(targetingId) ?? [];
      current.push(campaign.id);
      campaignIdsByTargetingId.set(targetingId, current);
    }

    const campaignIds = Array.from(new Set([...campaignIdsByTargetingId.values()].flat()));
    const stats = campaignIds.length
      ? await this.db.campaignDailyStat.findMany({
          where: { teamId, campaignId: { in: campaignIds } }
        })
      : [];
    const metricByCampaignId = new Map<string, TargetingMetric>();
    for (const row of stats) {
      const metric = metricByCampaignId.get(row.campaignId) ?? emptyMetric();
      metric.spend = roundMoney(metric.spend + money(row.spend));
      metric.impressions += row.impressions;
      metric.clicks += row.clicks;
      metric.event1 += row.conversions;
      metric.event2 += numericRaw(row.raw, "event2");
      metric.event3 += numericRaw(row.raw, "event3");
      metric.conversions += row.conversions;
      metric.revenue = roundMoney(metric.revenue + money(row.revenue));
      metricByCampaignId.set(row.campaignId, metric);
    }

    return targetings.map((targeting) => {
      const campaignIdsForTargeting = campaignIdsByTargetingId.get(targeting.id) ?? [];
      const metric = campaignIdsForTargeting.reduce((current, campaignId) => {
        addMetric(current, metricByCampaignId.get(campaignId));
        return current;
      }, emptyMetric());
      metric.campaigns = campaignIdsForTargeting.length;
      return {
        ...targeting,
        view: targetingView(targeting.tags, targeting.config),
        metrics: {
          ...metric,
          spend: roundMoney(metric.spend),
          revenue: roundMoney(metric.revenue),
          cpc: metric.clicks ? roundMoney(metric.spend / metric.clicks) : 0,
          ctr: metric.impressions ? round((metric.clicks / metric.impressions) * 100, 2) : 0
        }
      };
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

  async duplicate(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const source = await this.ensureTargeting(id, teamId);
    const targeting = await this.db.targeting.create({
      data: {
        teamId,
        createdById: user.id,
        platform: source.platform,
        name: `${source.name} 副本`,
        config: toJson(asRecord(source.config)),
        tags: Array.from(new Set([...source.tags, "copied"]))
      }
    });

    await this.audit(user.id, teamId, "TARGETING_DUPLICATED", targeting.id, {
      sourceId: source.id,
      platform: targeting.platform,
      name: targeting.name
    });

    return targeting;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function emptyMetric(): TargetingMetric {
  return {
    campaigns: 0,
    spend: 0,
    impressions: 0,
    clicks: 0,
    event1: 0,
    event2: 0,
    event3: 0,
    conversions: 0,
    revenue: 0
  };
}

function addMetric(target: TargetingMetric, source?: TargetingMetric) {
  if (!source) return;
  target.campaigns += source.campaigns;
  target.spend = roundMoney(target.spend + source.spend);
  target.impressions += source.impressions;
  target.clicks += source.clicks;
  target.event1 += source.event1;
  target.event2 += source.event2;
  target.event3 += source.event3;
  target.conversions += source.conversions;
  target.revenue = roundMoney(target.revenue + source.revenue);
}

function targetingView(tags: string[], config: Prisma.JsonValue) {
  const record = asRecord(config);
  if (tags.some((tag) => tag.toLowerCase().includes("ai")) || record.source === "ai-generated") return "ai_generated";
  if (tags.includes("standard") || record.type === "standard") return "standard";
  return "default";
}

function numericRaw(raw: Prisma.JsonValue | null, key: string) {
  const value = asRecord(raw)[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function money(value: unknown) {
  if (value == null) return 0;
  if (typeof value === "object" && "toString" in value) return Number((value as { toString(): string }).toString());
  return Number(value) || 0;
}

function roundMoney(value: number) {
  return round(value, 2);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
