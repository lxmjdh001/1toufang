import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Platform, PlatformAssetType, Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { FacebookAccountActionDto } from "./dto";

type MetricTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

type AccountMetric = MetricTotals & {
  spend7d: number;
  lastSpendDate?: Date;
  todaySpend: number;
};

type ResourceTab = {
  key: string;
  label: string;
  count: number;
};

@Injectable()
export class ChannelsService {
  constructor(private readonly db: DatabaseService) {}

  async facebook(user: AuthenticatedUser, statusParam?: string, resourceParam?: string) {
    const teamId = await this.resolveTeamId(user);
    const since7d = daysAgo(7);
    const todayKey = dateKey(new Date());
    const [
      integrations,
      adAccounts,
      assets,
      stats,
      campaigns,
      publishTasks,
      syncRuns,
      auditLogs
    ] = await Promise.all([
      this.db.integrationAccount.findMany({
        where: { teamId, platform: Platform.META },
        orderBy: { updatedAt: "desc" }
      }),
      this.db.adAccount.findMany({
        where: { teamId, platform: Platform.META },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      }),
      this.db.platformAsset.findMany({
        where: { teamId, platform: Platform.META },
        orderBy: [{ type: "asc" }, { updatedAt: "desc" }]
      }),
      this.db.accountDailyStat.findMany({
        where: { teamId, platform: Platform.META },
        orderBy: { date: "desc" }
      }),
      this.db.campaign.findMany({
        where: { teamId, platform: Platform.META },
        select: { id: true, config: true, status: true }
      }),
      this.db.publishTask.findMany({
        where: { teamId, platform: Platform.META },
        orderBy: { createdAt: "desc" },
        take: 30
      }),
      this.db.reportSyncRun.findMany({
        where: { teamId, platform: Platform.META },
        orderBy: { createdAt: "desc" },
        take: 12
      }),
      this.db.auditLog.findMany({
        where: { teamId, action: { startsWith: "FACEBOOK_CHANNEL_" } },
        orderBy: { createdAt: "desc" },
        take: 30
      })
    ]);

    const metricsByAccount = aggregateAccountStats(stats, since7d, todayKey);
    const campaignsByAccount = countCampaignsByAccount(campaigns);
    const pixelCountByAccount = countPixelsByAccount(assets);
    const businessManagers = assets.filter((asset) => asset.type === PlatformAssetType.BUSINESS_CENTER);
    const pages = assets.filter((asset) => asset.type === PlatformAssetType.FACEBOOK_PAGE);
    const pixels = assets.filter((asset) => asset.type === PlatformAssetType.PIXEL);
    const activeIntegration = integrations.find((row) => row.status === "active") ?? integrations[0];

    const accounts = adAccounts.map((account) => {
      const metric = metricsByAccount.get(account.id) ?? emptyAccountMetric();
      const statusView = facebookStatusView(account.status, metric.spend7d);
      const idleDays = accountIdleDays(account.createdAt, metric.lastSpendDate);
      return {
        id: account.id,
        name: account.name,
        accountId: account.externalId,
        user: activeIntegration?.name ?? "-",
        billing: account.balance == null ? "未同步" : "已同步",
        partner: businessManagers[0]?.name ?? "-",
        currency: account.currency ?? "-",
        ads: campaignsByAccount.get(account.id) ?? 0,
        idleDays,
        balance: money(account.balance),
        totalSpend: roundMoney(metric.spend),
        spend: roundMoney(metric.spend7d),
        timezone: account.timezone ?? "-",
        pixels: pixelCountByAccount.get(account.externalId) ?? pixels.length,
        removedAds: statusView === "pending_recycle" || statusView === "archived" ? campaignsByAccount.get(account.id) ?? 0 : 0,
        notes: account.status ?? "-",
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        rawStatus: account.status ?? "-",
        statusView
      };
    });

    const statusViews = [
      statusTab("all", "全部", accounts.length),
      statusTab("active", "激活", accounts.filter((row) => row.statusView === "active").length),
      statusTab("idle", "闲置", accounts.filter((row) => row.statusView === "idle").length),
      statusTab(
        "pending_recycle",
        "待回收",
        accounts.filter((row) => row.statusView === "pending_recycle").length
      ),
      statusTab("blocked", "封户", accounts.filter((row) => row.statusView === "blocked").length),
      statusTab("problem", "问题", accounts.filter((row) => row.statusView === "problem").length),
      statusTab("archived", "存档", accounts.filter((row) => row.statusView === "archived").length)
    ];

    const filteredAccounts =
      statusParam && statusParam !== "all" ? accounts.filter((row) => row.statusView === statusParam) : accounts;

    const resourceTabs: ResourceTab[] = [
      { key: "ad_accounts", label: "广告账户", count: adAccounts.length },
      { key: "groups", label: "组", count: countUniqueAccountGroups(campaigns) },
      { key: "business_managers", label: "BM", count: businessManagers.length },
      { key: "accounts", label: "账号", count: integrations.length },
      { key: "pages", label: "主页", count: pages.length },
      { key: "pixels", label: "像素", count: pixels.length },
      { key: "apps", label: "App", count: 0 },
      { key: "tasks", label: "任务", count: publishTasks.length + syncRuns.length },
      { key: "safety_rules", label: "安全规则", count: complianceIssues(accounts).length },
      { key: "ad_account_users", label: "广告账户用户", count: integrations.length },
      { key: "transactions", label: "交易记录", count: stats.length }
    ];

    return {
      connected: integrations.length > 0,
      overview: {
        walletBalance: roundMoney(accounts.reduce((sum, row) => sum + row.balance, 0)),
        accountBalance: roundMoney(accounts.reduce((sum, row) => sum + row.balance, 0)),
        totalSpend: roundMoney(accounts.reduce((sum, row) => sum + row.totalSpend, 0)),
        spend: roundMoney(accounts.reduce((sum, row) => sum + row.spend, 0)),
        sealedRate: accounts.length
          ? round((accounts.filter((row) => row.statusView === "blocked").length / accounts.length) * 100, 2)
          : 0,
        pendingRecycle: accounts.filter((row) => row.statusView === "pending_recycle").length,
        accounts: accounts.length
      },
      statusViews,
      resourceTabs,
      accounts: filteredAccounts,
      resources: facebookResources(resourceParam ?? "ad_accounts", accounts, integrations, assets, publishTasks, syncRuns, auditLogs, stats),
      complianceReport: complianceIssues(accounts),
      pendingRecycle: accounts.filter((row) => row.statusView === "pending_recycle"),
      transactions: transactionRows(stats, adAccounts),
      updatedAt: new Date().toISOString()
    };
  }

  async facebookAccountAction(id: string, dto: FacebookAccountActionDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const account = await this.db.adAccount.findFirst({ where: { id, teamId, platform: Platform.META } });
    if (!account) throw new NotFoundException("Facebook ad account not found");

    let updateData: Prisma.AdAccountUpdateInput = {};
    let result: Record<string, unknown> = { ok: true, action: dto.action };

    if (dto.action === "change_name" || dto.action === "edit") {
      if (!dto.name?.trim()) throw new BadRequestException("name is required");
      updateData = {
        name: dto.name.trim(),
        status: dto.status ?? account.status
      };
      result = { ...result, name: dto.name.trim(), status: dto.status ?? account.status };
    }

    if (dto.action === "check_compliance") {
      const statusView = facebookStatusView(account.status, 0);
      result = {
        ...result,
        complianceStatus: statusView === "blocked" || statusView === "problem" ? "risk" : "pass",
        message:
          statusView === "blocked" || statusView === "problem"
            ? "账户状态存在风险，请检查 BM、支付和账户限制。"
            : "本地同步状态未发现阻断项。"
      };
    }

    if (dto.action === "force_clear") {
      updateData = { status: "force_cleared" };
      result = { ...result, status: "force_cleared" };
    }

    if (dto.action === "remove") {
      updateData = { status: "pending_recycle" };
      result = { ...result, status: "pending_recycle" };
    }

    if (dto.action === "switch_facebook") {
      updateData = { status: "switch_pending" };
      result = { ...result, status: "switch_pending" };
    }

    if (dto.action === "charge") {
      if (dto.amount == null || dto.amount <= 0) throw new BadRequestException("amount is required");
      result = { ...result, amount: dto.amount, status: "charge_recorded" };
    }

    if (dto.action === "archive") {
      updateData = { status: "archived" };
      result = { ...result, status: "archived" };
    }

    if (dto.action === "pending_recycle") {
      updateData = { status: "pending_recycle" };
      result = { ...result, status: "pending_recycle" };
    }

    const nextAccount = Object.keys(updateData).length
      ? await this.db.adAccount.update({ where: { id: account.id }, data: updateData })
      : account;

    await this.audit(user.id, teamId, `FACEBOOK_CHANNEL_${dto.action.toUpperCase()}`, account.id, {
      externalId: account.externalId,
      name: nextAccount.name,
      notes: dto.notes,
      amount: dto.amount,
      result
    });

    return { account: nextAccount, result };
  }

  async tiktok(user: AuthenticatedUser, resourceParam?: string) {
    const teamId = await this.resolveTeamId(user);
    const [integrations, adAccounts, assets, campaigns, publishTasks, syncRuns] = await Promise.all([
      this.db.integrationAccount.findMany({
        where: { teamId, platform: Platform.TIKTOK },
        orderBy: { updatedAt: "desc" }
      }),
      this.db.adAccount.findMany({
        where: { teamId, platform: Platform.TIKTOK },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      }),
      this.db.platformAsset.findMany({
        where: { teamId, platform: Platform.TIKTOK },
        orderBy: [{ type: "asc" }, { updatedAt: "desc" }]
      }),
      this.db.campaign.findMany({
        where: { teamId, platform: Platform.TIKTOK },
        select: { id: true, status: true }
      }),
      this.db.publishTask.findMany({
        where: { teamId, platform: Platform.TIKTOK },
        orderBy: { createdAt: "desc" },
        take: 30
      }),
      this.db.reportSyncRun.findMany({
        where: { teamId, platform: Platform.TIKTOK },
        orderBy: { createdAt: "desc" },
        take: 12
      })
    ]);

    const advertiserAssets = assets.filter((asset) => asset.type === PlatformAssetType.TIKTOK_ADVERTISER);
    const businessCenters = assets.filter((asset) => asset.type === PlatformAssetType.BUSINESS_CENTER);
    const catalogs = assets.filter((asset) => asset.type === PlatformAssetType.CATALOG);
    const feeds = assets.filter((asset) => asset.type === PlatformAssetType.PRODUCT_FEED);
    const apps = assets.filter((asset) => asset.type === PlatformAssetType.TIKTOK_APP);
    const products = productResourcesFromFeeds(feeds);
    const resource = resourceParam ?? "advertisers";

    const resourceTabs: ResourceTab[] = [
      { key: "accounts", label: "Accounts", count: integrations.length },
      { key: "business_centers", label: "Business Centers", count: businessCenters.length },
      { key: "advertisers", label: "Advertisers", count: Math.max(adAccounts.length, advertiserAssets.length) },
      { key: "catalogs", label: "Catalogs", count: catalogs.length },
      { key: "feeds", label: "Feeds", count: feeds.length },
      { key: "products", label: "Products", count: products.length },
      { key: "apps", label: "Apps", count: apps.length }
    ];

    return {
      connected: integrations.length > 0,
      overview: {
        accounts: integrations.length,
        businessCenters: businessCenters.length,
        advertisers: Math.max(adAccounts.length, advertiserAssets.length),
        catalogs: catalogs.length,
        feeds: feeds.length,
        products: products.length,
        apps: apps.length,
        campaigns: campaigns.length,
        tasks: publishTasks.length + syncRuns.length
      },
      resourceTabs,
      resources: tiktokResources(resource, integrations, adAccounts, assets, products),
      fieldOptions: [
        { key: "type", label: "类型" },
        { key: "name", label: "名称" },
        { key: "externalId", label: "外部 ID" },
        { key: "status", label: "状态" },
        { key: "currency", label: "币种" },
        { key: "timezone", label: "时区" },
        { key: "updatedAt", label: "更新时间" },
        { key: "metadata", label: "元数据" }
      ],
      tasks: [
        ...publishTasks.map((task) => ({
          id: task.id,
          type: "publish",
          name: task.campaignId,
          status: task.status,
          updatedAt: task.updatedAt
        })),
        ...syncRuns.map((run) => ({
          id: run.id,
          type: "report_sync",
          name: `${run.source}:${run.rangeStart.toISOString().slice(0, 10)}~${run.rangeEnd.toISOString().slice(0, 10)}`,
          status: run.status,
          updatedAt: run.updatedAt
        }))
      ],
      updatedAt: new Date().toISOString()
    };
  }

  private async resolveTeamId(user: AuthenticatedUser) {
    if (user.teamId) return user.teamId;

    const membership = await this.db.teamMember.findFirst({
      where: { userId: user.id, status: TeamMemberStatus.ACTIVE },
      orderBy: { createdAt: "asc" }
    });
    if (!membership) throw new BadRequestException("User does not belong to a team");
    return membership.teamId;
  }

  private audit(actorId: string, teamId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    return this.db.auditLog.create({
      data: {
        actorId,
        teamId,
        action,
        entityType: "channel",
        entityId,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
  }
}

function emptyTotals(): MetricTotals {
  return { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
}

function emptyAccountMetric(): AccountMetric {
  return { ...emptyTotals(), spend7d: 0, todaySpend: 0 };
}

function aggregateAccountStats(
  stats: Array<{
    adAccountId: string;
    date: Date;
    spend: Prisma.Decimal;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: Prisma.Decimal;
  }>,
  since7d: Date,
  today: string
) {
  const metrics = new Map<string, AccountMetric>();
  for (const row of stats) {
    const current = metrics.get(row.adAccountId) ?? emptyAccountMetric();
    const spend = money(row.spend);
    current.spend = roundMoney(current.spend + spend);
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.conversions += row.conversions;
    current.revenue = roundMoney(current.revenue + money(row.revenue));
    if (row.date >= since7d) current.spend7d = roundMoney(current.spend7d + spend);
    if (dateKey(row.date) === today) current.todaySpend = roundMoney(current.todaySpend + spend);
    if (spend > 0 && (!current.lastSpendDate || row.date > current.lastSpendDate)) current.lastSpendDate = row.date;
    metrics.set(row.adAccountId, current);
  }
  return metrics;
}

function countCampaignsByAccount(campaigns: Array<{ config: Prisma.JsonValue }>) {
  const counts = new Map<string, number>();
  for (const campaign of campaigns) {
    const adAccountId = stringValue(recordValue(campaign.config).adAccountId);
    if (adAccountId) counts.set(adAccountId, (counts.get(adAccountId) ?? 0) + 1);
  }
  return counts;
}

function countUniqueAccountGroups(campaigns: Array<{ config: Prisma.JsonValue }>) {
  const values = new Set<string>();
  for (const campaign of campaigns) {
    const config = recordValue(campaign.config);
    const project = stringValue(config.project);
    if (project) values.add(project);
    for (const tag of arrayValue(config.tags)) {
      if (typeof tag === "string" && tag.trim()) values.add(tag.trim());
    }
  }
  return values.size;
}

function countPixelsByAccount(assets: Array<{ type: PlatformAssetType; metadata: Prisma.JsonValue; externalId: string }>) {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    if (asset.type !== PlatformAssetType.PIXEL) continue;
    const adAccountExternalId = stringValue(recordValue(asset.metadata).adAccountExternalId);
    if (!adAccountExternalId) continue;
    counts.set(adAccountExternalId, (counts.get(adAccountExternalId) ?? 0) + 1);
  }
  return counts;
}

function facebookStatusView(status: string | null | undefined, spend7d: number) {
  const normalized = (status ?? "").toLowerCase();
  if (["archived", "archive"].includes(normalized)) return "archived";
  if (normalized.includes("pending_recycle") || normalized.includes("recycle") || normalized.includes("removed")) {
    return "pending_recycle";
  }
  if (
    normalized.includes("disabled") ||
    normalized.includes("blocked") ||
    normalized.includes("closed") ||
    normalized.includes("deactivated") ||
    normalized === "2"
  ) {
    return "blocked";
  }
  if (
    normalized.includes("problem") ||
    normalized.includes("failed") ||
    normalized.includes("error") ||
    ["3", "7", "8", "9", "100"].includes(normalized)
  ) {
    return "problem";
  }
  if (spend7d <= 0) return "idle";
  return "active";
}

function statusTab(key: string, label: string, count: number) {
  return { key, label, count };
}

function accountIdleDays(createdAt: Date, lastSpendDate?: Date) {
  const base = lastSpendDate ?? createdAt;
  return Math.max(0, Math.floor((Date.now() - base.getTime()) / 86_400_000));
}

function complianceIssues(accounts: Array<{ id: string; name: string; accountId: string; statusView: string; rawStatus: string }>) {
  return accounts
    .filter((account) => ["blocked", "problem", "pending_recycle"].includes(account.statusView))
    .map((account) => ({
      id: account.id,
      accountId: account.accountId,
      name: account.name,
      severity: account.statusView === "blocked" ? "danger" : "warning",
      status: account.statusView,
      message:
        account.statusView === "blocked"
          ? "账户疑似被封或被禁用"
          : account.statusView === "pending_recycle"
            ? "账户已进入待回收队列"
            : "账户状态需要人工复核",
      rawStatus: account.rawStatus
    }));
}

function transactionRows(
  stats: Array<{ id: string; adAccountId: string; date: Date; spend: Prisma.Decimal; currency: string | null; syncedAt: Date }>,
  accounts: Array<{ id: string; name: string; externalId: string }>
) {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  return stats.slice(0, 100).map((row) => {
    const account = accountsById.get(row.adAccountId);
    return {
      id: row.id,
      type: "spend",
      accountId: account?.externalId ?? row.adAccountId,
      accountName: account?.name ?? "-",
      amount: roundMoney(money(row.spend)),
      currency: row.currency ?? "-",
      date: row.date,
      syncedAt: row.syncedAt
    };
  });
}

function facebookResources(
  resource: string,
  accounts: Array<Record<string, unknown>>,
  integrations: Array<Record<string, unknown>>,
  assets: Array<Record<string, unknown>>,
  publishTasks: Array<Record<string, unknown>>,
  syncRuns: Array<Record<string, unknown>>,
  auditLogs: Array<Record<string, unknown>>,
  stats: Array<Record<string, unknown>>
) {
  if (resource === "accounts") return integrations.map(channelResource("账号"));
  if (resource === "business_managers") return assets.filter((row) => row.type === PlatformAssetType.BUSINESS_CENTER).map(channelResource("BM"));
  if (resource === "pages") return assets.filter((row) => row.type === PlatformAssetType.FACEBOOK_PAGE).map(channelResource("主页"));
  if (resource === "pixels") return assets.filter((row) => row.type === PlatformAssetType.PIXEL).map(channelResource("像素"));
  if (resource === "tasks") {
    return [
      ...publishTasks.map(channelResource("发布任务")),
      ...syncRuns.map(channelResource("同步任务")),
      ...auditLogs.map(channelResource("操作任务"))
    ];
  }
  if (resource === "safety_rules") {
    return accounts
      .filter((row) => row.statusView === "blocked" || row.statusView === "problem")
      .map((row) => ({
        id: row.id,
        type: "安全规则",
        name: row.name,
        externalId: row.accountId,
        status: row.statusView,
        updatedAt: row.updatedAt,
        metadata: row.rawStatus
      }));
  }
  if (resource === "ad_account_users") return integrations.map(channelResource("广告账户用户"));
  if (resource === "transactions") return stats.map(channelResource("交易记录")).slice(0, 100);
  if (resource === "groups") {
    return accounts.map((row) => ({
      id: row.id,
      type: "组",
      name: row.partner ?? "默认账户组",
      externalId: row.accountId,
      status: row.statusView,
      updatedAt: row.updatedAt,
      metadata: row.notes
    }));
  }
  if (resource === "apps") return [];
  return accounts.map((row) => ({
    id: row.id,
    type: "广告账户",
    name: row.name,
    externalId: row.accountId,
    status: row.statusView,
    updatedAt: row.updatedAt,
    metadata: row.notes
  }));
}

function tiktokResources(
  resource: string,
  integrations: Array<Record<string, unknown>>,
  adAccounts: Array<Record<string, unknown>>,
  assets: Array<Record<string, unknown>>,
  products: Array<Record<string, unknown>>
) {
  if (resource === "accounts") return integrations.map(channelResource("Account"));
  if (resource === "business_centers") return assets.filter((row) => row.type === PlatformAssetType.BUSINESS_CENTER).map(channelResource("Business Center"));
  if (resource === "catalogs") return assets.filter((row) => row.type === PlatformAssetType.CATALOG).map(channelResource("Catalog"));
  if (resource === "feeds") return assets.filter((row) => row.type === PlatformAssetType.PRODUCT_FEED).map(channelResource("Feed"));
  if (resource === "products") return products.map(channelResource("Product"));
  if (resource === "apps") return assets.filter((row) => row.type === PlatformAssetType.TIKTOK_APP).map(channelResource("App"));
  const advertiserAssets = assets.filter((row) => row.type === PlatformAssetType.TIKTOK_ADVERTISER);
  return (advertiserAssets.length ? advertiserAssets : adAccounts).map(channelResource("Advertiser"));
}

function channelResource(type: string) {
  return (row: Record<string, unknown>) => ({
    id: stringValue(row.id) ?? stringValue(row.externalId) ?? cryptoRandomFallback(),
    type,
    name: stringValue(row.name) ?? stringValue(row.scope) ?? "-",
    externalId: stringValue(row.externalId) ?? stringValue(row.id) ?? "-",
    status: stringValue(row.status) ?? "-",
    currency: stringValue(row.currency),
    timezone: stringValue(row.timezone),
    updatedAt: row.updatedAt ?? row.lastSyncedAt ?? row.createdAt,
    metadata: summarizeMetadata(row.metadata ?? row.payload ?? row.result ?? row.errorMessage)
  });
}

function productResourcesFromFeeds(feeds: Array<{ id: string; name: string; externalId: string; metadata: Prisma.JsonValue; updatedAt: Date }>) {
  return feeds.flatMap((feed) => {
    const metadata = recordValue(feed.metadata);
    const products = arrayValue(metadata.products);
    if (products.length) {
      return products.map((product, index) => {
        const productRecord = recordValue(product);
        return {
          id: `${feed.id}:${stringValue(productRecord.id) ?? index}`,
          type: "Product",
          name: stringValue(productRecord.name) ?? `${feed.name} Product ${index + 1}`,
          externalId: stringValue(productRecord.id) ?? `${feed.externalId}:${index + 1}`,
          status: stringValue(productRecord.status) ?? "synced",
          updatedAt: feed.updatedAt,
          metadata: summarizeMetadata(productRecord)
        };
      });
    }
    const count = Number(metadata.product_count ?? metadata.products_count ?? 0);
    return Array.from({ length: Number.isFinite(count) ? Math.min(count, 50) : 0 }, (_, index) => ({
      id: `${feed.id}:product:${index + 1}`,
      type: "Product",
      name: `${feed.name} Product ${index + 1}`,
      externalId: `${feed.externalId}:${index + 1}`,
      status: "synced",
      updatedAt: feed.updatedAt,
      metadata: `Feed ${feed.externalId}`
    }));
  });
}

function summarizeMetadata(value: unknown) {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  const record = recordValue(value);
  const pairs = Object.entries(record).slice(0, 4);
  if (!pairs.length) return undefined;
  return pairs.map(([key, item]) => `${key}: ${typeof item === "object" ? "[object]" : String(item)}`).join(" / ");
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  value.setHours(0, 0, 0, 0);
  return value;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function cryptoRandomFallback() {
  return Math.random().toString(36).slice(2);
}
