import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Platform, Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { SecretCryptoService } from "../common/crypto/secret-crypto.service";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateTargetingDto, EstimateTargetingDto, TargetingOptionsQueryDto, UpdateTargetingDto } from "./dto";

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
  private readonly tiktokOptionCache = new Map<string, { expiresAt: number; rows: Record<string, unknown>[] }>();

  constructor(
    private readonly db: DatabaseService,
    private readonly secretCrypto: SecretCryptoService,
    private readonly config: ConfigService
  ) {}

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

  async options(query: TargetingOptionsQueryDto, user: AuthenticatedUser) {
    const platform = query.platform ?? Platform.META;
    const teamId = await this.resolveTeamId(user);

    if (platform === Platform.META) {
      const accessToken = await this.resolveMetaAccessToken(teamId);
      if (!accessToken) {
        return { source: "fallback", items: [], message: "Meta integration is not connected" };
      }

      try {
        const items = await this.searchMetaTargetingOptions(accessToken, query.kind, query.q);
        return { source: "official", items };
      } catch (error) {
        return {
          source: "fallback",
          items: [],
          message: error instanceof Error ? error.message : "Meta targeting search failed"
        };
      }
    }

    const context = await this.resolveTikTokContext(teamId);
    if (!context) return { source: "fallback", items: [], message: "TikTok integration or advertiser is not connected" };

    try {
      const items = await this.searchTikTokTargetingOptions(
        context.accessToken,
        context.advertiserId,
        query.kind,
        query.q
      );
      return { source: "official", items };
    } catch (error) {
      return {
        source: "fallback",
        items: [],
        message: error instanceof Error ? error.message : "TikTok targeting search failed"
      };
    }
  }

  async estimate(dto: EstimateTargetingDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    if (dto.platform === Platform.TIKTOK) {
      const context = await this.resolveTikTokContext(teamId);
      if (!context) {
        return { source: "fallback", estimate: null, message: "TikTok integration or advertiser is not connected" };
      }

      try {
        const estimate = await this.fetchTikTokAudienceEstimate(
          context.accessToken,
          context.advertiserId,
          dto.config
        );
        return { source: "official", estimate };
      } catch (error) {
        return {
          source: "fallback",
          estimate: null,
          message: error instanceof Error ? error.message : "TikTok audience estimate failed"
        };
      }
    }

    const [accessToken, adAccount] = await Promise.all([
      this.resolveMetaAccessToken(teamId),
      this.db.adAccount.findFirst({
        where: { teamId, platform: Platform.META },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      })
    ]);

    if (!accessToken || !adAccount) {
      return { source: "fallback", estimate: null, message: "Meta integration or ad account is not connected" };
    }

    try {
      const estimate = await this.fetchMetaReachEstimate(accessToken, adAccount.externalId, dto.config);
      return { source: "official", estimate };
    } catch (error) {
      return {
        source: "fallback",
        estimate: null,
        message: error instanceof Error ? error.message : "Meta reach estimate failed"
      };
    }
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

  private async resolveMetaAccessToken(teamId: string) {
    const integration = await this.db.integrationAccount.findFirst({
      where: {
        teamId,
        platform: Platform.META,
        accessTokenEncrypted: { not: null }
      },
      orderBy: { updatedAt: "desc" }
    });
    return integration?.accessTokenEncrypted ? this.secretCrypto.decrypt(integration.accessTokenEncrypted) : null;
  }

  private async resolveTikTokContext(teamId: string) {
    const [integration, adAccount] = await Promise.all([
      this.db.integrationAccount.findFirst({
        where: {
          teamId,
          platform: Platform.TIKTOK,
          accessTokenEncrypted: { not: null }
        },
        orderBy: { updatedAt: "desc" }
      }),
      this.db.adAccount.findFirst({
        where: { teamId, platform: Platform.TIKTOK },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      })
    ]);
    if (!integration?.accessTokenEncrypted || !adAccount) return null;
    return {
      accessToken: this.secretCrypto.decrypt(integration.accessTokenEncrypted),
      advertiserId: adAccount.externalId
    };
  }

  private graphUrl(path: string) {
    const base = this.config.get<string>("META_API_BASE_URL") ?? "https://graph.facebook.com";
    const version = this.config.get<string>("META_GRAPH_VERSION") ?? "v25.0";
    return `${base.replace(/\/$/, "")}/${version}/${path.replace(/^\//, "")}`;
  }

  private async searchMetaTargetingOptions(accessToken: string, kind: TargetingOptionsQueryDto["kind"], q?: string) {
    const params = new URLSearchParams({ access_token: accessToken, limit: "25" });
    const keyword = q?.trim();

    if (kind === "countries" || kind === "regions" || kind === "cities") {
      params.set("type", "adgeolocation");
      params.set("location_types", JSON.stringify([kind === "countries" ? "country" : kind === "regions" ? "region" : "city"]));
      if (keyword) params.set("q", keyword);
    } else if (kind === "languages") {
      params.set("type", "adlocale");
      if (keyword) params.set("q", keyword);
    } else if (kind === "interests") {
      params.set("type", "adinterest");
      if (keyword) params.set("q", keyword);
    } else {
      params.set("type", "adTargetingCategory");
      params.set("class", kind === "demographics" ? "demographics" : "behaviors");
    }

    const response = await fetch(`${this.graphUrl("search")}?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(metaErrorMessage(payload, "Meta targeting search failed"));
    }

    const rows: unknown[] = Array.isArray(payload.data) ? payload.data : [];
    return rows.map((row: unknown) => metaOption(row)).filter((row) => row.value && row.label);
  }

  private async searchTikTokTargetingOptions(
    accessToken: string,
    advertiserId: string,
    kind: TargetingOptionsQueryDto["kind"],
    q?: string
  ) {
    if (kind === "countries" || kind === "regions" || kind === "cities") {
      const levelRange = kind === "countries" ? "TO_COUNTRY" : kind === "regions" ? "TO_PROVINCE" : "TO_CITY";
      const expectedLevel = kind === "countries" ? "COUNTRY" : kind === "regions" ? "PROVINCE" : "CITY";
      const rows = await this.fetchTikTokRegions(accessToken, advertiserId, levelRange);
      const keyword = q?.trim().toLowerCase();
      return rows
        .filter((row) => stringValue(row.level) === expectedLevel)
        .filter((row) => {
          if (!keyword) return true;
          return [row.name, row.region_code, row.location_id].some((value) => String(value ?? "").toLowerCase().includes(keyword));
        })
        .slice(0, 50)
        .map((row) => ({
          value: stringValue(row.location_id) ?? "",
          label: [stringValue(row.name), stringValue(row.region_code)].filter(Boolean).join(" / "),
          type: stringValue(row.level),
          raw: row
        }))
        .filter((row) => row.value && row.label);
    }

    if (kind === "languages") {
      const rows = await this.fetchTikTokLanguages(accessToken, advertiserId);
      const keyword = q?.trim().toLowerCase();
      return rows
        .filter((row) => !keyword || [row.name, row.code].some((value) => String(value ?? "").toLowerCase().includes(keyword)))
        .slice(0, 50)
        .map((row) => ({
          value: stringValue(row.code) ?? "",
          label: [stringValue(row.name), stringValue(row.code)].filter(Boolean).join(" / "),
          type: "language",
          raw: row
        }))
        .filter((row) => row.value && row.label);
    }

    if (kind === "interests" || kind === "behaviors") {
      return this.searchTikTokInterests(accessToken, advertiserId, kind, q);
    }

    return [];
  }

  private async fetchTikTokRegions(accessToken: string, advertiserId: string, levelRange: string) {
    const cacheKey = `regions:${advertiserId}:${levelRange}`;
    const cached = this.tiktokOptionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;

    const params = new URLSearchParams({
      advertiser_id: advertiserId,
      placements: JSON.stringify(["PLACEMENT_TIKTOK"]),
      objective_type: "TRAFFIC",
      level_range: levelRange,
      language: "en"
    });
    const payload = await this.fetchTikTokApi(`/open_api/v1.3/tool/region/?${params.toString()}`, accessToken);
    const data = asRecord(payload.data);
    const rows = recordArray(data.region_info);
    this.tiktokOptionCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, rows });
    return rows;
  }

  private async fetchTikTokLanguages(accessToken: string, advertiserId: string) {
    const cacheKey = `languages:${advertiserId}`;
    const cached = this.tiktokOptionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;

    const params = new URLSearchParams({ advertiser_id: advertiserId });
    const payload = await this.fetchTikTokApi(`/open_api/v1.3/tool/language/?${params.toString()}`, accessToken);
    const rows = recordArray(asRecord(payload.data).languages);
    this.tiktokOptionCache.set(cacheKey, { expiresAt: Date.now() + 60 * 60 * 1000, rows });
    return rows;
  }

  private async searchTikTokInterests(
    accessToken: string,
    advertiserId: string,
    kind: "interests" | "behaviors",
    q?: string
  ) {
    const keyword = q?.trim();
    const subtypes =
      kind === "interests"
        ? keyword
          ? ["GENERAL_INTEREST", "ADDITIONAL_INTEREST", "PURCHASE_INTENTION"]
          : ["GENERAL_INTEREST", "PURCHASE_INTENTION"]
        : ["VIDEO_INTERACTION", "CREATOR_INTERACTION", "HASHTAG_INTERACTION"];
    const params = new URLSearchParams({
      advertiser_id: advertiserId,
      targeting_type: "INTEREST_AND_BEHAVIOR",
      sub_targeting_types: JSON.stringify(subtypes),
      language: "en"
    });
    if (keyword) params.set("search_keywords", JSON.stringify([keyword]));

    const payload = await this.fetchTikTokApi(`/open_api/v1.3/targeting/search/?${params.toString()}`, accessToken);
    return tiktokTargetingOptions(asRecord(payload.data), subtypes, keyword);
  }

  private async fetchTikTokAudienceEstimate(accessToken: string, advertiserId: string, config: Record<string, unknown>) {
    const regions = await this.fetchTikTokRegions(accessToken, advertiserId, "TO_CITY");
    const selectedLocations = [
      ...stringArray(config.countries),
      ...stringArray(config.regions),
      ...stringArray(config.cities)
    ];
    const locationIds = resolveTikTokLocationIds(selectedLocations, regions);
    if (!locationIds.length) throw new Error("TikTok audience estimate requires at least one valid location");

    const interests = parseTikTokTargetingValues(stringArray(config.interests));
    const payload: Record<string, unknown> = {
      advertiser_id: advertiserId,
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      objective_type: "TRAFFIC",
      optimization_goal: "CLICK",
      promotion_type: "WEBSITE",
      location_ids: locationIds,
      gender: tiktokGender(stringArray(config.genders)),
      age_groups: tiktokAgeGroups(numberValue(config.ageMin), numberValue(config.ageMax)),
      languages: stringArray(config.languages),
      ...(interests.GENERAL_INTEREST.length ? { interest_category_ids: interests.GENERAL_INTEREST } : {}),
      ...(interests.ADDITIONAL_INTEREST.length ? { interest_keyword_ids: interests.ADDITIONAL_INTEREST } : {}),
      ...(interests.PURCHASE_INTENTION.length ? { purchase_intention_keyword_ids: interests.PURCHASE_INTENTION } : {})
    };
    const response = await this.fetchTikTokApi("/open_api/v1.3/ad/audience_size/estimate/", accessToken, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = asRecord(response.data);
    const userCount = asRecord(data.user_count);
    return {
      users_lower_bound: numberValue(userCount.lower_end),
      users_upper_bound: numberValue(userCount.upper_end),
      user_count_stage: numberValue(data.user_count_stage),
      raw: data
    };
  }

  private async fetchTikTokApi(path: string, accessToken: string, init?: RequestInit) {
    const base = this.config.get<string>("TIKTOK_API_BASE_URL") ?? "https://business-api.tiktok.com";
    const response = await fetch(new URL(path, base), {
      ...init,
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || Number(payload.code ?? 0) !== 0) {
      throw new Error(stringValue(payload.message) ?? `TikTok API request failed: ${response.status}`);
    }
    return payload;
  }

  private async fetchMetaReachEstimate(accessToken: string, adAccountExternalId: string, config: Record<string, unknown>) {
    const actId = adAccountExternalId.startsWith("act_") ? adAccountExternalId : `act_${adAccountExternalId}`;
    const params = new URLSearchParams({
      access_token: accessToken,
      targeting_spec: JSON.stringify(metaTargetingSpec(config)),
      optimize_for: "IMPRESSIONS"
    });

    const response = await fetch(`${this.graphUrl(`${actId}/reachestimate`)}?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(metaErrorMessage(payload, "Meta reach estimate failed"));
    }

    return Array.isArray(payload.data) ? (payload.data[0] ?? null) : (payload.data ?? payload);
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

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asRecord(item)) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tiktokTargetingOptions(data: Record<string, unknown>, subtypes: string[], keyword?: string) {
  const sectionBySubtype: Record<string, string> = {
    GENERAL_INTEREST: "general_interest",
    ADDITIONAL_INTEREST: "additional_interest",
    PURCHASE_INTENTION: "purchase_intention",
    VIDEO_INTERACTION: "video_interaction",
    CREATOR_INTERACTION: "creator_interaction",
    HASHTAG_INTERACTION: "hashtag_interaction"
  };
  const labelBySubtype: Record<string, string> = {
    GENERAL_INTEREST: "一般兴趣",
    ADDITIONAL_INTEREST: "扩展兴趣",
    PURCHASE_INTENTION: "购买意向",
    VIDEO_INTERACTION: "视频互动",
    CREATOR_INTERACTION: "达人互动",
    HASHTAG_INTERACTION: "话题互动"
  };
  const options = new Map<string, { value: string; label: string; type: string; raw: Record<string, unknown> }>();

  for (const subtype of subtypes) {
    const section = asRecord(data[sectionBySubtype[subtype]]);
    const rows = keyword
      ? Object.values(asRecord(section.search_result)).flatMap((value) => recordArray(value))
      : recordArray(section.list_result);
    for (const row of rows) {
      const id = stringValue(row.id);
      const name = stringValue(row.name);
      const rowSubtype = stringValue(row.sub_targeting_type) ?? subtype;
      if (!id || !name) continue;
      const value = `tt:${rowSubtype}:${id}`;
      options.set(value, {
        value,
        label: `${name} / ${labelBySubtype[rowSubtype] ?? rowSubtype}`,
        type: rowSubtype,
        raw: row
      });
    }
  }

  return Array.from(options.values()).slice(0, 50);
}

function resolveTikTokLocationIds(selected: string[], regions: Record<string, unknown>[]) {
  const normalized = new Set(selected.map((value) => value.trim().toLowerCase()).filter(Boolean));
  return Array.from(
    new Set(
      regions
        .filter((row) =>
          [row.location_id, row.region_code, row.name].some((value) => normalized.has(String(value ?? "").trim().toLowerCase()))
        )
        .map((row) => stringValue(row.location_id))
        .filter((value): value is string => Boolean(value))
    )
  );
}

function parseTikTokTargetingValues(values: string[]) {
  const groups: Record<"GENERAL_INTEREST" | "ADDITIONAL_INTEREST" | "PURCHASE_INTENTION", string[]> = {
    GENERAL_INTEREST: [],
    ADDITIONAL_INTEREST: [],
    PURCHASE_INTENTION: []
  };
  for (const value of values) {
    const match = /^tt:(GENERAL_INTEREST|ADDITIONAL_INTEREST|PURCHASE_INTENTION):(\d+)$/.exec(value);
    if (match) {
      groups[match[1] as keyof typeof groups].push(match[2]);
    } else if (/^\d+$/.test(value)) {
      groups.GENERAL_INTEREST.push(value);
    }
  }
  return groups;
}

function tiktokGender(genders: string[]) {
  if (genders.includes("MALE")) return "GENDER_MALE";
  if (genders.includes("FEMALE")) return "GENDER_FEMALE";
  return "GENDER_UNLIMITED";
}

function tiktokAgeGroups(ageMin?: number, ageMax?: number) {
  const min = ageMin ?? 18;
  const max = ageMax ?? 65;
  const groups = [
    { value: "AGE_18_24", min: 18, max: 24 },
    { value: "AGE_25_34", min: 25, max: 34 },
    { value: "AGE_35_44", min: 35, max: 44 },
    { value: "AGE_45_54", min: 45, max: 54 },
    { value: "AGE_55_100", min: 55, max: 100 }
  ];
  return groups.filter((group) => group.max >= min && group.min <= max).map((group) => group.value);
}

function metaOption(value: unknown) {
  const row = asRecord(value);
  const name =
    stringValue(row.name) ??
    stringValue(row.localized_name) ??
    stringValue(row.description) ??
    stringValue(row.key) ??
    stringValue(row.country_code) ??
    stringValue(row.id) ??
    "";
  const key = stringValue(row.key) ?? stringValue(row.country_code) ?? stringValue(row.id) ?? name;
  const path = Array.isArray(row.path) ? row.path.map((item) => String(item)).join(" / ") : undefined;
  return {
    value: key,
    label: path ? `${name} / ${path}` : name,
    id: stringValue(row.id),
    type: stringValue(row.type),
    audienceSize:
      numberValue(row.audience_size) ??
      numberValue(row.coverage) ??
      numberValue(row.audience_size_upper_bound),
    raw: row
  };
}

function metaErrorMessage(payload: unknown, fallback: string) {
  const error = asRecord(asRecord(payload).error);
  return stringValue(error.message) ?? fallback;
}

function metaTargetingSpec(config: Record<string, unknown>) {
  const countries = stringArray(config.countries);
  const regions = stringArray(config.regions)
    .filter((key) => /^\d+$/.test(key))
    .map((key) => ({ key }));
  const cities = stringArray(config.cities)
    .filter((key) => /^\d+$/.test(key))
    .map((key) => ({ key }));
  const languages = stringArray(config.languages)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const genders = stringArray(config.genders)
    .flatMap((value) => {
      if (value === "MALE") return [1];
      if (value === "FEMALE") return [2];
      return [];
    });
  const interests = stringArray(config.interests)
    .filter((value) => /^\d+$/.test(value))
    .map((id) => ({ id }));

  return {
    geo_locations: {
      ...(countries.length ? { countries } : {}),
      ...(regions.length ? { regions } : {}),
      ...(cities.length ? { cities } : {})
    },
    ...(languages.length ? { locales: languages } : {}),
    ...(genders.length ? { genders } : {}),
    ...(numberValue(config.ageMin) ? { age_min: numberValue(config.ageMin) } : {}),
    ...(numberValue(config.ageMax) ? { age_max: numberValue(config.ageMax) } : {}),
    ...(interests.length ? { interests } : {})
  };
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
