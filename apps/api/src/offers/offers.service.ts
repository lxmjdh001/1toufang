import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateOfferDto, UpdateOfferDto } from "./dto";

@Injectable()
export class OffersService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const rows = await this.db.offer.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" }
    });
    const offerIds = rows.map((row) => row.id);
    const [campaigns, createdLogs] = await Promise.all([
      offerIds.length
        ? this.db.campaign.findMany({
            where: { teamId },
            select: { id: true, config: true }
          })
        : [],
      offerIds.length
        ? this.db.auditLog.findMany({
            where: {
              teamId,
              entityType: "offer",
              entityId: { in: offerIds },
              action: "OFFER_CREATED"
            },
            include: { actor: { include: { profile: true } } },
            orderBy: { createdAt: "asc" }
          })
        : []
    ]);
    const creatorById = new Map(createdLogs.map((log) => [log.entityId ?? "", log.actor]));
    const usageById = new Map<string, number>();
    for (const campaign of campaigns) {
      const offerId = stringValue(asRecord(campaign.config).offerId);
      if (!offerId) continue;
      usageById.set(offerId, (usageById.get(offerId) ?? 0) + 1);
    }

    return rows.map((row) => ({
      ...row,
      creator: creatorById.get(row.id) ?? null,
      view: asRecord(row.config).source === "generated" ? "generated" : "original",
      usageCount: usageById.get(row.id) ?? 0
    }));
  }

  async create(dto: CreateOfferDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    const row = await this.db.offer.create({
      data: {
        teamId,
        name: dto.name,
        url: dto.url,
        price: dto.price,
        status: dto.status ?? "ready",
        config: dto.config ? toJson(dto.config) : undefined
      }
    });
    await this.audit(user.id, teamId, "OFFER_CREATED", row.id, { name: row.name, url: row.url });
    return row;
  }

  async update(id: string, dto: UpdateOfferDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensure(id, teamId);
    const row = await this.db.offer.update({
      where: { id },
      data: {
        name: dto.name,
        url: dto.url,
        price: dto.price,
        status: dto.status,
        config: dto.config ? toJson(dto.config) : undefined
      }
    });
    await this.audit(user.id, teamId, "OFFER_UPDATED", id, { name: row.name, url: row.url });
    return row;
  }

  async duplicate(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const source = await this.ensure(id, teamId);
    const row = await this.db.offer.create({
      data: {
        teamId,
        name: `${source.name} 副本`,
        url: source.url,
        price: source.price,
        status: "draft",
        config: toJson({
          ...asRecord(source.config),
          duplicatedFrom: source.id
        })
      }
    });
    await this.audit(user.id, teamId, "OFFER_DUPLICATED", row.id, {
      sourceId: source.id,
      name: row.name,
      url: row.url
    });
    return row;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const row = await this.ensure(id, teamId);
    await this.db.offer.delete({ where: { id } });
    await this.audit(user.id, teamId, "OFFER_DELETED", id, { name: row.name, url: row.url });
    return { ok: true };
  }

  private async ensure(id: string, teamId: string) {
    const row = await this.db.offer.findFirst({ where: { id, teamId } });
    if (!row) throw new NotFoundException("Offer not found");
    return row;
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
        entityType: "offer",
        entityId,
        metadata: metadata as Prisma.InputJsonValue
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

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
