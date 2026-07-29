import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AdAccount,
  AdCreative,
  Campaign,
  IntegrationAccount,
  Platform,
  PlatformObjectType,
  Prisma,
  PublishStatus,
  PublishTaskStatus,
  Strategy,
  Targeting,
  TeamMemberStatus
} from "@1toufang/database/client";
import { SecretCryptoService } from "../common/crypto/secret-crypto.service";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";

type CampaignConfig = {
  adAccountId?: string;
  strategyId?: string;
  targetingId?: string;
  adCreativeId?: string;
  creativeId?: string;
  pageAssetId?: string;
  landingPageId?: string;
  offerId?: string;
  adSetupMode?: string;
  existingPostId?: string;
  budget?: number;
  notes?: string;
  objective?: string;
  objective_type?: string;
  specialAdCategories?: string[];
  budgetMode?: string;
  destinationUrl?: string;
  linkUrl?: string;
  landingPageUrl?: string;
  pageId?: string;
  pixelId?: string;
  adSet?: Record<string, unknown>;
  adGroup?: Record<string, unknown>;
  creative?: Record<string, unknown>;
  ad?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  tiktok?: Record<string, unknown>;
};

type PublishContext = {
  campaign: Campaign;
  config: CampaignConfig;
  adAccount: AdAccount;
  strategy: Strategy | null;
  targeting: Targeting | null;
  creative: AdCreative | null;
  integration: IntegrationAccount | null;
  accessToken: string | null;
  dryRun: boolean;
};

type PublishedObjectResult = {
  objectType: PlatformObjectType;
  localKey: string;
  externalId: string;
  name?: string | null;
  raw: Record<string, unknown>;
};

type ProviderPublishResult = {
  platformCampaignId: string;
  objects: PublishedObjectResult[];
  raw: Record<string, unknown>;
};

type TikTokCreateResponse = {
  code?: number | string;
  message?: string;
  data?: Record<string, unknown>;
  dryRun?: boolean;
  endpoint?: string;
  payload?: Record<string, unknown>;
};

type PublishPreflightIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

type PublishPreflightResult = {
  ready: boolean;
  dryRun: boolean;
  platform: Platform;
  issues: PublishPreflightIssue[];
};

@Injectable()
export class PublisherService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly secretCrypto: SecretCryptoService
  ) {}

  async publishCampaign(campaignId: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const campaign = await this.db.campaign.findFirst({ where: { id: campaignId, teamId } });
    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.status === PublishStatus.CREATING) {
      throw new BadRequestException("Campaign is already publishing");
    }
    const preflight = await this.preflightForCampaign(campaign);
    if (!preflight.ready) {
      throw new BadRequestException({
        code: "publish_preflight_failed",
        message: "发布预检未通过",
        issues: preflight.issues
      });
    }

    const dryRun = this.isDryRun();
    const task = await this.db.publishTask.create({
      data: {
        teamId,
        campaignId,
        platform: campaign.platform,
        status: PublishTaskStatus.PENDING,
        requestedById: user.id,
        payload: {
          dryRun,
          campaignId,
          config: campaign.config
        } as Prisma.InputJsonValue
      }
    });

    await this.db.campaign.update({
      where: { id: campaignId },
      data: { status: PublishStatus.CREATING }
    });

    await this.audit(user.id, teamId, "PUBLISH_TASK_CREATED", campaignId, {
      taskId: task.id,
      platform: campaign.platform,
      dryRun
    });

    return this.processTask(task.id);
  }

  async listTasks(campaignId: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const campaign = await this.db.campaign.findFirst({ where: { id: campaignId, teamId } });
    if (!campaign) throw new NotFoundException("Campaign not found");

    return this.db.publishTask.findMany({
      where: { campaignId, teamId },
      orderBy: { createdAt: "desc" },
      take: 20
    });
  }

  async preflightCampaign(campaignId: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const campaign = await this.db.campaign.findFirst({ where: { id: campaignId, teamId } });
    if (!campaign) throw new NotFoundException("Campaign not found");
    return this.preflightForCampaign(campaign);
  }

  private async preflightForCampaign(campaign: Campaign): Promise<PublishPreflightResult> {
    const context = await this.buildContext(campaign);
    const issues: PublishPreflightIssue[] = [];
    const realMode = !context.dryRun;

    if (context.dryRun) {
      issues.push({
        severity: "warning",
        code: "dry_run_enabled",
        message: "当前 PUBLISH_DRY_RUN=true，本次发布不会调用官方 API"
      });
    }

    if (!context.accessToken) {
      issues.push({
        severity: realMode ? "error" : "warning",
        code: "missing_oauth_token",
        message: `${campaign.platform} 缺少 OAuth 授权 token`
      });
    }

    if (campaign.platform === Platform.META) {
      this.validateMetaPreflight(context, issues, realMode);
    } else {
      this.validateTikTokPreflight(context, issues, realMode);
    }

    return {
      ready: !issues.some((issue) => issue.severity === "error"),
      dryRun: context.dryRun,
      platform: campaign.platform,
      issues
    };
  }

  private async processTask(taskId: string) {
    const task = await this.db.publishTask.findUnique({
      where: { id: taskId },
      include: { campaign: true }
    });
    if (!task) throw new NotFoundException("Publish task not found");

    await this.db.publishTask.update({
      where: { id: taskId },
      data: {
        status: PublishTaskStatus.RUNNING,
        attempts: { increment: 1 },
        startedAt: new Date(),
        errorMessage: null
      }
    });

    try {
      const context = await this.buildContext(task.campaign);
      const result =
        task.platform === Platform.META
          ? await this.publishMetaCampaign(context)
          : await this.publishTikTokCampaign(context);

      for (const object of result.objects) {
        await this.db.platformIdMapping.upsert({
          where: {
            campaignId_objectType_localKey: {
              campaignId: task.campaignId,
              objectType: object.objectType,
              localKey: object.localKey
            }
          },
          create: {
            teamId: task.teamId,
            campaignId: task.campaignId,
            platform: task.platform,
            objectType: object.objectType,
            localKey: object.localKey,
            externalId: object.externalId,
            name: object.name ?? task.campaign.name,
            metadata: object.raw as Prisma.InputJsonValue
          },
          update: {
            externalId: object.externalId,
            name: object.name ?? task.campaign.name,
            metadata: object.raw as Prisma.InputJsonValue
          }
        });
      }

      const updatedTask = await this.db.publishTask.update({
        where: { id: taskId },
        data: {
          status: PublishTaskStatus.SUCCEEDED,
          result: result.raw as Prisma.InputJsonValue,
          finishedAt: new Date()
        }
      });

      await this.db.campaign.update({
        where: { id: task.campaignId },
        data: { status: PublishStatus.PUBLISHED }
      });

      await this.audit(task.requestedById, task.teamId, "PUBLISH_TASK_SUCCEEDED", task.campaignId, {
        taskId,
        platform: task.platform,
        dryRun: context.dryRun,
        platformCampaignId: result.platformCampaignId,
        objects: result.objects.map((object) => ({
          objectType: object.objectType,
          localKey: object.localKey,
          externalId: object.externalId
        }))
      });

      return updatedTask;
    } catch (err) {
      const message = this.toUserMessage(err, "Campaign 发布失败");
      const updatedTask = await this.db.publishTask.update({
        where: { id: taskId },
        data: {
          status: PublishTaskStatus.FAILED,
          errorMessage: message,
          finishedAt: new Date()
        }
      });

      await this.db.campaign.update({
        where: { id: task.campaignId },
        data: { status: PublishStatus.FAILED }
      });

      await this.audit(task.requestedById, task.teamId, "PUBLISH_TASK_FAILED", task.campaignId, {
        taskId,
        platform: task.platform,
        message
      });

      return updatedTask;
    }
  }

  private async buildContext(campaign: Campaign): Promise<PublishContext> {
    const config = await this.resolveDeliveryConfig(campaign, asCampaignConfig(campaign.config));
    if (!config.adAccountId) throw new BadRequestException("Campaign 缺少广告账户");

    const adAccount = await this.db.adAccount.findFirst({
      where: {
        id: config.adAccountId,
        teamId: campaign.teamId,
        platform: campaign.platform
      }
    });
    if (!adAccount) throw new BadRequestException("广告账户不存在或平台不匹配");

    const strategy = config.strategyId
      ? await this.db.strategy.findFirst({
          where: { id: config.strategyId, teamId: campaign.teamId, platform: campaign.platform }
        })
      : null;
    const targeting = config.targetingId
      ? await this.db.targeting.findFirst({
          where: { id: config.targetingId, teamId: campaign.teamId, platform: campaign.platform }
        })
      : null;
    const creativeId = config.adCreativeId ?? config.creativeId;
    const creative = creativeId
      ? await this.db.adCreative.findFirst({
          where: { id: creativeId, teamId: campaign.teamId }
        })
      : null;
    if (creativeId && !creative) {
      throw new BadRequestException("创意不存在或不属于当前团队");
    }
    const integration = await this.db.integrationAccount.findFirst({
      where: {
        teamId: campaign.teamId,
        platform: campaign.platform,
        status: "active",
        accessTokenEncrypted: { not: null }
      },
      orderBy: { updatedAt: "desc" }
    });
    const dryRun = this.isDryRun();

    return {
      campaign,
      config,
      adAccount,
      strategy,
      targeting,
      creative,
      integration,
      accessToken: integration?.accessTokenEncrypted ? this.secretCrypto.decrypt(integration.accessTokenEncrypted) : null,
      dryRun
    };
  }

  private async resolveDeliveryConfig(campaign: Campaign, config: CampaignConfig): Promise<CampaignConfig> {
    const resolved = { ...config };

    if (resolved.pageAssetId && !resolved.pageId && campaign.platform === Platform.META) {
      const page = await this.db.platformAsset.findFirst({
        where: {
          id: resolved.pageAssetId,
          teamId: campaign.teamId,
          platform: campaign.platform,
          type: "FACEBOOK_PAGE"
        }
      });
      if (page) {
        resolved.pageId = page.externalId;
      }
    }

    if (resolved.landingPageId && !resolved.landingPageUrl && !resolved.destinationUrl && !resolved.linkUrl) {
      const landingPage = await this.db.landingPage.findFirst({
        where: { id: resolved.landingPageId, teamId: campaign.teamId }
      });
      if (landingPage) {
        resolved.landingPageUrl = landingPage.url;
        resolved.destinationUrl = landingPage.url;
        resolved.linkUrl = landingPage.url;
      }
    }

    if (resolved.offerId && !resolved.destinationUrl && !resolved.linkUrl) {
      const offer = await this.db.offer.findFirst({
        where: { id: resolved.offerId, teamId: campaign.teamId }
      });
      if (offer) {
        resolved.destinationUrl = offer.url;
        resolved.linkUrl = offer.url;
      }
    }

    return resolved;
  }

  private async publishMetaCampaign(context: PublishContext): Promise<ProviderPublishResult> {
    const version = this.config.get<string>("META_GRAPH_VERSION") ?? "v25.0";
    const apiBaseUrl = this.config.get<string>("META_API_BASE_URL") ?? "https://graph.facebook.com";
    const accountId = context.adAccount.externalId.startsWith("act_")
      ? context.adAccount.externalId
      : `act_${context.adAccount.externalId}`;
    const campaignPayload = {
      name: context.campaign.name,
      objective: context.config.objective ?? strategyValue(context.strategy, "objective") ?? "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: context.config.specialAdCategories ?? []
    };
    const campaign = await this.postMetaObject<{ id?: string }>(
      context,
      new URL(`/${version}/${accountId}/campaigns`, apiBaseUrl).toString(),
      `/${version}/${accountId}/campaigns`,
      campaignPayload
    );
    const campaignId = this.requireProviderId(campaign.id, "Meta 未返回 Campaign ID");

    const adSetPayload = this.buildMetaAdSetPayload(context, campaignId);
    const adSet = await this.postMetaObject<{ id?: string }>(
      context,
      new URL(`/${version}/${accountId}/adsets`, apiBaseUrl).toString(),
      `/${version}/${accountId}/adsets`,
      adSetPayload
    );
    const adSetId = this.requireProviderId(adSet.id, "Meta 未返回 Ad Set ID");

    const creativePayload = this.buildMetaCreativePayload(context);
    const creative = await this.postMetaObject<{ id?: string }>(
      context,
      new URL(`/${version}/${accountId}/adcreatives`, apiBaseUrl).toString(),
      `/${version}/${accountId}/adcreatives`,
      creativePayload
    );
    const creativeId = this.requireProviderId(creative.id, "Meta 未返回 Creative ID");

    const adPayload = this.buildMetaAdPayload(context, adSetId, creativeId);
    const ad = await this.postMetaObject<{ id?: string }>(
      context,
      new URL(`/${version}/${accountId}/ads`, apiBaseUrl).toString(),
      `/${version}/${accountId}/ads`,
      adPayload
    );
    const adId = this.requireProviderId(ad.id, "Meta 未返回 Ad ID");

    const objects: PublishedObjectResult[] = [
      this.publishedObject(PlatformObjectType.CAMPAIGN, "campaign", campaignId, context.campaign.name, campaign),
      this.publishedObject(PlatformObjectType.AD_SET, "ad_set:default", adSetId, `${context.campaign.name} Ad Set`, adSet),
      this.publishedObject(PlatformObjectType.CREATIVE, "creative:default", creativeId, `${context.campaign.name} Creative`, creative),
      this.publishedObject(PlatformObjectType.AD, "ad:default", adId, `${context.campaign.name} Ad`, ad)
    ];

    return {
      platformCampaignId: campaignId,
      objects,
      raw: {
        campaign,
        adSet,
        creative,
        ad
      }
    };
  }

  private async publishTikTokCampaign(context: PublishContext): Promise<ProviderPublishResult> {
    const apiBaseUrl = this.config.get<string>("TIKTOK_API_BASE_URL") ?? "https://business-api.tiktok.com";
    const campaignPayload: Record<string, unknown> = {
      advertiser_id: context.adAccount.externalId,
      campaign_name: context.campaign.name,
      objective_type:
        context.config.objective_type ??
        context.config.objective ??
        strategyValue(context.strategy, "objective_type") ??
        strategyValue(context.strategy, "objective") ??
        "TRAFFIC",
      budget_mode: context.config.budgetMode ?? strategyValue(context.strategy, "budget_mode") ?? "BUDGET_MODE_DAY"
    };

    if (typeof context.config.budget === "number") {
      campaignPayload.budget = context.config.budget;
    }

    const campaign = await this.postTikTokObject<TikTokCreateResponse>(
      context,
      new URL("/open_api/v1.3/campaign/create/", apiBaseUrl).toString(),
      "/open_api/v1.3/campaign/create/",
      campaignPayload
    );
    const campaignId = this.requireProviderId(extractTikTokId(campaign.data, "campaign_id"), "TikTok 未返回 Campaign ID");

    const adGroupPayload = this.buildTikTokAdGroupPayload(context, campaignId);
    const adGroup = await this.postTikTokObject<TikTokCreateResponse>(
      context,
      new URL("/open_api/v1.3/adgroup/create/", apiBaseUrl).toString(),
      "/open_api/v1.3/adgroup/create/",
      adGroupPayload
    );
    const adGroupId = this.requireProviderId(extractTikTokId(adGroup.data, "adgroup_id"), "TikTok 未返回 Ad Group ID");

    const adPayload = this.buildTikTokAdPayload(context, adGroupId);
    const ad = await this.postTikTokObject<TikTokCreateResponse>(
      context,
      new URL("/open_api/v1.3/ad/create/", apiBaseUrl).toString(),
      "/open_api/v1.3/ad/create/",
      adPayload
    );
    const adId = this.requireProviderId(extractTikTokId(ad.data, "ad_id", "ad_ids"), "TikTok 未返回 Ad ID");
    const creativeId = extractTikTokId(ad.data, "creative_id", "creative_ids") ?? `ad:${adId}:creative`;

    const objects: PublishedObjectResult[] = [
      this.publishedObject(PlatformObjectType.CAMPAIGN, "campaign", campaignId, context.campaign.name, campaign),
      this.publishedObject(PlatformObjectType.AD_GROUP, "ad_group:default", adGroupId, `${context.campaign.name} Ad Group`, adGroup),
      this.publishedObject(PlatformObjectType.CREATIVE, "creative:default", creativeId, `${context.campaign.name} Creative`, ad),
      this.publishedObject(PlatformObjectType.AD, "ad:default", adId, `${context.campaign.name} Ad`, ad)
    ];

    return {
      platformCampaignId: campaignId,
      objects,
      raw: {
        campaign,
        adGroup,
        ad
      }
    };
  }

  private buildMetaAdSetPayload(context: PublishContext, campaignId: string) {
    const config = asRecord(context.config);
    const adSetOverrides = mergeRecords(
      recordValue(context.config.adSet),
      recordValue(context.config.meta?.adSet),
      recordValue(context.config.meta?.adset),
      recordValue(strategyRecord(context.strategy, "adSet")),
      recordValue(strategyRecord(context.strategy, "metaAdSet"))
    );
    const targeting = mergeRecords(
      { geo_locations: { countries: ["US"] }, age_min: 18, age_max: 65 },
      recordValue(context.targeting?.config),
      recordValue(targetingRecord(context.targeting, "targeting")),
      recordValue(targetingRecord(context.targeting, "metaTargeting")),
      recordValue(config.targeting)
    );
    const promotedObject = mergeRecords(
      context.config.pixelId ? { pixel_id: context.config.pixelId, custom_event_type: "PURCHASE" } : {},
      recordValue(context.config.meta?.promotedObject),
      recordValue(config.promotedObject)
    );

    return mergeRecords(
      {
        name: `${context.campaign.name} Ad Set`,
        campaign_id: campaignId,
        billing_event: strategyValue(context.strategy, "billing_event") ?? "IMPRESSIONS",
        optimization_goal: strategyValue(context.strategy, "optimization_goal") ?? "LINK_CLICKS",
        bid_strategy: strategyValue(context.strategy, "bid_strategy") ?? "LOWEST_COST_WITHOUT_CAP",
        daily_budget: String(Math.max(100, Math.round((context.config.budget ?? 20) * 100))),
        status: "PAUSED",
        targeting,
        ...(Object.keys(promotedObject).length ? { promoted_object: promotedObject } : {})
      },
      adSetOverrides
    );
  }

  private validateMetaPreflight(
    context: PublishContext,
    issues: PublishPreflightIssue[],
    realMode: boolean
  ) {
    const creativeConfig = asRecord(context.creative?.config);
    const config = asRecord(context.config);
    const creativeOverrides = mergeRecords(
      recordValue(context.config.creative),
      recordValue(context.config.meta?.creative),
      recordValue(creativeConfig.metaCreative)
    );
    const objectStorySpec =
      recordValue(creativeOverrides.object_story_spec) ??
      recordValue(creativeOverrides.objectStorySpec) ??
      recordValue(creativeConfig.object_story_spec) ??
      recordValue(creativeConfig.objectStorySpec);
    const existingPostId =
      stringValue(context.config.existingPostId) ??
      stringValue(config.existingPostId) ??
      stringValue(config.existing_post_id);
    const pageId = stringValue(context.config.pageId) ?? stringValue(config.page_id) ?? stringValue(creativeConfig.pageId);
    const link =
      stringValue(context.config.destinationUrl) ??
      stringValue(context.config.linkUrl) ??
      stringValue(context.config.landingPageUrl) ??
      stringValue(creativeConfig.destinationUrl) ??
      stringValue(creativeConfig.linkUrl) ??
      stringValue(creativeConfig.landingPageUrl);
    const severity = realMode ? "error" : "warning";

    if (existingPostId) return;

    if (!context.creative && !objectStorySpec && (!pageId || !link)) {
      issues.push({
        severity,
        code: "missing_meta_creative",
        message: "Meta 发布需要绑定创意，或在 Campaign/创意配置中提供 object_story_spec"
      });
    }
    if (!objectStorySpec && !pageId) {
      issues.push({
        severity,
        code: "missing_meta_page_id",
        message: "Meta Creative 缺少 pageId"
      });
    }
    if (!objectStorySpec && !link) {
      issues.push({
        severity,
        code: "missing_destination_url",
        message: "Meta Creative 缺少 destinationUrl/linkUrl"
      });
    }
  }

  private buildMetaCreativePayload(context: PublishContext) {
    const creativeConfig = asRecord(context.creative?.config);
    const config = asRecord(context.config);
    const creativeOverrides = mergeRecords(
      recordValue(context.config.creative),
      recordValue(context.config.meta?.creative),
      recordValue(creativeConfig.metaCreative)
    );
    const objectStorySpec =
      recordValue(creativeOverrides.object_story_spec) ??
      recordValue(creativeOverrides.objectStorySpec) ??
      recordValue(creativeConfig.object_story_spec) ??
      recordValue(creativeConfig.objectStorySpec);
    const existingPostId =
      stringValue(context.config.existingPostId) ??
      stringValue(config.existingPostId) ??
      stringValue(config.existing_post_id);

    if (existingPostId) {
      return mergeRecords(
        {
          name: `${context.campaign.name} Creative`,
          object_story_id: existingPostId
        },
        removeKeys(creativeOverrides, ["object_story_spec", "objectStorySpec", "object_story_id", "objectStoryId"])
      );
    }

    if (objectStorySpec) {
      return mergeRecords(
        {
          name: `${context.campaign.name} Creative`,
          object_story_spec: objectStorySpec
        },
        removeKeys(creativeOverrides, ["object_story_spec", "objectStorySpec"])
      );
    }

    const pageId = stringValue(context.config.pageId) ?? stringValue(config.page_id) ?? stringValue(creativeConfig.pageId);
    const link =
      stringValue(context.config.destinationUrl) ??
      stringValue(context.config.linkUrl) ??
      stringValue(context.config.landingPageUrl) ??
      stringValue(creativeConfig.destinationUrl) ??
      stringValue(creativeConfig.linkUrl);
    const imageHash = stringValue(creativeConfig.imageHash) ?? stringValue(creativeConfig.image_hash);

    if (!context.dryRun && (!pageId || !link)) {
      throw new BadRequestException("Meta Creative 需要 pageId 和 linkUrl/destinationUrl 配置");
    }

    return mergeRecords(
      {
        name: `${context.campaign.name} Creative`,
        object_story_spec: {
          page_id: pageId ?? "dryrun_page_id",
          link_data: {
            link: link ?? "https://example.com",
            message: stringValue(creativeConfig.primaryText) ?? stringValue(creativeConfig.message) ?? context.campaign.name,
            name: stringValue(creativeConfig.headline) ?? context.campaign.name,
            description: stringValue(creativeConfig.description) ?? undefined,
            image_hash: imageHash,
            call_to_action: {
              type: stringValue(creativeConfig.callToAction) ?? stringValue(creativeConfig.call_to_action) ?? "LEARN_MORE",
              value: { link: link ?? "https://example.com" }
            }
          }
        }
      },
      creativeOverrides
    );
  }

  private buildMetaAdPayload(context: PublishContext, adSetId: string, creativeId: string) {
    return mergeRecords(
      {
        name: `${context.campaign.name} Ad`,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: "PAUSED"
      },
      recordValue(context.config.ad),
      recordValue(context.config.meta?.ad)
    );
  }

  private buildTikTokAdGroupPayload(context: PublishContext, campaignId: string) {
    const now = new Date();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + 30);
    return mergeRecords(
      {
        advertiser_id: context.adAccount.externalId,
        campaign_id: campaignId,
        adgroup_name: `${context.campaign.name} Ad Group`,
        placement_type: "PLACEMENT_TYPE_NORMAL",
        placements: ["PLACEMENT_TIKTOK"],
        promotion_type: "WEBSITE",
        optimization_goal: strategyValue(context.strategy, "optimization_goal") ?? "CLICK",
        billing_event: strategyValue(context.strategy, "billing_event") ?? "CPC",
        bid_type: strategyValue(context.strategy, "bid_type") ?? "BID_TYPE_NO_BID",
        budget_mode: context.config.budgetMode ?? strategyValue(context.strategy, "budget_mode") ?? "BUDGET_MODE_DAY",
        budget: context.config.budget ?? 20,
        schedule_type: "SCHEDULE_START_END",
        schedule_start_time: formatTikTokDateTime(now),
        schedule_end_time: formatTikTokDateTime(end)
      },
      recordValue(context.targeting?.config),
      recordValue(targetingRecord(context.targeting, "adGroup")),
      recordValue(targetingRecord(context.targeting, "tiktokAdGroup")),
      recordValue(context.config.adGroup),
      recordValue(context.config.tiktok?.adGroup)
    );
  }

  private buildTikTokAdPayload(context: PublishContext, adGroupId: string) {
    const creativeConfig = asRecord(context.creative?.config);
    const configuredCreatives =
      arrayValue(context.config.tiktok?.creatives) ??
      arrayValue(context.config.creative?.creatives) ??
      arrayValue(creativeConfig.tiktokCreatives) ??
      arrayValue(creativeConfig.creatives);

    if (!context.dryRun && !configuredCreatives?.length) {
      throw new BadRequestException("TikTok Ad 创建需要 creatives 配置（video_id/image_ids/identity 等）");
    }

    const link =
      stringValue(context.config.destinationUrl) ??
      stringValue(context.config.linkUrl) ??
      stringValue(context.config.landingPageUrl) ??
      stringValue(creativeConfig.destinationUrl) ??
      stringValue(creativeConfig.linkUrl);

    return mergeRecords(
      {
        advertiser_id: context.adAccount.externalId,
        adgroup_id: adGroupId,
        creatives:
          configuredCreatives ??
          [
            {
              ad_name: `${context.campaign.name} Ad`,
              ad_format: "SINGLE_VIDEO",
              landing_page_url: link ?? "https://example.com",
              call_to_action: stringValue(creativeConfig.callToAction) ?? "LEARN_MORE"
            }
          ]
      },
      recordValue(context.config.ad),
      recordValue(context.config.tiktok?.ad)
    );
  }

  private validateTikTokPreflight(
    context: PublishContext,
    issues: PublishPreflightIssue[],
    realMode: boolean
  ) {
    const creativeConfig = asRecord(context.creative?.config);
    const configuredCreatives =
      arrayValue(context.config.tiktok?.creatives) ??
      arrayValue(context.config.creative?.creatives) ??
      arrayValue(creativeConfig.tiktokCreatives) ??
      arrayValue(creativeConfig.creatives);
    if (!configuredCreatives?.length) {
      issues.push({
        severity: realMode ? "error" : "warning",
        code: "missing_tiktok_creatives",
        message: "TikTok Ad 创建需要 creatives 配置（video_id/image_ids/identity 等）"
      });
    }
  }

  private async postMetaObject<T extends Record<string, unknown>>(
    context: PublishContext,
    url: string,
    endpoint: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    if (context.dryRun) {
      const objectName = metaObjectName(endpoint);
      return {
        id: `dryrun:meta:${objectName}:${context.campaign.id}`,
        dryRun: true,
        endpoint,
        payload
      } as unknown as T;
    }

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) body.set(key, payloadValue(value));
    }
    body.set("access_token", this.requireToken(context.accessToken));
    return this.fetchJson<T>(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
  }

  private async postTikTokObject<T extends TikTokCreateResponse>(
    context: PublishContext,
    url: string,
    endpoint: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    if (context.dryRun) {
      const objectName = tikTokObjectName(endpoint);
      return {
        code: 0,
        message: "OK",
        data: {
          [`${objectName}_id`]: `dryrun:tiktok:${objectName}:${context.campaign.id}`
        },
        dryRun: true,
        endpoint,
        payload
      } as unknown as T;
    }

    const response = await this.fetchJson<T>(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Access-Token": this.requireToken(context.accessToken)
      },
      body: JSON.stringify(payload)
    });

    const providerCode = Number(response.code ?? 0);
    if (!Number.isNaN(providerCode) && providerCode !== 0) {
      throw new BadRequestException(response.message ?? "TikTok API request failed");
    }
    return response;
  }

  private publishedObject(
    objectType: PlatformObjectType,
    localKey: string,
    externalId: string,
    name: string,
    raw: Record<string, unknown>
  ): PublishedObjectResult {
    return { objectType, localKey, externalId, name, raw };
  }

  private requireProviderId(id: string | null | undefined, message: string) {
    if (!id) throw new BadRequestException(message);
    return id;
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

  private isDryRun() {
    return this.config.get<string>("PUBLISH_DRY_RUN") !== "false";
  }

  private requireToken(token: string | null) {
    if (!token) throw new BadRequestException("缺少渠道授权 token");
    return token;
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

  private audit(
    actorId: string | null | undefined,
    teamId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>
  ) {
    return this.db.auditLog.create({
      data: {
        actorId,
        teamId,
        action,
        entityType: "campaign",
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

function asCampaignConfig(value: Prisma.JsonValue): CampaignConfig {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as CampaignConfig) : {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function mergeRecords(...records: Array<Record<string, unknown> | undefined>) {
  const merged: Record<string, unknown> = {};
  for (const record of records) {
    if (!record) continue;
    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
}

function removeKeys(record: Record<string, unknown>, keys: string[]) {
  const next = { ...record };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

function strategyRecord(strategy: Strategy | null, key: string) {
  if (!strategy?.config || typeof strategy.config !== "object" || Array.isArray(strategy.config)) return undefined;
  return recordValue((strategy.config as Record<string, unknown>)[key]);
}

function targetingRecord(targeting: Targeting | null, key: string) {
  if (!targeting?.config || typeof targeting.config !== "object" || Array.isArray(targeting.config)) return undefined;
  return recordValue((targeting.config as Record<string, unknown>)[key]);
}

function strategyValue(strategy: Strategy | null, key: string) {
  if (!strategy?.config || typeof strategy.config !== "object" || Array.isArray(strategy.config)) return undefined;
  const value = (strategy.config as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function payloadValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function extractTikTokId(data: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value) && value.length) return String(value[0]);
    if (value != null && typeof value !== "object") return String(value);
  }
  return undefined;
}

function metaObjectName(endpoint: string) {
  const last = endpoint.split("/").filter(Boolean).pop();
  if (last === "campaigns") return "campaign";
  if (last === "adsets") return "ad_set";
  if (last === "adcreatives") return "creative";
  if (last === "ads") return "ad";
  return last ?? "object";
}

function tikTokObjectName(endpoint: string) {
  const parts = endpoint.split("/").filter(Boolean);
  const object = parts[parts.length - 2];
  if (object === "adgroup") return "adgroup";
  if (object === "campaign") return "campaign";
  if (object === "ad") return "ad";
  return object ?? "object";
}

function formatTikTokDateTime(value: Date) {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(
    value.getUTCHours()
  )}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
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
