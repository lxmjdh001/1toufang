import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Platform, Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SecretCryptoService } from "../common/crypto/secret-crypto.service";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { PlatformConfigsService } from "../platform-configs/platform-configs.service";
import { CreateIntegrationDto } from "./dto";

type OAuthCallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  error_reason?: string;
};

type OAuthState = {
  platform: Platform;
  teamId: string;
  userId: string;
  returnUrl: string;
  iat: number;
  nonce: string;
};

type ProviderOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes: string;
  apiVersion?: string;
  apiBaseUrl?: string;
  authUrl?: string;
};

type ConnectedProviderAccount = {
  externalId: string;
  name: string;
  accessToken: string;
  refreshToken?: string | null;
};

type MetaTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type MetaMeResponse = {
  id?: string;
  name?: string;
};

type TikTokTokenResponse = {
  code?: number | string;
  message?: string;
  data?: {
    access_token?: string;
    refresh_token?: string;
    advertiser_ids?: Array<string | number>;
    advertiser_id?: string | number;
    scope?: string;
  };
};

const META_DEFAULT_SCOPES = "ads_management,ads_read,business_management,pages_read_engagement";
const TIKTOK_DEFAULT_SCOPES = "user.info.basic,biz.ad";
const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly platformConfigsService: PlatformConfigsService,
    private readonly secretCrypto: SecretCryptoService
  ) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    return this.db.integrationAccount.findMany({
      where: { teamId },
      select: {
        id: true,
        platform: true,
        externalId: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async oauthUrl(platformParam: string, user: AuthenticatedUser, returnUrl?: string) {
    const platform = this.parsePlatform(platformParam);
    const teamId = await this.resolveTeamId(user);
    const providerConfig = await this.resolveOAuthConfig(platform);
    const safeReturnUrl = this.normalizeReturnUrl(returnUrl);
    const state = this.signOAuthState({
      teamId,
      platform,
      userId: user.id,
      returnUrl: safeReturnUrl,
      iat: Date.now(),
      nonce: randomBytes(12).toString("base64url")
    });

    if (platform === Platform.META) {
      const version = providerConfig.apiVersion ?? "v25.0";
      const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
      url.searchParams.set("client_id", providerConfig.appId);
      url.searchParams.set("redirect_uri", providerConfig.redirectUri);
      url.searchParams.set("scope", providerConfig.scopes);
      url.searchParams.set("state", state);
      return {
        platform,
        configured: Boolean(providerConfig.appId && providerConfig.appSecret),
        url: url.toString(),
        state
      };
    }

    const url = new URL(providerConfig.authUrl ?? "https://business-api.tiktok.com/portal/auth");
    url.searchParams.set("app_id", providerConfig.appId);
    url.searchParams.set("redirect_uri", providerConfig.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", providerConfig.scopes);
    return {
      platform,
      configured: Boolean(providerConfig.appId && providerConfig.appSecret),
      url: url.toString(),
      state
    };
  }

  async callback(platformParam: string, query: OAuthCallbackQuery) {
    const platform = this.parsePlatform(platformParam);
    let state: OAuthState | null = null;
    let returnUrl = this.defaultReturnUrl();

    try {
      state = this.verifyOAuthState(query.state, platform);
      returnUrl = this.normalizeReturnUrl(state.returnUrl);

      if (query.error) {
        const message = query.error_description ?? query.error_reason ?? query.error;
        await this.audit(state.userId, "INTEGRATION_OAUTH_DENIED", state.teamId, null, {
          platform,
          message
        });
        return this.callbackResultUrl(returnUrl, { oauth: "error", platform, message });
      }

      if (!query.code) {
        return this.callbackResultUrl(returnUrl, {
          oauth: "error",
          platform,
          message: "授权回调缺少 code"
        });
      }

      const providerConfig = await this.resolveOAuthConfig(platform);
      const connected =
        platform === Platform.META
          ? await this.exchangeMetaCode(query.code, providerConfig)
          : await this.exchangeTikTokCode(query.code, providerConfig, state);
      const integration = await this.saveConnectedAccount(state.teamId, platform, connected);

      await this.audit(state.userId, "INTEGRATION_OAUTH_CONNECTED", state.teamId, integration.id, {
        platform,
        externalId: connected.externalId
      });

      return this.callbackResultUrl(returnUrl, {
        oauth: "success",
        platform,
        integrationId: integration.id
      });
    } catch (err) {
      const message = this.toUserMessage(err, "渠道授权失败");
      if (state) {
        await this.audit(state.userId, "INTEGRATION_OAUTH_FAILED", state.teamId, null, {
          platform,
          message
        });
      }
      return this.callbackResultUrl(returnUrl, { oauth: "error", platform, message });
    }
  }

  async createManual(dto: CreateIntegrationDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    return this.db.integrationAccount.upsert({
      where: {
        platform_externalId: {
          platform: dto.platform,
          externalId: dto.externalId
        }
      },
      create: {
        teamId,
        platform: dto.platform,
        externalId: dto.externalId,
        name: dto.name,
        status: "manual"
      },
      update: {
        teamId,
        name: dto.name,
        status: "manual"
      }
    });
  }

  async refresh(id: string) {
    const integration = await this.db.integrationAccount.findUniqueOrThrow({ where: { id } });
    return this.db.integrationAccount.update({
      where: { id },
      data: {
        status: integration.status === "active" ? "active" : integration.status,
        updatedAt: new Date()
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

  private async resolveOAuthConfig(platform: Platform): Promise<ProviderOAuthConfig> {
    const savedConfig = await this.platformConfigsService.getOAuthConfig(platform);

    if (platform === Platform.META) {
      return {
        appId: savedConfig?.appId ?? this.config.get<string>("META_APP_ID") ?? "",
        appSecret: savedConfig?.appSecret ?? this.config.get<string>("META_APP_SECRET") ?? "",
        redirectUri:
          savedConfig?.redirectUri ??
          this.config.get<string>("META_REDIRECT_URI") ??
          "http://localhost:4000/api/integrations/meta/callback",
        scopes: savedConfig?.scopes?.length
          ? savedConfig.scopes.join(",")
          : this.config.get<string>("META_SCOPES") ?? META_DEFAULT_SCOPES,
        apiVersion: savedConfig?.apiVersion ?? this.config.get<string>("META_GRAPH_VERSION") ?? "v25.0",
        apiBaseUrl: savedConfig?.apiBaseUrl ?? this.config.get<string>("META_API_BASE_URL") ?? "https://graph.facebook.com"
      };
    }

    const apiBaseUrl =
      savedConfig?.apiBaseUrl ?? this.config.get<string>("TIKTOK_API_BASE_URL") ?? "https://business-api.tiktok.com";

    return {
      appId: savedConfig?.appId ?? this.config.get<string>("TIKTOK_APP_ID") ?? "",
      appSecret: savedConfig?.appSecret ?? this.config.get<string>("TIKTOK_APP_SECRET") ?? "",
      redirectUri:
        savedConfig?.redirectUri ??
        this.config.get<string>("TIKTOK_REDIRECT_URI") ??
        "http://localhost:4000/api/integrations/tiktok/callback",
      scopes: savedConfig?.scopes?.length
        ? savedConfig.scopes.join(",")
        : this.config.get<string>("TIKTOK_SCOPES") ?? TIKTOK_DEFAULT_SCOPES,
      apiBaseUrl,
      authUrl: this.config.get<string>("TIKTOK_AUTH_URL") ?? new URL("/portal/auth", apiBaseUrl).toString()
    };
  }

  private async exchangeMetaCode(code: string, providerConfig: ProviderOAuthConfig): Promise<ConnectedProviderAccount> {
    this.assertConfigured(providerConfig, Platform.META);

    const version = providerConfig.apiVersion ?? "v25.0";
    const tokenUrl = new URL(`/${version}/oauth/access_token`, providerConfig.apiBaseUrl);
    tokenUrl.searchParams.set("client_id", providerConfig.appId);
    tokenUrl.searchParams.set("redirect_uri", providerConfig.redirectUri);
    tokenUrl.searchParams.set("client_secret", providerConfig.appSecret);
    tokenUrl.searchParams.set("code", code);

    const shortToken = await this.fetchJson<MetaTokenResponse>(tokenUrl.toString());
    let accessToken = this.requiredToken(shortToken.access_token, "Meta 未返回 access_token");

    const longTokenUrl = new URL(`/${version}/oauth/access_token`, providerConfig.apiBaseUrl);
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("client_id", providerConfig.appId);
    longTokenUrl.searchParams.set("client_secret", providerConfig.appSecret);
    longTokenUrl.searchParams.set("fb_exchange_token", accessToken);

    try {
      const longToken = await this.fetchJson<MetaTokenResponse>(longTokenUrl.toString());
      if (longToken.access_token) accessToken = longToken.access_token;
    } catch {
      // Some app modes or short-lived codes may not allow extension; the short token is still usable.
    }

    const meUrl = new URL(`/${version}/me`, providerConfig.apiBaseUrl);
    meUrl.searchParams.set("fields", "id,name");
    meUrl.searchParams.set("access_token", accessToken);
    const me = await this.fetchJson<MetaMeResponse>(meUrl.toString());

    return {
      externalId: this.requiredToken(me.id, "Meta 未返回授权用户 ID"),
      name: me.name ?? "Meta Business授权",
      accessToken,
      refreshToken: null
    };
  }

  private async exchangeTikTokCode(
    code: string,
    providerConfig: ProviderOAuthConfig,
    state: OAuthState
  ): Promise<ConnectedProviderAccount> {
    this.assertConfigured(providerConfig, Platform.TIKTOK);

    const tokenUrl = new URL("/open_api/v1.3/oauth2/access_token/", providerConfig.apiBaseUrl);
    const tokenResponse = await this.fetchJson<TikTokTokenResponse>(tokenUrl.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        app_id: providerConfig.appId,
        secret: providerConfig.appSecret,
        auth_code: code
      })
    });

    const providerCode = Number(tokenResponse.code ?? 0);
    if (!Number.isNaN(providerCode) && providerCode !== 0) {
      throw new BadRequestException(this.providerErrorMessage(tokenResponse, "TikTok token exchange failed"));
    }

    const data = tokenResponse.data ?? {};
    const advertiserIds = Array.isArray(data.advertiser_ids) ? data.advertiser_ids.map(String) : [];
    const advertiserId = advertiserIds[0] ?? (data.advertiser_id == null ? null : String(data.advertiser_id));

    return {
      externalId: advertiserId ?? `tiktok:user:${state.userId}`,
      name: advertiserId ? `TikTok Advertiser ${advertiserId}` : "TikTok Business授权",
      accessToken: this.requiredToken(data.access_token, "TikTok 未返回 access_token"),
      refreshToken: data.refresh_token ?? null
    };
  }

  private saveConnectedAccount(teamId: string, platform: Platform, connected: ConnectedProviderAccount) {
    return this.db.integrationAccount.upsert({
      where: {
        platform_externalId: {
          platform,
          externalId: connected.externalId
        }
      },
      create: {
        teamId,
        platform,
        externalId: connected.externalId,
        name: connected.name,
        accessTokenEncrypted: this.secretCrypto.encrypt(connected.accessToken),
        refreshTokenEncrypted: connected.refreshToken ? this.secretCrypto.encrypt(connected.refreshToken) : null,
        status: "active"
      },
      update: {
        teamId,
        name: connected.name,
        accessTokenEncrypted: this.secretCrypto.encrypt(connected.accessToken),
        refreshTokenEncrypted: connected.refreshToken ? this.secretCrypto.encrypt(connected.refreshToken) : null,
        status: "active"
      }
    });
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
      throw new BadRequestException(this.providerErrorMessage(body, `Provider request failed: ${response.status}`));
    }
    return (body ?? {}) as T;
  }

  private assertConfigured(providerConfig: ProviderOAuthConfig, platform: Platform) {
    if (!providerConfig.appId || !providerConfig.appSecret) {
      throw new BadRequestException(`${platform === Platform.META ? "Meta" : "TikTok"} 开发者应用未完整配置`);
    }
  }

  private requiredToken(value: string | undefined, message: string) {
    if (!value) throw new BadRequestException(message);
    return value;
  }

  private signOAuthState(payload: OAuthState) {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.oauthStateSecret()).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verifyOAuthState(state: string | undefined, expectedPlatform: Platform): OAuthState {
    if (!state) throw new BadRequestException("授权回调缺少 state");

    const [encoded, signature] = state.split(".");
    if (!encoded || !signature) throw new BadRequestException("授权 state 格式不正确");

    const expectedSignature = createHmac("sha256", this.oauthStateSecret()).update(encoded).digest("base64url");
    const signatureBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expectedSignature);
    if (signatureBytes.length !== expectedBytes.length || !timingSafeEqual(signatureBytes, expectedBytes)) {
      throw new BadRequestException("授权 state 签名无效");
    }

    let payload: OAuthState;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
    } catch {
      throw new BadRequestException("授权 state 内容不正确");
    }
    if (payload.platform !== expectedPlatform) throw new BadRequestException("授权平台不匹配");
    if (!payload.teamId || !payload.userId || !payload.returnUrl || !payload.iat) {
      throw new BadRequestException("授权 state 内容不完整");
    }
    if (Date.now() - payload.iat > STATE_TTL_MS) throw new BadRequestException("授权 state 已过期");

    return payload;
  }

  private oauthStateSecret() {
    return (
      this.config.get<string>("OAUTH_STATE_SECRET") ??
      this.config.get<string>("JWT_REFRESH_SECRET") ??
      "dev-oauth-state-secret"
    );
  }

  private normalizeReturnUrl(value?: string) {
    const fallback = this.defaultReturnUrl();
    if (!value) return fallback;

    try {
      const url = new URL(value);
      if (this.allowedReturnOrigins().has(url.origin)) return url.toString();
    } catch {
      return fallback;
    }

    return fallback;
  }

  private allowedReturnOrigins() {
    const configuredOrigins =
      this.config
        .get<string>("WEB_URLS")
        ?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [];
    const webUrl = this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    const origins = [webUrl, "http://localhost:3000", "http://localhost:3001", ...configuredOrigins].map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return origin;
      }
    });

    return new Set(origins);
  }

  private defaultReturnUrl() {
    const webUrl = this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    return new URL("/integrations", webUrl).toString();
  }

  private callbackResultUrl(returnUrl: string, params: Record<string, string>) {
    const url = new URL(returnUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private providerErrorMessage(body: unknown, fallback: string) {
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const message = record.message;
      if (typeof message === "string" && message.trim()) return message;

      const errorDescription = record.error_description;
      if (typeof errorDescription === "string" && errorDescription.trim()) return errorDescription;

      const error = record.error;
      if (typeof error === "string" && error.trim()) return error;
      if (error && typeof error === "object") {
        const nestedMessage = (error as Record<string, unknown>).message;
        if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage;
      }
    }

    return fallback;
  }

  private toUserMessage(err: unknown, fallback: string) {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }

  private audit(
    actorId: string,
    action: string,
    teamId: string,
    entityId: string | null,
    metadata: Record<string, unknown>
  ) {
    return this.db.auditLog.create({
      data: {
        actorId,
        teamId,
        action,
        entityType: "integration_account",
        entityId,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
  }
}
