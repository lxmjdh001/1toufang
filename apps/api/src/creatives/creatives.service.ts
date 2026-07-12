import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateCreativeDto, UpdateCreativeDto } from "./dto";

@Injectable()
export class CreativesService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    return this.db.adCreative.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" }
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
