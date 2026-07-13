import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { BulkCreativeTagsDto, CreateCreativeDto, UpdateCreativeDto } from "./dto";

type CreativeMetric = {
  campaigns: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

@Injectable()
export class CreativesService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const creatives = await this.db.adCreative.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" }
    });
    const creativeIds = creatives.map((creative) => creative.id);
    const campaigns = creativeIds.length
      ? await this.db.campaign.findMany({
          where: { teamId },
          select: { id: true, config: true, status: true }
        })
      : [];
    const campaignsByCreativeId = new Map<string, string[]>();
    for (const campaign of campaigns) {
      const creativeId = stringValue(asRecord(campaign.config).adCreativeId);
      if (!creativeId || !creativeIds.includes(creativeId)) continue;
      const current = campaignsByCreativeId.get(creativeId) ?? [];
      current.push(campaign.id);
      campaignsByCreativeId.set(creativeId, current);
    }

    const campaignIds = Array.from(new Set([...campaignsByCreativeId.values()].flat()));
    const stats = campaignIds.length
      ? await this.db.campaignDailyStat.findMany({
          where: { teamId, campaignId: { in: campaignIds } }
        })
      : [];
    const statsByCampaignId = new Map<string, CreativeMetric>();
    for (const row of stats) {
      const metric = statsByCampaignId.get(row.campaignId) ?? emptyMetric();
      metric.spend = roundMoney(metric.spend + money(row.spend));
      metric.impressions += row.impressions;
      metric.clicks += row.clicks;
      metric.conversions += row.conversions;
      metric.revenue = roundMoney(metric.revenue + money(row.revenue));
      statsByCampaignId.set(row.campaignId, metric);
    }

    return creatives.map((creative) => {
      const linkedCampaignIds = campaignsByCreativeId.get(creative.id) ?? [];
      const metric = linkedCampaignIds.reduce((current, campaignId) => {
        addMetric(current, statsByCampaignId.get(campaignId));
        return current;
      }, emptyMetric());
      metric.campaigns = linkedCampaignIds.length;
      return {
        ...creative,
        metrics: {
          ...metric,
          spend: roundMoney(metric.spend),
          revenue: roundMoney(metric.revenue),
          ctr: metric.impressions ? round((metric.clicks / metric.impressions) * 100, 2) : 0,
          cpc: metric.clicks ? roundMoney(metric.spend / metric.clicks) : 0,
          cpa: metric.conversions ? roundMoney(metric.spend / metric.conversions) : 0,
          roas: metric.spend ? round(metric.revenue / metric.spend, 2) : 0
        }
      };
    });
  }

  async create(dto: CreateCreativeDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    await this.assertReferences(teamId, dto.config);
    const creative = await this.db.adCreative.create({
      data: {
        teamId,
        name: dto.name,
        config: toJson(dto.config),
        tags: dto.tags ?? [],
        status: dto.status ?? "draft"
      }
    });

    await this.audit(user.id, teamId, "AD_CREATIVE_CREATED", creative.id, {
      name: creative.name,
      status: creative.status
    });

    return creative;
  }

  async update(id: string, dto: UpdateCreativeDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensureCreative(id, teamId);
    if (dto.config) await this.assertReferences(teamId, dto.config);
    const creative = await this.db.adCreative.update({
      where: { id },
      data: {
        name: dto.name,
        config: dto.config ? toJson(dto.config) : undefined,
        tags: dto.tags,
        status: dto.status
      }
    });

    await this.audit(user.id, teamId, "AD_CREATIVE_UPDATED", creative.id, {
      name: creative.name,
      status: creative.status
    });

    return creative;
  }

  async duplicate(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const source = await this.ensureCreative(id, teamId);
    const creative = await this.db.adCreative.create({
      data: {
        teamId,
        name: `${source.name} 副本`,
        config: toJson(asRecord(source.config)),
        tags: Array.from(new Set([...source.tags, "copied"])),
        status: "draft"
      }
    });

    await this.audit(user.id, teamId, "AD_CREATIVE_DUPLICATED", creative.id, {
      sourceId: source.id,
      name: creative.name
    });

    return creative;
  }

  async bulkTags(dto: BulkCreativeTagsDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const ids = Array.from(new Set(dto.ids)).filter(Boolean);
    const tags = Array.from(new Set(dto.tags.map((tag) => tag.trim()).filter(Boolean)));
    if (!ids.length) throw new BadRequestException("请选择创意");
    if (!tags.length) throw new BadRequestException("请输入标签");

    const creatives = await this.db.adCreative.findMany({ where: { teamId, id: { in: ids } } });
    for (const creative of creatives) {
      await this.db.adCreative.update({
        where: { id: creative.id },
        data: { tags: Array.from(new Set([...creative.tags, ...tags])) }
      });
    }

    await this.audit(user.id, teamId, "AD_CREATIVE_BULK_TAGGED", "bulk", {
      ids: creatives.map((creative) => creative.id),
      tags
    });

    return { affected: creatives.length, tags };
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const creative = await this.ensureCreative(id, teamId);
    await this.db.adCreative.delete({ where: { id } });
    await this.audit(user.id, teamId, "AD_CREATIVE_DELETED", id, {
      name: creative.name,
      status: creative.status
    });
    return { ok: true };
  }

  private async assertReferences(teamId: string, config: Record<string, unknown>) {
    const mediaAssetId = typeof config.mediaAssetId === "string" ? config.mediaAssetId : undefined;
    const copywritingId = typeof config.copywritingId === "string" ? config.copywritingId : undefined;

    if (mediaAssetId) {
      const asset = await this.db.mediaAsset.findFirst({ where: { id: mediaAssetId, teamId } });
      if (!asset) throw new BadRequestException("Media asset does not belong to current team");
    }

    if (copywritingId) {
      const copywriting = await this.db.copywriting.findFirst({ where: { id: copywritingId, teamId } });
      if (!copywriting) throw new BadRequestException("Copywriting does not belong to current team");
    }
  }

  private async ensureCreative(id: string, teamId: string) {
    const creative = await this.db.adCreative.findFirst({ where: { id, teamId } });
    if (!creative) throw new NotFoundException("Creative not found");
    return creative;
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
        entityType: "ad_creative",
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

function emptyMetric(): CreativeMetric {
  return { campaigns: 0, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
}

function addMetric(target: CreativeMetric, source?: CreativeMetric) {
  if (!source) return;
  target.campaigns += source.campaigns;
  target.spend = roundMoney(target.spend + source.spend);
  target.impressions += source.impressions;
  target.clicks += source.clicks;
  target.conversions += source.conversions;
  target.revenue = roundMoney(target.revenue + source.revenue);
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
