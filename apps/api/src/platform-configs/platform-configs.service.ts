import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { Platform, Prisma } from "@1toufang/database/client";
import * as bcrypt from "bcryptjs";
import { SecretCryptoService } from "../common/crypto/secret-crypto.service";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { RevealPlatformSecretDto, UpdatePlatformConfigDto } from "./dto";

const PLATFORMS = [Platform.META, Platform.TIKTOK] as const;

@Injectable()
export class PlatformConfigsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly secretCrypto: SecretCryptoService
  ) {}

  async list() {
    const rows = await this.db.platformDeveloperConfig.findMany({
      orderBy: { platform: "asc" }
    });
    return PLATFORMS.map((platform) => this.toSafeView(rows.find((row) => row.platform === platform) ?? { platform }));
  }

  async getSafe(platformParam: string) {
    const platform = this.parsePlatform(platformParam);
    const row = await this.db.platformDeveloperConfig.findUnique({ where: { platform } });
    return this.toSafeView(row ?? { platform });
  }

  async upsert(platformParam: string, dto: UpdatePlatformConfigDto, user: AuthenticatedUser) {
    const platform = this.parsePlatform(platformParam);
    const normalizedScopes = dto.scopes?.map((scope) => scope.trim()).filter(Boolean);
    const secretData =
      dto.appSecret?.trim() != null && dto.appSecret.trim().length > 0
        ? { appSecretEncrypted: this.secretCrypto.encrypt(dto.appSecret.trim()) }
        : dto.clearAppSecret
          ? { appSecretEncrypted: null }
          : {};

    const row = await this.db.platformDeveloperConfig.upsert({
      where: { platform },
      create: {
        platform,
        appId: cleanNullable(dto.appId),
        redirectUri: cleanNullable(dto.redirectUri),
        scopes: normalizedScopes ?? [],
        apiVersion: cleanNullable(dto.apiVersion),
        apiBaseUrl: cleanNullable(dto.apiBaseUrl),
        environment: cleanNullable(dto.environment) ?? "sandbox",
        isEnabled: dto.isEnabled ?? false,
        updatedById: user.id,
        ...secretData
      },
      update: {
        appId: dto.appId === undefined ? undefined : cleanNullable(dto.appId),
        redirectUri: dto.redirectUri === undefined ? undefined : cleanNullable(dto.redirectUri),
        scopes: normalizedScopes,
        apiVersion: dto.apiVersion === undefined ? undefined : cleanNullable(dto.apiVersion),
        apiBaseUrl: dto.apiBaseUrl === undefined ? undefined : cleanNullable(dto.apiBaseUrl),
        environment: dto.environment === undefined ? undefined : cleanNullable(dto.environment) ?? "sandbox",
        isEnabled: dto.isEnabled,
        updatedById: user.id,
        ...secretData
      }
    });

    await this.audit(user.id, "PLATFORM_CONFIG_UPDATED", platform, {
      hasAppId: Boolean(row.appId),
      hasAppSecret: Boolean(row.appSecretEncrypted),
      isEnabled: row.isEnabled
    });

    return this.toSafeView(row);
  }

  async revealSecret(platformParam: string, dto: RevealPlatformSecretDto, user: AuthenticatedUser) {
    const platform = this.parsePlatform(platformParam);
    const admin = await this.db.user.findUnique({ where: { id: user.id } });
    if (!admin) throw new UnauthorizedException("User not found");

    const passwordOk = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!passwordOk) {
      await this.audit(user.id, "PLATFORM_CONFIG_REVEAL_DENIED", platform, {});
      throw new UnauthorizedException("管理员密码不正确");
    }

    const row = await this.db.platformDeveloperConfig.findUnique({ where: { platform } });
    if (!row) throw new NotFoundException("平台开发者配置不存在");
    if (!row.appSecretEncrypted) throw new BadRequestException("该平台还没有保存 App Secret");

    await this.audit(user.id, "PLATFORM_CONFIG_SECRET_REVEALED", platform, {});

    return {
      platform,
      appSecret: this.secretCrypto.decrypt(row.appSecretEncrypted),
      revealedAt: new Date().toISOString()
    };
  }

  async getOAuthConfig(platform: Platform) {
    const row = await this.db.platformDeveloperConfig.findUnique({ where: { platform } });
    if (!row?.isEnabled || !row.appId) return null;

    return {
      appId: row.appId,
      appSecret: row.appSecretEncrypted ? this.secretCrypto.decrypt(row.appSecretEncrypted) : null,
      redirectUri: row.redirectUri,
      scopes: row.scopes,
      apiVersion: row.apiVersion,
      apiBaseUrl: row.apiBaseUrl,
      environment: row.environment
    };
  }

  private toSafeView(row: Partial<{ platform: Platform; appSecretEncrypted: string | null }> & Record<string, unknown>) {
    const encrypted = typeof row.appSecretEncrypted === "string" ? row.appSecretEncrypted : null;
    return {
      id: typeof row.id === "string" ? row.id : null,
      platform: row.platform,
      appId: row.appId ?? "",
      appSecretMasked: encrypted ? maskSecret(this.secretCrypto.decrypt(encrypted)) : "",
      hasAppSecret: Boolean(encrypted),
      redirectUri: row.redirectUri ?? "",
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
      apiVersion: row.apiVersion ?? "",
      apiBaseUrl: row.apiBaseUrl ?? "",
      environment: row.environment ?? "sandbox",
      isEnabled: row.isEnabled ?? false,
      updatedAt: row.updatedAt ?? null
    };
  }

  private parsePlatform(value: string) {
    const normalized = value.toUpperCase();
    if (normalized === Platform.META || normalized === Platform.TIKTOK) {
      return normalized;
    }
    throw new BadRequestException("Unsupported platform");
  }

  private audit(actorId: string, action: string, platform: Platform, metadata: Record<string, unknown>) {
    return this.db.auditLog.create({
      data: {
        actorId,
        action,
        entityType: "platform_developer_config",
        entityId: platform,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
  }
}

function cleanNullable(value?: string) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maskSecret(secret: string) {
  const suffix = secret.slice(-4);
  return suffix ? `••••••••${suffix}` : "";
}
