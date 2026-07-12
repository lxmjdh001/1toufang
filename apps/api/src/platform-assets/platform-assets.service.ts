import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Platform, PlatformAssetType, Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { SecretCryptoService } from "../common/crypto/secret-crypto.service";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";

type SyncResult = {
  integrations: number;
  adAccounts: number;
  assets: number;
  errors: Array<{ platform: Platform; integrationId: string; message: string }>;
};

type MetaCollection<T> = {
  data?: T[];
  paging?: { next?: string };
};

type MetaAdAccount = {
  id?: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number | string;
  balance?: string | number;
};

type MetaAsset = {
  id?: string;
  name?: string;
  category?: string;
  verification_status?: string;
  tasks?: string[];
  last_fired_time?: string;
  is_unavailable?: boolean;
};

type TikTokAdvertiserAuthResponse = {
  code?: number | string;
  message?: string;
  data?: {
    list?: Array<{ advertiser_id?: string | number; advertiser_name?: string }>;
    advertiser_ids?: Array<string | number>;
    advertiser_id?: string | number;
  };
};

type TikTokAdvertiserInfoResponse = {
  code?: number | string;
  message?: string;
  data?: {
    list?: Array<{
      advertiser_id?: string | number;
      name?: string;
      advertiser_name?: string;
      currency?: string;
      timezone?: string;
      status?: string | number;
    }>;
  };
};

@Injectable()
export class PlatformAssetsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly secretCrypto: SecretCryptoService
  ) {}

  async list(user: AuthenticatedUser, platformParam?: string, typeParam?: string) {
    const teamId = await this.resolveTeamId(user);
    const platform = platformParam ? this.parsePlatform(platformParam) : undefined;
    const type = typeParam ? this.parseAssetType(typeParam) : undefined;

    return this.db.platformAsset.findMany({
      where: { teamId, platform, type },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });
  }

  async sync(user: AuthenticatedUser): Promise<SyncResult> {
    const teamId = await this.resolveTeamId(user);
    const integrations = await this.db.integrationAccount.findMany({
      where: {
        teamId,
        accessTokenEncrypted: { not: null },
        status: { in: ["active", "manual"] }
      }
    });

    const result: SyncResult = {
      integrations: integrations.length,
      adAccounts: 0,
      assets: 0,
      errors: []
    };

    for (const integration of integrations) {
      try {
        if (!integration.accessTokenEncrypted) continue;
        const accessToken = this.secretCrypto.decrypt(integration.accessTokenEncrypted);
        const partial =
          integration.platform === Platform.META
            ? await this.syncMetaAssets(teamId, accessToken)
            : await this.syncTikTokAssets(teamId, accessToken, integration.externalId);
        result.adAccounts += partial.adAccounts;
        result.assets += partial.assets;
      } catch (err) {
        result.errors.push({
          platform: integration.platform,
          integrationId: integration.id,
          message: this.toUserMessage(err, "渠道资产同步失败")
        });
      }
    }

    await this.db.auditLog.create({
      data: {
        actorId: user.id,
        teamId,
        action: "PLATFORM_ASSETS_SYNCED",
        entityType: "platform_asset",
        metadata: result as unknown as Prisma.InputJsonValue
      }
    });

    return result;
  }

  private async syncMetaAssets(teamId: string, accessToken: string) {
    const version = this.config.get<string>("META_GRAPH_VERSION") ?? "v25.0";
    let adAccounts = 0;
    let assets = 0;

    const accounts = await this.fetchMetaCollection<MetaAdAccount>(`/${version}/me/adaccounts`, accessToken, {
      fields: "id,account_id,name,currency,timezone_name,account_status,balance"
    });

    for (const account of accounts) {
      const externalId = account.account_id ?? normalizeMetaAdAccountId(account.id);
      if (!externalId) continue;

      const apiId = account.id?.startsWith("act_") ? account.id : `act_${externalId}`;
      await this.db.adAccount.upsert({
        where: {
          platform_externalId: {
            platform: Platform.META,
            externalId
          }
        },
        create: {
          teamId,
          platform: Platform.META,
          externalId,
          name: account.name ?? `Meta Ad Account ${externalId}`,
          currency: account.currency,
          timezone: account.timezone_name,
          status: account.account_status == null ? "synced" : String(account.account_status),
          balance: toDecimal(account.balance)
        },
        update: {
          teamId,
          name: account.name ?? `Meta Ad Account ${externalId}`,
          currency: account.currency,
          timezone: account.timezone_name,
          status: account.account_status == null ? "synced" : String(account.account_status),
          balance: toDecimal(account.balance)
        }
      });
      adAccounts += 1;

      try {
        const pixels = await this.fetchMetaCollection<MetaAsset>(`/${version}/${apiId}/adspixels`, accessToken, {
          fields: "id,name,last_fired_time,is_unavailable"
        });
        for (const pixel of pixels) {
          if (!pixel.id) continue;
          await this.upsertAsset(teamId, Platform.META, PlatformAssetType.PIXEL, pixel.id, pixel.name, {
            ...pixel,
            adAccountExternalId: externalId
          });
          assets += 1;
        }
      } catch {
        // Pixel permission may be absent even when ad account sync is allowed.
      }
    }

    const pages = await this.fetchMetaCollection<MetaAsset>(`/${version}/me/accounts`, accessToken, {
      fields: "id,name,category,tasks"
    });
    for (const page of pages) {
      if (!page.id) continue;
      await this.upsertAsset(teamId, Platform.META, PlatformAssetType.FACEBOOK_PAGE, page.id, page.name, page);
      assets += 1;
    }

    try {
      const businesses = await this.fetchMetaCollection<MetaAsset>(`/${version}/me/businesses`, accessToken, {
        fields: "id,name,verification_status"
      });
      for (const business of businesses) {
        if (!business.id) continue;
        await this.upsertAsset(
          teamId,
          Platform.META,
          PlatformAssetType.BUSINESS_CENTER,
          business.id,
          business.name,
          business
        );
        assets += 1;
      }
    } catch {
      // Business Manager permission is optional for early OAuth testing.
    }

    return { adAccounts, assets };
  }

  private async syncTikTokAssets(teamId: string, accessToken: string, fallbackAdvertiserId: string) {
    const advertiserIds = await this.fetchTikTokAdvertiserIds(accessToken, fallbackAdvertiserId);
    let adAccounts = 0;
    let assets = 0;

    for (const chunk of chunkArray(advertiserIds, 50)) {
      const infoRows = await this.fetchTikTokAdvertiserInfo(accessToken, chunk);
      const rowsById = new Map(infoRows.map((row) => [String(row.advertiser_id), row]));

      for (const advertiserId of chunk) {
        const info = rowsById.get(advertiserId);
        const name = info?.name ?? info?.advertiser_name ?? `TikTok Advertiser ${advertiserId}`;
        const status = info?.status == null ? "synced" : String(info.status);

        await this.db.adAccount.upsert({
          where: {
            platform_externalId: {
              platform: Platform.TIKTOK,
              externalId: advertiserId
            }
          },
          create: {
            teamId,
            platform: Platform.TIKTOK,
            externalId: advertiserId,
            name,
            currency: info?.currency,
            timezone: info?.timezone,
            status
          },
          update: {
            teamId,
            name,
            currency: info?.currency,
            timezone: info?.timezone,
            status
          }
        });
        adAccounts += 1;

        await this.upsertAsset(teamId, Platform.TIKTOK, PlatformAssetType.TIKTOK_ADVERTISER, advertiserId, name, info ?? {});
        assets += 1;
      }
    }

    return { adAccounts, assets };
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
      const body: MetaCollection<T> = await this.fetchJson<MetaCollection<T>>(current.toString());
      rows.push(...(body.data ?? []));
      nextUrl = body.paging?.next;
    }

    return rows;
  }

  private async fetchTikTokAdvertiserIds(accessToken: string, fallbackAdvertiserId: string) {
    const body = await this.fetchTikTok<TikTokAdvertiserAuthResponse>(
      "/open_api/v1.3/oauth2/advertiser/get/",
      accessToken
    ).catch(() => null);
    const data = body?.data;
    const listIds = data?.list?.map((row) => row.advertiser_id).filter((id) => id != null).map(String) ?? [];
    const advertiserIds = data?.advertiser_ids?.map(String) ?? [];
    const singleId = data?.advertiser_id == null ? [] : [String(data.advertiser_id)];
    const fallback = fallbackAdvertiserId.startsWith("tiktok:user:") ? [] : [fallbackAdvertiserId];

    return Array.from(new Set([...listIds, ...advertiserIds, ...singleId, ...fallback]));
  }

  private async fetchTikTokAdvertiserInfo(accessToken: string, advertiserIds: string[]) {
    if (!advertiserIds.length) return [];

    const path = "/open_api/v1.3/advertiser/info/";
    const params = new URLSearchParams({
      advertiser_ids: JSON.stringify(advertiserIds),
      fields: JSON.stringify(["advertiser_id", "name", "currency", "timezone", "status"])
    });
    const body = await this.fetchTikTok<TikTokAdvertiserInfoResponse>(`${path}?${params.toString()}`, accessToken).catch(
      () => ({ data: { list: [] } })
    );
    return body.data?.list ?? [];
  }

  private async fetchTikTok<T>(path: string, accessToken: string): Promise<T> {
    const baseUrl = this.config.get<string>("TIKTOK_API_BASE_URL") ?? "https://business-api.tiktok.com";
    const url = new URL(path, baseUrl);
    const body = await this.fetchJson<T & { code?: number | string; message?: string }>(url.toString(), {
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

  private upsertAsset(
    teamId: string,
    platform: Platform,
    type: PlatformAssetType,
    externalId: string,
    name: string | undefined,
    metadata: Record<string, unknown>
  ) {
    const now = new Date();
    return this.db.platformAsset.upsert({
      where: {
        teamId_platform_type_externalId: {
          teamId,
          platform,
          type,
          externalId
        }
      },
      create: {
        teamId,
        platform,
        type,
        externalId,
        name: name ?? `${type} ${externalId}`,
        status: "synced",
        metadata: metadata as Prisma.InputJsonValue,
        lastSyncedAt: now
      },
      update: {
        name: name ?? `${type} ${externalId}`,
        status: "synced",
        metadata: metadata as Prisma.InputJsonValue,
        lastSyncedAt: now
      }
    });
  }

  private parsePlatform(value: string) {
    const normalized = value.toUpperCase();
    if (normalized === Platform.META || normalized === Platform.TIKTOK) {
      return normalized;
    }
    throw new BadRequestException("Unsupported platform");
  }

  private parseAssetType(value: string) {
    const normalized = value.toUpperCase();
    if (Object.values(PlatformAssetType).includes(normalized as PlatformAssetType)) {
      return normalized as PlatformAssetType;
    }
    throw new BadRequestException("Unsupported platform asset type");
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

  private toUserMessage(err: unknown, fallback: string) {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }
}

function normalizeMetaAdAccountId(value?: string) {
  return value?.replace(/^act_/, "");
}

function toDecimal(value?: string | number) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : undefined;
}

function chunkArray<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
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
