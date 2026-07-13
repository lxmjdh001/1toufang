import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Platform, Prisma, PublishStatus, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { PublisherService } from "../publisher/publisher.service";
import { BulkCampaignActionDto, CreateCampaignDto, UpdateCampaignBudgetDto, UpdateCampaignDto } from "./dto";

type CampaignTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  event1: number;
  event2: number;
  event3: number;
  conversions: number;
  revenue: number;
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly publisher: PublisherService
  ) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const campaigns = await this.db.campaign.findMany({
      where: { teamId },
      include: {
        createdBy: { include: { profile: true } },
        publishTasks: {
          orderBy: { createdAt: "desc" },
          take: 3
        },
        platformIdMappings: true
      },
      orderBy: { updatedAt: "desc" }
    });
    const campaignIds = campaigns.map((campaign) => campaign.id);
    const stats = campaignIds.length
      ? await this.db.campaignDailyStat.findMany({
          where: { teamId, campaignId: { in: campaignIds } }
        })
      : [];
    const metricsByCampaignId = new Map<string, CampaignTotals>();

    for (const row of stats) {
      const metric = metricsByCampaignId.get(row.campaignId) ?? emptyTotals();
      metric.spend = roundMoney(metric.spend + money(row.spend));
      metric.impressions += row.impressions;
      metric.clicks += row.clicks;
      metric.linkClicks += inferLinkClicks(row.clicks, row.raw);
      metric.event1 += row.conversions;
      metric.event2 += inferEventMetric(row.raw, "event2");
      metric.event3 += inferEventMetric(row.raw, "event3");
      metric.conversions += row.conversions;
      metric.revenue = roundMoney(metric.revenue + money(row.revenue));
      metricsByCampaignId.set(row.campaignId, metric);
    }

    return campaigns.map((campaign) => ({
      ...campaign,
      metrics: withRates(metricsByCampaignId.get(campaign.id) ?? emptyTotals())
    }));
  }

  async create(dto: CreateCampaignDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    await this.assertAssets(teamId, dto);

    const config = {
      ...(dto.config ?? {}),
      adAccountId: dto.adAccountId,
      strategyId: dto.strategyId,
      targetingId: dto.targetingId,
      adCreativeId: dto.adCreativeId,
      budget: dto.budget,
      dailyBudget: dto.budget,
      tags: dto.tags ?? [],
      project: dto.project,
      pageAssetId: dto.pageAssetId,
      landingPageId: dto.landingPageId,
      offerId: dto.offerId,
      domainId: dto.domainId,
      customDomain: dto.customDomain,
      adSetupMode: dto.adSetupMode,
      existingPostId: dto.existingPostId,
      splitTest: dto.splitTest ?? false,
      optimizerIds: dto.optimizerIds ?? [],
      aiAssistantIds: dto.aiAssistantIds ?? [],
      lifecycleStatus: dto.lifecycleStatus,
      notes: dto.notes
    };
    const campaign = await this.db.campaign.create({
      data: {
        teamId,
        createdById: user.id,
        platform: dto.platform,
        name: dto.name,
        status: PublishStatus.DRAFT,
        config: toJson(config)
      }
    });

    await this.audit(user.id, teamId, "CAMPAIGN_DRAFT_CREATED", campaign.id, {
      platform: campaign.platform,
      name: campaign.name,
      adAccountId: dto.adAccountId,
      strategyId: dto.strategyId,
      targetingId: dto.targetingId,
      adCreativeId: dto.adCreativeId,
      landingPageId: dto.landingPageId,
      offerId: dto.offerId,
      domainId: dto.domainId
    });

    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const existing = await this.ensureCampaign(id, teamId);
    const nextConfig = dto.config ? { ...asRecord(existing.config), ...dto.config } : undefined;
    const campaign = await this.db.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        config: nextConfig ? toJson(nextConfig) : undefined
      }
    });

    await this.audit(user.id, teamId, "CAMPAIGN_UPDATED", id, {
      status: campaign.status,
      name: campaign.name
    });

    return campaign;
  }

  async updateBudget(id: string, dto: UpdateCampaignBudgetDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const existing = await this.ensureCampaign(id, teamId);
    const config = {
      ...asRecord(existing.config),
      budget: dto.dailyBudget,
      dailyBudget: dto.dailyBudget
    };
    const campaign = await this.db.campaign.update({
      where: { id },
      data: { config: toJson(config) }
    });

    await this.audit(user.id, teamId, "CAMPAIGN_DAILY_BUDGET_UPDATED", id, {
      dailyBudget: dto.dailyBudget
    });

    return campaign;
  }

  async bulk(dto: BulkCampaignActionDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const ids = Array.from(new Set(dto.ids)).filter(Boolean);
    if (!ids.length) throw new BadRequestException("请选择 Campaign");

    const campaigns = await this.db.campaign.findMany({ where: { teamId, id: { in: ids } } });
    if (!campaigns.length) throw new NotFoundException("Campaign not found");
    const campaignIds = campaigns.map((campaign) => campaign.id);

    if (dto.action === "delete_selected") {
      const result = await this.db.campaign.deleteMany({ where: { teamId, id: { in: campaignIds } } });
      await this.audit(user.id, teamId, "CAMPAIGN_BULK_DELETED", "bulk", { ids: campaignIds, count: result.count });
      return { action: dto.action, affected: result.count, results: [] };
    }

    if (dto.action === "stop_selected" || dto.action === "start_selected") {
      const status = dto.action === "stop_selected" ? PublishStatus.PAUSED : PublishStatus.ACTIVE;
      const result = await this.db.campaign.updateMany({
        where: { teamId, id: { in: campaignIds } },
        data: { status }
      });
      await this.audit(user.id, teamId, `CAMPAIGN_BULK_${status}`, "bulk", { ids: campaignIds, count: result.count });
      return { action: dto.action, affected: result.count, results: [] };
    }

    if (dto.action === "modify_daily_budget") {
      if (dto.dailyBudget == null) throw new BadRequestException("dailyBudget is required");
      for (const campaign of campaigns) {
        const config = { ...asRecord(campaign.config), budget: dto.dailyBudget, dailyBudget: dto.dailyBudget };
        await this.db.campaign.update({ where: { id: campaign.id }, data: { config: toJson(config) } });
      }
      await this.audit(user.id, teamId, "CAMPAIGN_BULK_DAILY_BUDGET_UPDATED", "bulk", {
        ids: campaignIds,
        dailyBudget: dto.dailyBudget
      });
      return { action: dto.action, affected: campaignIds.length, results: [] };
    }

    if (dto.action === "update_config") {
      const patch = dto.config ?? {};
      for (const campaign of campaigns) {
        const config = { ...asRecord(campaign.config), ...patch };
        await this.db.campaign.update({ where: { id: campaign.id }, data: { config: toJson(config) } });
      }
      await this.audit(user.id, teamId, "CAMPAIGN_BULK_CONFIG_UPDATED", "bulk", { ids: campaignIds, patch });
      return { action: dto.action, affected: campaignIds.length, results: [] };
    }

    const results = [];
    for (const campaign of campaigns) {
      try {
        const task = await this.publisher.publishCampaign(campaign.id, user);
        results.push({ id: campaign.id, ok: true, status: task.status });
      } catch (err) {
        results.push({ id: campaign.id, ok: false, message: err instanceof Error ? err.message : "重试发布失败" });
      }
    }
    return { action: dto.action, affected: results.filter((result) => result.ok).length, results };
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const campaign = await this.ensureCampaign(id, teamId);
    await this.db.campaign.delete({ where: { id } });
    await this.audit(user.id, teamId, "CAMPAIGN_DELETED", id, {
      status: campaign.status,
      name: campaign.name
    });
    return { ok: true };
  }

  async publish(id: string, user: AuthenticatedUser) {
    await this.ensureCampaign(id, await this.resolveTeamId(user));
    return this.publisher.publishCampaign(id, user);
  }

  async retryPublish(id: string, user: AuthenticatedUser) {
    await this.ensureCampaign(id, await this.resolveTeamId(user));
    return this.publisher.publishCampaign(id, user);
  }

  async preflight(id: string, user: AuthenticatedUser) {
    await this.ensureCampaign(id, await this.resolveTeamId(user));
    return this.publisher.preflightCampaign(id, user);
  }

  async publishTasks(id: string, user: AuthenticatedUser) {
    await this.ensureCampaign(id, await this.resolveTeamId(user));
    return this.publisher.listTasks(id, user);
  }

  private async assertAssets(
    teamId: string,
    dto: Pick<
      CreateCampaignDto,
      "platform" | "adAccountId" | "strategyId" | "targetingId" | "adCreativeId" | "pageAssetId" | "landingPageId" | "offerId" | "domainId"
    >
  ) {
    const adAccount = await this.db.adAccount.findFirst({
      where: { id: dto.adAccountId, teamId, platform: dto.platform }
    });
    if (!adAccount) throw new BadRequestException("Ad account does not belong to current team or platform");

    if (dto.strategyId) {
      const strategy = await this.db.strategy.findFirst({ where: { id: dto.strategyId, teamId, platform: dto.platform } });
      if (!strategy) throw new BadRequestException("Strategy does not belong to current team or platform");
    }

    if (dto.targetingId) {
      const targeting = await this.db.targeting.findFirst({ where: { id: dto.targetingId, teamId, platform: dto.platform } });
      if (!targeting) throw new BadRequestException("Targeting does not belong to current team or platform");
    }

    if (dto.adCreativeId) {
      const creative = await this.db.adCreative.findFirst({ where: { id: dto.adCreativeId, teamId } });
      if (!creative) throw new BadRequestException("Creative does not belong to current team");
    }

    if (dto.pageAssetId) {
      const page = await this.db.platformAsset.findFirst({
        where: { id: dto.pageAssetId, teamId, platform: dto.platform }
      });
      if (!page) throw new BadRequestException("Page asset does not belong to current team or platform");
    }

    if (dto.landingPageId) {
      const landingPage = await this.db.landingPage.findFirst({ where: { id: dto.landingPageId, teamId } });
      if (!landingPage) throw new BadRequestException("Landing page does not belong to current team");
    }

    if (dto.offerId) {
      const offer = await this.db.offer.findFirst({ where: { id: dto.offerId, teamId } });
      if (!offer) throw new BadRequestException("Offer does not belong to current team");
    }

    if (dto.domainId) {
      const domain = await this.db.domain.findFirst({ where: { id: dto.domainId, teamId } });
      if (!domain) throw new BadRequestException("Domain does not belong to current team");
    }
  }

  private async ensureCampaign(id: string, teamId: string) {
    const campaign = await this.db.campaign.findFirst({ where: { id, teamId } });
    if (!campaign) throw new NotFoundException("Campaign not found");
    return campaign;
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
        entityType: "campaign",
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

function emptyTotals(): CampaignTotals {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    event1: 0,
    event2: 0,
    event3: 0,
    conversions: 0,
    revenue: 0
  };
}

function withRates(metric: CampaignTotals) {
  return {
    ...metric,
    spend: roundMoney(metric.spend),
    revenue: roundMoney(metric.revenue),
    result: metric.conversions,
    profit: roundMoney(metric.revenue - metric.spend),
    ctr: metric.impressions ? round((metric.clicks / metric.impressions) * 100, 2) : 0,
    cpc: metric.clicks ? roundMoney(metric.spend / metric.clicks) : 0,
    cpa: metric.conversions ? roundMoney(metric.spend / metric.conversions) : 0,
    roas: metric.spend ? round(metric.revenue / metric.spend, 2) : 0
  };
}

function inferLinkClicks(clicks: number, raw: Prisma.JsonValue | null) {
  const value = rawObject(raw).linkClicks;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.round(parsed);
  return clicks;
}

function inferEventMetric(raw: Prisma.JsonValue | null, key: string) {
  const value = rawObject(raw)[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function rawObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function money(value: unknown) {
  return roundMoney(Number(value ?? 0));
}

function roundMoney(value: number) {
  return round(value, 2);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
