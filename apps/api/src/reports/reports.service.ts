import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Platform,
  PlatformObjectType,
  Prisma,
  PublishTaskStatus,
  PublishStatus,
  ReportSyncStatus,
  TeamMemberStatus
} from "@1toufang/database/client";
import { SecretCryptoService } from "../common/crypto/secret-crypto.service";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { DryRunReportSyncDto, GlobalSearchQueryDto, ReportOverviewQueryDto, ReportSyncDto } from "./reports.dto";

type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

type DateRange = {
  start: Date;
  end: Date;
  days: Date[];
};

type MetaCollection<T> = {
  data?: T[];
  paging?: { next?: string };
};

type MetaInsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  actions?: Array<{ action_type?: string; value?: string | number }>;
  action_values?: Array<{ action_type?: string; value?: string | number }>;
};

type TikTokReportResponse = {
  code?: number | string;
  message?: string;
  data?: {
    list?: TikTokReportRawRow[];
    page_info?: { page?: number; total_page?: number; total_number?: number; page_size?: number };
  };
};

type TikTokReportRawRow = {
  dimensions?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  campaign_id?: string | number;
  stat_time_day?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  conversion?: string | number;
  conversions?: string | number;
  total_purchase_value?: string | number;
};

type NormalizedTikTokReportRow = {
  campaignId: string;
  date: string;
  metric: Totals;
  raw: TikTokReportRawRow;
};

const emptyTotals = (): Totals => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0
});

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly secretCrypto: SecretCryptoService
  ) {}

  async overview(query: ReportOverviewQueryDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const range = this.resolveDateRange(query.startDate, query.endDate);

    const stats = await this.db.campaignDailyStat.findMany({
      where: {
        teamId,
        date: { gte: range.start, lte: range.end },
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.adAccountId ? { adAccountId: query.adAccountId } : {}),
        ...(query.campaignId ? { campaignId: query.campaignId } : {})
      },
      include: {
        campaign: true,
        adAccount: true
      },
      orderBy: { date: "asc" }
    });

    const totals = emptyTotals();
    const series = new Map(range.days.map((day) => [dateKey(day), emptyTotals()]));
    const platformBreakdown = new Map<Platform, Totals>();
    const accountRanking = new Map<string, Totals & { id: string; name: string; platform: Platform }>();
    const campaignRanking = new Map<
      string,
      Totals & { id: string; name: string; platform: Platform; status: PublishStatus }
    >();

    for (const row of stats) {
      const metric = {
        spend: money(row.spend),
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        revenue: money(row.revenue)
      };

      addTotals(totals, metric);
      addTotals(series.get(dateKey(row.date)) ?? totals, metric);

      const platformTotals = platformBreakdown.get(row.platform) ?? emptyTotals();
      addTotals(platformTotals, metric);
      platformBreakdown.set(row.platform, platformTotals);

      if (row.adAccountId && row.adAccount) {
        const accountTotals =
          accountRanking.get(row.adAccountId) ?? {
            ...emptyTotals(),
            id: row.adAccountId,
            name: row.adAccount.name,
            platform: row.platform
          };
        addTotals(accountTotals, metric);
        accountRanking.set(row.adAccountId, accountTotals);
      }

      const campaignTotals =
        campaignRanking.get(row.campaignId) ?? {
          ...emptyTotals(),
          id: row.campaignId,
          name: row.campaign.name,
          platform: row.platform,
          status: row.campaign.status
        };
      addTotals(campaignTotals, metric);
      campaignRanking.set(row.campaignId, campaignTotals);
    }

    const latestSyncRuns = await this.db.reportSyncRun.findMany({
      where: { teamId },
      include: { adAccount: true },
      orderBy: { createdAt: "desc" },
      take: 5
    });

    return {
      range: {
        startDate: dateKey(range.start),
        endDate: dateKey(range.end)
      },
      totals: withRates(totals),
      series: Array.from(series.entries()).map(([date, metric]) => ({ date, ...withRates(metric) })),
      platformBreakdown: Array.from(platformBreakdown.entries()).map(([platform, metric]) => ({
        platform,
        ...withRates(metric)
      })),
      accountRanking: Array.from(accountRanking.values())
        .map((metric) => ({ ...metric, ...withRates(metric) }))
        .sort((left, right) => right.spend - left.spend)
        .slice(0, 8),
      campaignRanking: Array.from(campaignRanking.values())
        .map((metric) => ({ ...metric, ...withRates(metric) }))
        .sort((left, right) => right.spend - left.spend)
        .slice(0, 8),
      latestSyncRuns: latestSyncRuns.map((run) => ({
        id: run.id,
        platform: run.platform,
        adAccountName: run.adAccount?.name ?? null,
        source: run.source,
        status: run.status,
        message: run.message,
        rangeStart: dateKey(run.rangeStart),
        rangeEnd: dateKey(run.rangeEnd),
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        createdAt: run.createdAt
      }))
    };
  }

  async dashboard(query: ReportOverviewQueryDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const range = this.resolveDateRange(query.startDate, query.endDate);
    const adAccountWhere = {
      teamId,
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.adAccountId ? { id: query.adAccountId } : {})
    };
    const statsWhere = {
      teamId,
      date: { gte: range.start, lte: range.end },
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.adAccountId ? { adAccountId: query.adAccountId } : {})
    };

    const [adAccounts, accountStats, campaignStats, visitorRows, conversionRows, automationLogs, notifications] = await Promise.all([
      this.db.adAccount.findMany({
        where: adAccountWhere,
        select: {
          id: true,
          name: true,
          platform: true,
          currency: true,
          balance: true,
          updatedAt: true
        }
      }),
      this.db.accountDailyStat.findMany({
        where: statsWhere,
        orderBy: { date: "asc" }
      }),
      this.db.campaignDailyStat.findMany({
        where: {
          teamId,
          date: { gte: range.start, lte: range.end },
          ...(query.platform ? { platform: query.platform } : {}),
          ...(query.adAccountId ? { adAccountId: query.adAccountId } : {}),
          ...(query.campaignId ? { campaignId: query.campaignId } : {})
        },
        orderBy: { date: "asc" }
      }),
      this.db.visitorLog.findMany({
        where: {
          teamId,
          visitAt: { gte: range.start, lte: range.end },
          ...(query.campaignId ? { campaignId: query.campaignId } : {})
        },
        select: { id: true, visitAt: true }
      }),
      this.db.conversionEvent.findMany({
        where: {
          teamId,
          convertedAt: { gte: range.start, lte: range.end },
          ...(query.campaignId ? { campaignId: query.campaignId } : {})
        },
        select: { id: true, convertedAt: true }
      }),
      this.db.auditLog.findMany({
        where: {
          teamId,
          OR: [
            { action: { contains: "AI", mode: Prisma.QueryMode.insensitive } },
            { action: { contains: "AUTOMATION", mode: Prisma.QueryMode.insensitive } },
            { action: { contains: "PUBLISH", mode: Prisma.QueryMode.insensitive } },
            { action: { contains: "REPORT", mode: Prisma.QueryMode.insensitive } }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 6
      }),
      this.buildNotifications(teamId)
    ]);

    const currency = dominantCurrency(adAccounts.map((account) => account.currency)) ?? "USD";
    const adAccountBalance = roundMoney(adAccounts.reduce((sum, account) => sum + money(account.balance), 0));
    const spendRows = accountStats.length ? accountStats : campaignStats;
    const spendTotals = emptyTotals();
    const spendSeries = new Map(range.days.map((day) => [dateKey(day), emptyTotals()]));
    const visitorSeries = new Map(range.days.map((day) => [dateKey(day), { visitors: 0, conversions: 0 }]));

    for (const row of spendRows) {
      const metric = {
        spend: money(row.spend),
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        revenue: money(row.revenue)
      };
      addTotals(spendTotals, metric);
      const dayTotals = spendSeries.get(dateKey(row.date));
      if (dayTotals) addTotals(dayTotals, metric);
    }

    for (const row of visitorRows) {
      const dayTotals = visitorSeries.get(dateKey(row.visitAt));
      if (dayTotals) dayTotals.visitors += 1;
    }

    for (const row of conversionRows) {
      const dayTotals = visitorSeries.get(dateKey(row.convertedAt));
      if (dayTotals) dayTotals.conversions += 1;
    }

    return {
      range: {
        startDate: dateKey(range.start),
        endDate: dateKey(range.end)
      },
      wallet: {
        balance: 0,
        currency,
        status: "not_configured",
        note: "钱包账务模块尚未接入，后续可连接充值、扣费和发票流水"
      },
      adAccountBalance: {
        balance: adAccountBalance,
        currency,
        accountCount: adAccounts.length,
        lastSyncedAt: latestDate(adAccounts.map((account) => account.updatedAt))
      },
      adAccountSpend: {
        currency,
        source: accountStats.length ? "account_daily_stats" : "campaign_daily_stats",
        ...withRates(spendTotals)
      },
      visitors: {
        total: visitorRows.length,
        conversions: conversionRows.length,
        conversionRate: visitorRows.length ? roundMoney((conversionRows.length / visitorRows.length) * 100) : 0,
        status: visitorRows.length ? "tracking_active" : "tracking_ready",
        note: visitorRows.length ? "访客埋点已接入，正在统计站点侧访问与转化" : "访客埋点已可用，等待站点上报访问数据",
        series: Array.from(visitorSeries.entries()).map(([date, metric]) => ({ date, ...metric }))
      },
      spendSeries: Array.from(spendSeries.entries()).map(([date, metric]) => ({
        date,
        ...withRates(metric)
      })),
      aiLogs: automationLogs.map((log) => ({
        id: log.id,
        title: actionTitle(log.action),
        message: actionMessage(log.action),
        status: actionSeverity(log.action),
        action: log.action,
        createdAt: log.createdAt
      })),
      notifications
    };
  }

  async search(query: GlobalSearchQueryDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const keyword = (query.q ?? "").trim();
    if (!keyword) return { query: keyword, items: [] };

    const contains = { contains: keyword, mode: Prisma.QueryMode.insensitive };
    const [
      campaigns,
      adAccounts,
      integrations,
      platformAssets,
      mediaAssets,
      copywritings,
      creatives,
      strategies,
      targetings,
      pwaApps,
      demands,
      workspaceRecords
    ] = await Promise.all([
      this.db.campaign.findMany({
        where: { teamId, name: contains },
        select: { id: true, name: true, platform: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5
      }),
      this.db.adAccount.findMany({
        where: {
          teamId,
          OR: [{ name: contains }, { externalId: contains }, { status: contains }]
        },
        select: { id: true, name: true, externalId: true, platform: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5
      }),
      this.db.integrationAccount.findMany({
        where: {
          teamId,
          OR: [{ name: contains }, { externalId: contains }, { status: contains }]
        },
        select: { id: true, name: true, externalId: true, platform: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.platformAsset.findMany({
        where: {
          teamId,
          OR: [{ name: contains }, { externalId: contains }, { status: contains }]
        },
        select: { id: true, name: true, externalId: true, platform: true, type: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.mediaAsset.findMany({
        where: { teamId, OR: [{ name: contains }, { fileType: contains }, { url: contains }] },
        select: { id: true, name: true, fileType: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.copywriting.findMany({
        where: { teamId, OR: [{ name: contains }, { headline: contains }, { primaryText: contains }] },
        select: { id: true, name: true, headline: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.adCreative.findMany({
        where: { teamId, OR: [{ name: contains }, { status: contains }] },
        select: { id: true, name: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.strategy.findMany({
        where: { teamId, OR: [{ name: contains }, { notes: contains }] },
        select: { id: true, name: true, platform: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.targeting.findMany({
        where: { teamId, name: contains },
        select: { id: true, name: true, platform: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.pwaApp.findMany({
        where: { teamId, OR: [{ name: contains }, { startUrl: contains }, { status: contains }] },
        select: { id: true, name: true, startUrl: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.demand.findMany({
        where: {
          teamId,
          OR: [{ title: contains }, { type: contains }, { priority: contains }, { status: contains }, { description: contains }]
        },
        select: { id: true, title: true, type: true, priority: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4
      }),
      this.db.workspaceRecord.findMany({
        where: { teamId, OR: [{ name: contains }, { module: contains }, { status: contains }] },
        select: { id: true, name: true, module: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 8
      })
    ]);

    const items = [
      ...campaigns.map((row) => searchItem(row.id, "Campaign", row.name, `${row.platform} / ${row.status}`, "/campaigns", row.updatedAt)),
      ...adAccounts.map((row) =>
        searchItem(row.id, "广告账户", row.name, `${row.platform} / ${row.externalId}`, "/ad-accounts", row.updatedAt)
      ),
      ...integrations.map((row) =>
        searchItem(row.id, "渠道授权", row.name, `${row.platform} / ${row.status}`, "/integrations", row.updatedAt)
      ),
      ...platformAssets.map((row) =>
        searchItem(row.id, "渠道资产", row.name, `${row.platform} / ${row.type}`, "/platform-assets", row.updatedAt)
      ),
      ...mediaAssets.map((row) => searchItem(row.id, "素材", row.name, row.fileType, "/media-assets", row.updatedAt)),
      ...copywritings.map((row) => searchItem(row.id, "文案", row.name, row.headline, "/copywritings", row.updatedAt)),
      ...creatives.map((row) => searchItem(row.id, "创意", row.name, row.status, "/creatives", row.updatedAt)),
      ...strategies.map((row) => searchItem(row.id, "策略", row.name, row.platform, "/strategies", row.updatedAt)),
      ...targetings.map((row) => searchItem(row.id, "受众", row.name, row.platform, "/targetings", row.updatedAt)),
      ...pwaApps.map((row) => searchItem(row.id, "PWA", row.name, `${row.status} / ${row.startUrl}`, "/pwa-apps", row.updatedAt)),
      ...demands.map((row) => searchItem(row.id, "需求", row.title, `${row.type} / ${row.priority} / ${row.status}`, "/demands", row.updatedAt)),
      ...workspaceRecords.map((row) => searchItem(row.id, workspaceModuleLabel(row.module), row.name, row.status, workspaceModulePath(row.module), row.updatedAt))
    ]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 12);

    return { query: keyword, items };
  }

  async notifications(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const items = await this.buildNotifications(teamId);
    return {
      unread: items.filter((item) => item.severity !== "info").length,
      items
    };
  }

  async dryRunSync(dto: DryRunReportSyncDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const range = this.resolveDateRange(dto.startDate, dto.endDate);
    const run = await this.db.reportSyncRun.create({
      data: {
        teamId,
        platform: dto.platform,
        adAccountId: dto.adAccountId,
        source: "dry_run",
        status: ReportSyncStatus.RUNNING,
        rangeStart: range.start,
        rangeEnd: range.end
      }
    });

    try {
      const campaigns = await this.db.campaign.findMany({
        where: {
          teamId,
          ...(dto.platform ? { platform: dto.platform } : {}),
          status: { in: [PublishStatus.PUBLISHED, PublishStatus.ACTIVE, PublishStatus.PAUSED] }
        },
        include: {
          platformIdMappings: true
        },
        orderBy: { updatedAt: "desc" }
      });
      const adAccounts = await this.db.adAccount.findMany({ where: { teamId } });
      const adAccountIds = new Set(adAccounts.map((row) => row.id));
      const accountTotals = new Map<string, Totals & { platform: Platform; currency?: string | null }>();
      let writtenRows = 0;

      for (const campaign of campaigns) {
        const config = asRecord(campaign.config);
        const adAccountId = stringValue(config.adAccountId);
        if (!adAccountId || !adAccountIds.has(adAccountId)) continue;
        if (dto.adAccountId && adAccountId !== dto.adAccountId) continue;

        const platformCampaignId =
          campaign.platformIdMappings.find((item) => item.objectType === "CAMPAIGN")?.externalId ?? null;
        const adAccount = adAccounts.find((row) => row.id === adAccountId);

        for (const day of range.days) {
          const metric = dryRunMetric(campaign.id, dateKey(day), campaign.status);
          await this.db.campaignDailyStat.upsert({
            where: {
              teamId_campaignId_date: {
                teamId,
                campaignId: campaign.id,
                date: day
              }
            },
            create: {
              teamId,
              campaignId: campaign.id,
              adAccountId,
              platform: campaign.platform,
              date: day,
              currency: adAccount?.currency ?? "USD",
              spend: metric.spend,
              impressions: metric.impressions,
              clicks: metric.clicks,
              conversions: metric.conversions,
              revenue: metric.revenue,
              raw: {
                dryRun: true,
                platformCampaignId,
                source: "local_metric_seed"
              } as Prisma.InputJsonValue
            },
            update: {
              adAccountId,
              platform: campaign.platform,
              currency: adAccount?.currency ?? "USD",
              spend: metric.spend,
              impressions: metric.impressions,
              clicks: metric.clicks,
              conversions: metric.conversions,
              revenue: metric.revenue,
              raw: {
                dryRun: true,
                platformCampaignId,
                source: "local_metric_seed"
              } as Prisma.InputJsonValue,
              syncedAt: new Date()
            }
          });
          writtenRows += 1;

          const accountKey = `${adAccountId}:${dateKey(day)}`;
          const accountMetric =
            accountTotals.get(accountKey) ?? {
              ...emptyTotals(),
              platform: campaign.platform,
              currency: adAccount?.currency ?? "USD"
            };
          addTotals(accountMetric, metric);
          accountTotals.set(accountKey, accountMetric);
        }
      }

      for (const [key, metric] of accountTotals.entries()) {
        const [adAccountId, dayKey] = key.split(":");
        const day = parseDateOnly(dayKey);
        await this.db.accountDailyStat.upsert({
          where: {
            teamId_adAccountId_date: {
              teamId,
              adAccountId,
              date: day
            }
          },
          create: {
            teamId,
            adAccountId,
            platform: metric.platform,
            date: day,
            currency: metric.currency,
            spend: metric.spend,
            impressions: metric.impressions,
            clicks: metric.clicks,
            conversions: metric.conversions,
            revenue: metric.revenue,
            raw: { dryRun: true, source: "campaign_daily_stats" } as Prisma.InputJsonValue
          },
          update: {
            platform: metric.platform,
            currency: metric.currency,
            spend: metric.spend,
            impressions: metric.impressions,
            clicks: metric.clicks,
            conversions: metric.conversions,
            revenue: metric.revenue,
            raw: { dryRun: true, source: "campaign_daily_stats" } as Prisma.InputJsonValue,
            syncedAt: new Date()
          }
        });
      }

      const updatedRun = await this.db.reportSyncRun.update({
        where: { id: run.id },
        data: {
          status: ReportSyncStatus.SUCCEEDED,
          finishedAt: new Date(),
          message: `Dry-run 指标同步完成：${writtenRows} 条 Campaign 日报，${accountTotals.size} 条账户日报`,
          raw: {
            dryRun: true,
            campaignCount: campaigns.length,
            campaignDailyRows: writtenRows,
            accountDailyRows: accountTotals.size
          } as Prisma.InputJsonValue
        }
      });

      await this.audit(user.id, teamId, "REPORT_DRY_RUN_SYNCED", run.id, {
        rangeStart: dateKey(range.start),
        rangeEnd: dateKey(range.end),
        campaignDailyRows: writtenRows,
        accountDailyRows: accountTotals.size
      });

      return updatedRun;
    } catch (err) {
      const message = err instanceof Error ? err.message : "报表 dry-run 同步失败";
      const failedRun = await this.db.reportSyncRun.update({
        where: { id: run.id },
        data: {
          status: ReportSyncStatus.FAILED,
          finishedAt: new Date(),
          message
        }
      });
      await this.audit(user.id, teamId, "REPORT_DRY_RUN_SYNC_FAILED", run.id, { message });
      return failedRun;
    }
  }

  async sync(dto: ReportSyncDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const range = this.resolveDateRange(dto.startDate, dto.endDate);
    const run = await this.db.reportSyncRun.create({
      data: {
        teamId,
        platform: dto.platform,
        adAccountId: dto.adAccountId,
        source: "official_api",
        status: ReportSyncStatus.RUNNING,
        rangeStart: range.start,
        rangeEnd: range.end
      }
    });

    try {
      const adAccounts = await this.db.adAccount.findMany({
        where: {
          teamId,
          ...(dto.platform ? { platform: dto.platform } : {}),
          ...(dto.adAccountId ? { id: dto.adAccountId } : {})
        }
      });
      if (!adAccounts.length) throw new BadRequestException("没有可同步的广告账户");

      let campaignDailyRows = 0;
      let accountDailyRows = 0;
      const errors: string[] = [];
      const integrations = await this.db.integrationAccount.findMany({
        where: {
          teamId,
          platform: dto.platform,
          status: "active",
          accessTokenEncrypted: { not: null }
        },
        orderBy: { updatedAt: "desc" }
      });

      for (const platform of unique(adAccounts.map((account) => account.platform))) {
        const integration = integrations.find((row) => row.platform === platform);
        if (!integration?.accessTokenEncrypted) {
          errors.push(`${platform} 缺少 OAuth 授权 token`);
          continue;
        }
        const accessToken = this.secretCrypto.decrypt(integration.accessTokenEncrypted);
        const platformAccounts = adAccounts.filter((account) => account.platform === platform);

        for (const adAccount of platformAccounts) {
          try {
            const result =
              platform === Platform.META
                ? await this.syncMetaInsights(teamId, adAccount.id, adAccount.externalId, adAccount.currency, accessToken, range)
                : await this.syncTikTokInsights(
                    teamId,
                    adAccount.id,
                    adAccount.externalId,
                    adAccount.currency,
                    accessToken,
                    range
                  );
            campaignDailyRows += result.campaignDailyRows;
            accountDailyRows += result.accountDailyRows;
          } catch (err) {
            errors.push(`${adAccount.name}: ${this.toUserMessage(err, "官方数据同步失败")}`);
          }
        }
      }

      if (!campaignDailyRows && errors.length) {
        throw new BadRequestException(errors.join("；"));
      }

      const updatedRun = await this.db.reportSyncRun.update({
        where: { id: run.id },
        data: {
          status: ReportSyncStatus.SUCCEEDED,
          finishedAt: new Date(),
          message: `官方数据同步完成：${campaignDailyRows} 条 Campaign 日报，${accountDailyRows} 条账户日报${errors.length ? `；${errors.length} 个账户失败` : ""}`,
          raw: {
            campaignDailyRows,
            accountDailyRows,
            errors
          } as Prisma.InputJsonValue
        }
      });

      await this.audit(user.id, teamId, "REPORT_OFFICIAL_SYNCED", run.id, {
        rangeStart: dateKey(range.start),
        rangeEnd: dateKey(range.end),
        campaignDailyRows,
        accountDailyRows,
        errors
      });

      return updatedRun;
    } catch (err) {
      const message = this.toUserMessage(err, "官方报表同步失败");
      const failedRun = await this.db.reportSyncRun.update({
        where: { id: run.id },
        data: {
          status: ReportSyncStatus.FAILED,
          finishedAt: new Date(),
          message
        }
      });
      await this.audit(user.id, teamId, "REPORT_OFFICIAL_SYNC_FAILED", run.id, { message });
      return failedRun;
    }
  }

  private async syncMetaInsights(
    teamId: string,
    adAccountId: string,
    externalAdAccountId: string,
    currency: string | null | undefined,
    accessToken: string,
    range: DateRange
  ) {
    const version = this.config.get<string>("META_GRAPH_VERSION") ?? "v25.0";
    const accountApiId = externalAdAccountId.startsWith("act_") ? externalAdAccountId : `act_${externalAdAccountId}`;
    const rows = await this.fetchMetaCollection<MetaInsightRow>(`/${version}/${accountApiId}/insights`, accessToken, {
      fields: "campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,actions,action_values",
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: dateKey(range.start), until: dateKey(range.end) }),
      limit: "500"
    });

    const campaignIds = unique(rows.map((row) => row.campaign_id).filter(isPresent));
    const mappings = await this.db.platformIdMapping.findMany({
      where: {
        teamId,
        platform: Platform.META,
        objectType: PlatformObjectType.CAMPAIGN,
        externalId: { in: campaignIds }
      },
      include: { campaign: true }
    });
    const mappingByExternalId = new Map(mappings.map((mapping) => [mapping.externalId, mapping]));
    const accountTotals = new Map<string, Totals>();
    let campaignDailyRows = 0;

    for (const row of rows) {
      if (!row.campaign_id || !row.date_start) continue;
      const mapping = mappingByExternalId.get(row.campaign_id);
      if (!mapping) continue;
      const day = parseDateOnly(row.date_start);
      const metric = metricFromMetaRow(row);

      await this.db.campaignDailyStat.upsert({
        where: {
          teamId_campaignId_date: {
            teamId,
            campaignId: mapping.campaignId,
            date: day
          }
        },
        create: {
          teamId,
          campaignId: mapping.campaignId,
          adAccountId,
          platform: Platform.META,
          date: day,
          currency: currency ?? "USD",
          spend: metric.spend,
          impressions: metric.impressions,
          clicks: metric.clicks,
          conversions: metric.conversions,
          revenue: metric.revenue,
          raw: row as Prisma.InputJsonValue
        },
        update: {
          adAccountId,
          platform: Platform.META,
          currency: currency ?? "USD",
          spend: metric.spend,
          impressions: metric.impressions,
          clicks: metric.clicks,
          conversions: metric.conversions,
          revenue: metric.revenue,
          raw: row as Prisma.InputJsonValue,
          syncedAt: new Date()
        }
      });
      campaignDailyRows += 1;

      const accountMetric = accountTotals.get(dateKey(day)) ?? emptyTotals();
      addTotals(accountMetric, metric);
      accountTotals.set(dateKey(day), accountMetric);
    }

    const accountDailyRows = await this.writeAccountDailyStats(
      teamId,
      adAccountId,
      Platform.META,
      currency,
      accountTotals,
      "meta_insights"
    );

    return { campaignDailyRows, accountDailyRows };
  }

  private async syncTikTokInsights(
    teamId: string,
    adAccountId: string,
    advertiserId: string,
    currency: string | null | undefined,
    accessToken: string,
    range: DateRange
  ) {
    const rows = await this.fetchTikTokReportRows(advertiserId, accessToken, range);
    const campaignIds = unique(rows.map((row) => row.campaignId).filter(isPresent));
    const mappings = await this.db.platformIdMapping.findMany({
      where: {
        teamId,
        platform: Platform.TIKTOK,
        objectType: PlatformObjectType.CAMPAIGN,
        externalId: { in: campaignIds }
      },
      include: { campaign: true }
    });
    const mappingByExternalId = new Map(mappings.map((mapping) => [mapping.externalId, mapping]));
    const accountTotals = new Map<string, Totals>();
    let campaignDailyRows = 0;

    for (const row of rows) {
      if (!row.campaignId || !row.date) continue;
      const mapping = mappingByExternalId.get(row.campaignId);
      if (!mapping) continue;
      const day = parseDateOnly(row.date);
      const metric = row.metric;

      await this.db.campaignDailyStat.upsert({
        where: {
          teamId_campaignId_date: {
            teamId,
            campaignId: mapping.campaignId,
            date: day
          }
        },
        create: {
          teamId,
          campaignId: mapping.campaignId,
          adAccountId,
          platform: Platform.TIKTOK,
          date: day,
          currency: currency ?? "USD",
          spend: metric.spend,
          impressions: metric.impressions,
          clicks: metric.clicks,
          conversions: metric.conversions,
          revenue: metric.revenue,
          raw: row.raw as Prisma.InputJsonValue
        },
        update: {
          adAccountId,
          platform: Platform.TIKTOK,
          currency: currency ?? "USD",
          spend: metric.spend,
          impressions: metric.impressions,
          clicks: metric.clicks,
          conversions: metric.conversions,
          revenue: metric.revenue,
          raw: row.raw as Prisma.InputJsonValue,
          syncedAt: new Date()
        }
      });
      campaignDailyRows += 1;

      const accountMetric = accountTotals.get(dateKey(day)) ?? emptyTotals();
      addTotals(accountMetric, metric);
      accountTotals.set(dateKey(day), accountMetric);
    }

    const accountDailyRows = await this.writeAccountDailyStats(
      teamId,
      adAccountId,
      Platform.TIKTOK,
      currency,
      accountTotals,
      "tiktok_integrated_report"
    );

    return { campaignDailyRows, accountDailyRows };
  }

  private async writeAccountDailyStats(
    teamId: string,
    adAccountId: string,
    platform: Platform,
    currency: string | null | undefined,
    accountTotals: Map<string, Totals>,
    source: string
  ) {
    let rows = 0;
    for (const [dayKey, metric] of accountTotals.entries()) {
      const day = parseDateOnly(dayKey);
      await this.db.accountDailyStat.upsert({
        where: {
          teamId_adAccountId_date: {
            teamId,
            adAccountId,
            date: day
          }
        },
        create: {
          teamId,
          adAccountId,
          platform,
          date: day,
          currency: currency ?? "USD",
          spend: metric.spend,
          impressions: metric.impressions,
          clicks: metric.clicks,
          conversions: metric.conversions,
          revenue: metric.revenue,
          raw: { source } as Prisma.InputJsonValue
        },
        update: {
          platform,
          currency: currency ?? "USD",
          spend: metric.spend,
          impressions: metric.impressions,
          clicks: metric.clicks,
          conversions: metric.conversions,
          revenue: metric.revenue,
          raw: { source } as Prisma.InputJsonValue,
          syncedAt: new Date()
        }
      });
      rows += 1;
    }
    return rows;
  }

  private async fetchMetaCollection<T>(path: string, accessToken: string, params: Record<string, string>) {
    const rows: T[] = [];
    const baseUrl = this.config.get<string>("META_API_BASE_URL") ?? "https://graph.facebook.com";
    let nextUrl: string | undefined = new URL(path, baseUrl).toString();

    while (nextUrl) {
      const current: URL = new URL(nextUrl);
      current.searchParams.set("access_token", accessToken);
      for (const [key, value] of Object.entries(params)) {
        current.searchParams.set(key, value);
      }
      const body = await this.fetchJson<MetaCollection<T>>(current.toString());
      rows.push(...(body.data ?? []));
      nextUrl = body.paging?.next;
    }

    return rows;
  }

  private async fetchTikTokReportRows(advertiserId: string, accessToken: string, range: DateRange) {
    const rows: NormalizedTikTokReportRow[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const params = new URLSearchParams({
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_CAMPAIGN",
        dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
        metrics: JSON.stringify(["spend", "impressions", "clicks", "conversion", "total_purchase_value"]),
        start_date: dateKey(range.start),
        end_date: dateKey(range.end),
        page: String(page),
        page_size: "1000"
      });
      const body = await this.fetchTikTok<TikTokReportResponse>(
        `/open_api/v1.3/report/integrated/get/?${params.toString()}`,
        accessToken
      );
      const list = body.data?.list ?? [];
      rows.push(...list.map(normalizeTikTokReportRow).filter(isPresent));

      const pageInfo = body.data?.page_info;
      totalPages = Number(pageInfo?.total_page ?? totalPages);
      page += 1;
    } while (page <= totalPages);

    return rows;
  }

  private async fetchTikTok<T>(path: string, accessToken: string): Promise<T> {
    const baseUrl = this.config.get<string>("TIKTOK_API_BASE_URL") ?? "https://business-api.tiktok.com";
    const body = await this.fetchJson<T & { code?: number | string; message?: string }>(new URL(path, baseUrl).toString(), {
      headers: { "Access-Token": accessToken }
    });
    const providerCode = Number(body.code ?? 0);
    if (!Number.isNaN(providerCode) && providerCode !== 0) {
      throw new BadRequestException(body.message ?? "TikTok API request failed");
    }
    return body;
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new BadRequestException("无法连接渠道官方接口");
    }

    const body = (await response.json().catch(() => null)) as T | null;
    if (!response.ok) {
      throw new BadRequestException(providerErrorMessage(body, `Provider request failed: ${response.status}`));
    }
    return (body ?? {}) as T;
  }

  private resolveDateRange(startDate?: string, endDate?: string): DateRange {
    const end = endDate ? parseDateOnly(endDate) : startOfToday();
    const start = startDate ? parseDateOnly(startDate) : addDays(end, -6);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException("startDate cannot be later than endDate");
    }
    const days: Date[] = [];
    for (let day = start; day.getTime() <= end.getTime(); day = addDays(day, 1)) {
      days.push(day);
    }
    if (days.length > 93) {
      throw new BadRequestException("Date range cannot exceed 93 days");
    }
    return { start, end, days };
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

  private async buildNotifications(teamId: string) {
    const [metaIntegrations, tiktokIntegrations, adAccountCount, failedSyncRuns, failedPublishTasks] =
      await Promise.all([
        this.db.integrationAccount.count({
          where: { teamId, platform: Platform.META, status: { in: ["active", "manual"] } }
        }),
        this.db.integrationAccount.count({
          where: { teamId, platform: Platform.TIKTOK, status: { in: ["active", "manual"] } }
        }),
        this.db.adAccount.count({ where: { teamId } }),
        this.db.reportSyncRun.findMany({
          where: { teamId, status: ReportSyncStatus.FAILED },
          include: { adAccount: true },
          orderBy: { createdAt: "desc" },
          take: 3
        }),
        this.db.publishTask.findMany({
          where: { teamId, status: PublishTaskStatus.FAILED },
          include: { campaign: true },
          orderBy: { createdAt: "desc" },
          take: 3
        })
      ]);

    const items = [];
    const now = new Date();

    if (!metaIntegrations) {
      items.push({
        id: "connect-meta",
        title: "Meta / Facebook 尚未连接",
        message: "连接 Facebook 后可以同步广告账户、Page、Pixel，并进入正式发布链路。",
        severity: "warning",
        actionHref: "/integrations?platform=META",
        createdAt: now
      });
    }

    if (!tiktokIntegrations) {
      items.push({
        id: "connect-tiktok",
        title: "TikTok 尚未连接",
        message: "完成 TikTok 授权后，可以同步广告账户和投放资产。",
        severity: "info",
        actionHref: "/integrations?platform=TIKTOK",
        createdAt: now
      });
    }

    if (!adAccountCount) {
      items.push({
        id: "sync-ad-accounts",
        title: "广告账户资产为空",
        message: "完成渠道授权后，请同步广告账户，控制面板才能展示账户余额和真实消耗。",
        severity: "warning",
        actionHref: "/ad-accounts",
        createdAt: now
      });
    }

    for (const run of failedSyncRuns) {
      items.push({
        id: `report-sync-${run.id}`,
        title: "报表同步失败",
        message: `${run.adAccount?.name ?? run.platform ?? "ALL"}：${run.message ?? "请检查渠道授权与账户权限"}`,
        severity: "danger",
        actionHref: "/dashboard",
        createdAt: run.createdAt
      });
    }

    for (const task of failedPublishTasks) {
      items.push({
        id: `publish-task-${task.id}`,
        title: "投放计划发布失败",
        message: `${task.campaign.name}：${task.errorMessage ?? "请进入投放草稿查看发布任务"}`,
        severity: "danger",
        actionHref: "/campaigns",
        createdAt: task.createdAt
      });
    }

    return items.slice(0, 10);
  }

  private audit(actorId: string, teamId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    return this.db.auditLog.create({
      data: {
        actorId,
        teamId,
        action,
        entityType: "report_sync",
        entityId,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
  }

  private toUserMessage(err: unknown, fallback: string) {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }
}

function addTotals(target: Totals, value: Totals) {
  target.spend = roundMoney(target.spend + value.spend);
  target.impressions += value.impressions;
  target.clicks += value.clicks;
  target.conversions += value.conversions;
  target.revenue = roundMoney(target.revenue + value.revenue);
}

function withRates(metric: Totals) {
  return {
    spend: roundMoney(metric.spend),
    impressions: metric.impressions,
    clicks: metric.clicks,
    conversions: metric.conversions,
    revenue: roundMoney(metric.revenue),
    ctr: ratio(metric.clicks, metric.impressions),
    cpc: metric.clicks ? roundMoney(metric.spend / metric.clicks) : 0,
    cpa: metric.conversions ? roundMoney(metric.spend / metric.conversions) : 0,
    roas: metric.spend ? round(metric.revenue / metric.spend, 2) : 0
  };
}

function dryRunMetric(campaignId: string, day: string, status: PublishStatus): Totals {
  const seed = hash(`${campaignId}:${day}`);
  const statusFactor = status === PublishStatus.PAUSED ? 0.35 : 1;
  const spend = roundMoney(((seed % 8400) / 100 + 12) * statusFactor);
  const impressions = Math.max(0, Math.round(spend * (90 + (seed % 130))));
  const clicks = Math.max(0, Math.round(impressions * (0.006 + (seed % 45) / 10000)));
  const conversions = Math.max(0, Math.floor(clicks * (0.025 + (seed % 12) / 1000)));
  const revenue = roundMoney(conversions * (24 + (seed % 76)));
  return { spend, impressions, clicks, conversions, revenue };
}

function metricFromMetaRow(row: MetaInsightRow): Totals {
  return {
    spend: money(row.spend),
    impressions: integer(row.impressions),
    clicks: integer(row.clicks),
    conversions: actionNumber(row.actions, [
      "purchase",
      "lead",
      "complete_registration",
      "offsite_conversion.fb_pixel_purchase",
      "offsite_conversion.fb_pixel_lead"
    ]),
    revenue: actionNumber(row.action_values, [
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "omni_purchase",
      "web_in_store_purchase"
    ])
  };
}

function normalizeTikTokReportRow(row: TikTokReportRawRow): NormalizedTikTokReportRow | null {
  const dimensions = row.dimensions ?? {};
  const metrics = row.metrics ?? {};
  const campaignId = stringFrom(dimensions.campaign_id ?? row.campaign_id);
  const date = normalizeDate(stringFrom(dimensions.stat_time_day ?? row.stat_time_day));
  if (!campaignId || !date) return null;

  return {
    campaignId,
    date,
    metric: {
      spend: money(metrics.spend ?? row.spend),
      impressions: integer(metrics.impressions ?? row.impressions),
      clicks: integer(metrics.clicks ?? row.clicks),
      conversions: integer(metrics.conversion ?? metrics.conversions ?? row.conversion ?? row.conversions),
      revenue: money(metrics.total_purchase_value ?? row.total_purchase_value)
    },
    raw: row
  };
}

function actionNumber(
  rows: Array<{ action_type?: string; value?: string | number }> | undefined,
  preferredActionTypes: string[]
) {
  if (!rows?.length) return 0;
  for (const type of preferredActionTypes) {
    const value = rows.find((row) => row.action_type === type)?.value;
    if (value != null) return integer(value);
  }
  return rows.reduce((sum, row) => sum + integer(row.value), 0);
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function money(value: unknown) {
  return roundMoney(Number(value ?? 0));
}

function integer(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? round((numerator / denominator) * 100, 2) : 0;
}

function roundMoney(value: number) {
  return round(value, 2);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new BadRequestException("Date must use YYYY-MM-DD");
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid date");
  return date;
}

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringFrom(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  const dateOnly = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function dominantCurrency(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function latestDate(values: Date[]) {
  const latest = values.reduce<Date | null>((current, value) => {
    if (!current || value.getTime() > current.getTime()) return value;
    return current;
  }, null);
  return latest;
}

function searchItem(id: string, type: string, title: string, description: string | null | undefined, href: string, updatedAt: Date) {
  return {
    id,
    type,
    title,
    description: description ?? "",
    href,
    updatedAt
  };
}

function workspaceModuleLabel(module: string) {
  const labels: Record<string, string> = {
    optimizer: "优化器",
    copilot: "Copilot",
    store: "店铺",
    tool: "工具",
    newsletter: "Newsletter",
    billing: "账单",
    "referral-link": "推荐链接",
    commission: "佣金",
    withdrawal: "提现",
    vcc: "虚拟卡"
  };
  return labels[module] ?? "工作区记录";
}

function workspaceModulePath(module: string) {
  const paths: Record<string, string> = {
    optimizer: "/optimizers",
    copilot: "/copilot",
    store: "/stores",
    tool: "/tools",
    newsletter: "/newsletter",
    billing: "/billings",
    "referral-link": "/referral-links",
    commission: "/commissions",
    withdrawal: "/withdrawals",
    vcc: "/vcc"
  };
  return paths[module] ?? "/dashboard";
}

function actionTitle(action: string) {
  if (action.includes("PUBLISH") && action.includes("FAILED")) return "发布任务失败";
  if (action.includes("PUBLISH")) return "发布链路更新";
  if (action.includes("REPORT") && action.includes("FAILED")) return "报表同步失败";
  if (action.includes("REPORT")) return "报表同步完成";
  if (action.includes("AUTOMATION")) return "规则自动化执行";
  if (action.includes("AI")) return "AI 助手事件";
  return "系统自动化日志";
}

function actionMessage(action: string) {
  if (action.includes("FAILED")) return "自动化动作执行失败，请进入相关模块查看详情。";
  if (action.includes("REPORT")) return "报表数据已写入看板，可用于投放分析。";
  if (action.includes("PUBLISH")) return "发布链路状态发生变化。";
  return "固定规则自动化留下的操作记录。";
}

function actionSeverity(action: string) {
  if (action.includes("FAILED")) return "danger";
  if (action.includes("SUCCEEDED") || action.includes("SYNCED")) return "success";
  return "info";
}

function providerErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message;
    if (typeof message === "string" && message.trim()) return message;

    const error = record.error;
    if (error && typeof error === "object") {
      const nestedMessage = (error as Record<string, unknown>).message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage;
    }
  }

  return fallback;
}
