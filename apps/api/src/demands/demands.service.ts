import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateDemandDto, UpdateDemandDto } from "./dto";

@Injectable()
export class DemandsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const rows = await this.db.demand.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" }
    });
    const demandIds = rows.map((row) => row.id);
    const bindingIds = collectBindingIds(rows.map((row) => asRecord(row.config)));
    const [createdLogs, landingPages, offers, pwaApps] = await Promise.all([
      demandIds.length
        ? this.db.auditLog.findMany({
            where: {
              teamId,
              entityType: "demand",
              entityId: { in: demandIds },
              action: "DEMAND_CREATED"
            },
            include: { actor: { include: { profile: true } } },
            orderBy: { createdAt: "asc" }
          })
        : [],
      bindingIds.landingPageIds.length
        ? this.db.landingPage.findMany({
            where: { teamId, id: { in: bindingIds.landingPageIds } },
            select: { id: true, name: true, url: true }
          })
        : [],
      bindingIds.offerIds.length
        ? this.db.offer.findMany({
            where: { teamId, id: { in: bindingIds.offerIds } },
            select: { id: true, name: true, url: true }
          })
        : [],
      bindingIds.pwaAppIds.length
        ? this.db.pwaApp.findMany({
            where: { teamId, id: { in: bindingIds.pwaAppIds } },
            select: { id: true, name: true, startUrl: true }
          })
        : []
    ]);
    const creatorById = new Map(createdLogs.map((log) => [log.entityId ?? "", log.actor]));
    const landingPageById = new Map(landingPages.map((row) => [row.id, row]));
    const offerById = new Map(offers.map((row) => [row.id, row]));
    const pwaAppById = new Map(pwaApps.map((row) => [row.id, row]));

    return rows.map((row) => {
      const config = asRecord(row.config);
      const landingPageId = stringValue(config.landingPageId);
      const offerId = stringValue(config.offerId);
      const pwaAppId = stringValue(config.pwaAppId);
      const dueDate = stringValue(config.dueDate);
      return {
        ...row,
        creator: creatorById.get(row.id) ?? null,
        ageDays: ageDays(row.createdAt),
        overdue: isOverdue(dueDate, row.status),
        bindings: {
          landingPage: landingPageId ? landingPageById.get(landingPageId) ?? null : null,
          offer: offerId ? offerById.get(offerId) ?? null : null,
          pwaApp: pwaAppId ? pwaAppById.get(pwaAppId) ?? null : null
        }
      };
    });
  }

  async create(dto: CreateDemandDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    await this.validateBindings(teamId, dto.config);
    const row = await this.db.demand.create({
      data: {
        teamId,
        title: dto.title,
        type: dto.type,
        priority: dto.priority ?? "normal",
        status: dto.status ?? "backlog",
        description: dto.description,
        tags: dto.tags ?? [],
        config: dto.config ? toJson(dto.config) : undefined
      }
    });
    await this.audit(user.id, teamId, "DEMAND_CREATED", row.id, { title: row.title, type: row.type });
    return row;
  }

  async update(id: string, dto: UpdateDemandDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensure(id, teamId);
    await this.validateBindings(teamId, dto.config);
    const row = await this.db.demand.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        priority: dto.priority,
        status: dto.status,
        description: dto.description,
        tags: dto.tags,
        config: dto.config ? toJson(dto.config) : undefined
      }
    });
    await this.audit(user.id, teamId, "DEMAND_UPDATED", row.id, { title: row.title, status: row.status });
    return row;
  }

  async duplicate(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const source = await this.ensure(id, teamId);
    const row = await this.db.demand.create({
      data: {
        teamId,
        title: `${source.title} 副本`,
        type: source.type,
        priority: source.priority,
        status: "backlog",
        description: source.description,
        tags: Array.from(new Set([...(source.tags ?? []), "copied"])),
        config: toJson({
          ...asRecord(source.config),
          duplicatedFrom: source.id
        })
      }
    });
    await this.audit(user.id, teamId, "DEMAND_DUPLICATED", row.id, {
      sourceId: source.id,
      title: row.title
    });
    return row;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const row = await this.ensure(id, teamId);
    await this.db.demand.delete({ where: { id } });
    await this.audit(user.id, teamId, "DEMAND_DELETED", id, { title: row.title });
    return { ok: true };
  }

  private async ensure(id: string, teamId: string) {
    const row = await this.db.demand.findFirst({ where: { id, teamId } });
    if (!row) throw new NotFoundException("Demand not found");
    return row;
  }

  private async validateBindings(teamId: string, config?: Record<string, unknown>) {
    const record = asRecord(config);
    const landingPageId = stringValue(record.landingPageId);
    const offerId = stringValue(record.offerId);
    const pwaAppId = stringValue(record.pwaAppId);
    const [landingPage, offer, pwaApp] = await Promise.all([
      landingPageId ? this.db.landingPage.findFirst({ where: { id: landingPageId, teamId } }) : null,
      offerId ? this.db.offer.findFirst({ where: { id: offerId, teamId } }) : null,
      pwaAppId ? this.db.pwaApp.findFirst({ where: { id: pwaAppId, teamId } }) : null
    ]);

    if (landingPageId && !landingPage) throw new BadRequestException("Landing page not found");
    if (offerId && !offer) throw new BadRequestException("Offer not found");
    if (pwaAppId && !pwaApp) throw new BadRequestException("PWA app not found");
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
        entityType: "demand",
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

function collectBindingIds(configs: Record<string, unknown>[]) {
  const landingPageIds = new Set<string>();
  const offerIds = new Set<string>();
  const pwaAppIds = new Set<string>();
  for (const config of configs) {
    const landingPageId = stringValue(config.landingPageId);
    const offerId = stringValue(config.offerId);
    const pwaAppId = stringValue(config.pwaAppId);
    if (landingPageId) landingPageIds.add(landingPageId);
    if (offerId) offerIds.add(offerId);
    if (pwaAppId) pwaAppIds.add(pwaAppId);
  }
  return {
    landingPageIds: Array.from(landingPageIds),
    offerIds: Array.from(offerIds),
    pwaAppIds: Array.from(pwaAppIds)
  };
}

function ageDays(value: Date) {
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / 86_400_000));
}

function isOverdue(dueDate: string | undefined, status: string) {
  if (!dueDate || ["done", "rejected", "archived"].includes(status)) return false;
  const due = new Date(`${dueDate}T23:59:59`);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}
