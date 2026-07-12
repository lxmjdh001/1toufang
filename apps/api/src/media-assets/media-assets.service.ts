import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateMediaAssetDto, UpdateMediaAssetDto } from "./dto";

@Injectable()
export class MediaAssetsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    return this.db.mediaAsset.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(dto: CreateMediaAssetDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    const asset = await this.db.mediaAsset.create({
      data: {
        teamId,
        name: dto.name,
        fileType: dto.fileType,
        url: dto.url,
        thumbnail: dto.thumbnail,
        sizeBytes: dto.sizeBytes,
        tags: dto.tags ?? []
      }
    });

    await this.audit(user.id, teamId, "MEDIA_ASSET_CREATED", asset.id, {
      name: asset.name,
      fileType: asset.fileType
    });

    return asset;
  }

  async update(id: string, dto: UpdateMediaAssetDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensureAsset(id, teamId);
    const asset = await this.db.mediaAsset.update({
      where: { id },
      data: {
        name: dto.name,
        fileType: dto.fileType,
        url: dto.url,
        thumbnail: dto.thumbnail,
        sizeBytes: dto.sizeBytes,
        tags: dto.tags
      }
    });

    await this.audit(user.id, teamId, "MEDIA_ASSET_UPDATED", asset.id, {
      name: asset.name,
      fileType: asset.fileType
    });

    return asset;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const asset = await this.ensureAsset(id, teamId);
    await this.db.mediaAsset.delete({ where: { id } });
    await this.audit(user.id, teamId, "MEDIA_ASSET_DELETED", id, {
      name: asset.name,
      fileType: asset.fileType
    });
    return { ok: true };
  }

  private async ensureAsset(id: string, teamId: string) {
    const asset = await this.db.mediaAsset.findFirst({ where: { id, teamId } });
    if (!asset) throw new NotFoundException("Media asset not found");
    return asset;
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
        entityType: "media_asset",
        entityId,
        metadata: toJson(metadata)
      }
    });
  }
}

function toJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}
