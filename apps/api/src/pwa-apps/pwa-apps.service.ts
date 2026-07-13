import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreatePwaAppDto, UpdatePwaAppDto } from "./dto";

@Injectable()
export class PwaAppsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const rows = await this.db.pwaApp.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" }
    });
    const pwaAppIds = rows.map((row) => row.id);
    const bindingIds = collectBindingIds(rows.map((row) => asRecord(row.config)));
    const [campaigns, createdLogs, landingPages, offers, domains] = await Promise.all([
      pwaAppIds.length
        ? this.db.campaign.findMany({
            where: { teamId },
            select: { id: true, config: true }
          })
        : [],
      pwaAppIds.length
        ? this.db.auditLog.findMany({
            where: {
              teamId,
              entityType: "pwa_app",
              entityId: { in: pwaAppIds },
              action: "PWA_APP_CREATED"
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
      bindingIds.domainIds.length
        ? this.db.domain.findMany({
            where: { teamId, id: { in: bindingIds.domainIds } },
            select: { id: true, domain: true }
          })
        : []
    ]);
    const creatorById = new Map(createdLogs.map((log) => [log.entityId ?? "", log.actor]));
    const landingPageById = new Map(landingPages.map((row) => [row.id, row]));
    const offerById = new Map(offers.map((row) => [row.id, row]));
    const domainById = new Map(domains.map((row) => [row.id, row]));
    const usageById = new Map<string, number>();

    for (const campaign of campaigns) {
      const pwaAppId = stringValue(asRecord(campaign.config).pwaAppId);
      if (!pwaAppId) continue;
      usageById.set(pwaAppId, (usageById.get(pwaAppId) ?? 0) + 1);
    }

    return rows.map((row) => {
      const config = asRecord(row.config);
      const landingPageId = stringValue(config.landingPageId);
      const offerId = stringValue(config.offerId);
      const domainId = stringValue(config.domainId);
      return {
        ...row,
        creator: creatorById.get(row.id) ?? null,
        usageCount: usageById.get(row.id) ?? 0,
        bindings: {
          landingPage: landingPageId ? landingPageById.get(landingPageId) ?? null : null,
          offer: offerId ? offerById.get(offerId) ?? null : null,
          domain: domainId ? domainById.get(domainId) ?? null : null
        },
        manifestPreview: buildManifest(row.name, row.startUrl, config)
      };
    });
  }

  async create(dto: CreatePwaAppDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    await this.validateBindings(teamId, dto.config);
    const row = await this.db.pwaApp.create({
      data: {
        teamId,
        name: dto.name,
        startUrl: dto.startUrl,
        status: dto.status ?? "draft",
        config: dto.config ? toJson(dto.config) : undefined
      }
    });
    await this.audit(user.id, teamId, "PWA_APP_CREATED", row.id, { name: row.name, startUrl: row.startUrl });
    return row;
  }

  async update(id: string, dto: UpdatePwaAppDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensure(id, teamId);
    await this.validateBindings(teamId, dto.config);
    const row = await this.db.pwaApp.update({
      where: { id },
      data: {
        name: dto.name,
        startUrl: dto.startUrl,
        status: dto.status,
        config: dto.config ? toJson(dto.config) : undefined
      }
    });
    await this.audit(user.id, teamId, "PWA_APP_UPDATED", id, { name: row.name, startUrl: row.startUrl });
    return row;
  }

  async duplicate(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const source = await this.ensure(id, teamId);
    const row = await this.db.pwaApp.create({
      data: {
        teamId,
        name: `${source.name} 副本`,
        startUrl: source.startUrl,
        status: "draft",
        config: toJson({
          ...asRecord(source.config),
          duplicatedFrom: source.id
        })
      }
    });
    await this.audit(user.id, teamId, "PWA_APP_DUPLICATED", row.id, {
      sourceId: source.id,
      name: row.name,
      startUrl: row.startUrl
    });
    return row;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const row = await this.ensure(id, teamId);
    await this.db.pwaApp.delete({ where: { id } });
    await this.audit(user.id, teamId, "PWA_APP_DELETED", id, { name: row.name, startUrl: row.startUrl });
    return { ok: true };
  }

  private async ensure(id: string, teamId: string) {
    const row = await this.db.pwaApp.findFirst({ where: { id, teamId } });
    if (!row) throw new NotFoundException("PWA app not found");
    return row;
  }

  private async validateBindings(teamId: string, config?: Record<string, unknown>) {
    const record = asRecord(config);
    const landingPageId = stringValue(record.landingPageId);
    const offerId = stringValue(record.offerId);
    const domainId = stringValue(record.domainId);

    const [landingPage, offer, domain] = await Promise.all([
      landingPageId ? this.db.landingPage.findFirst({ where: { id: landingPageId, teamId } }) : null,
      offerId ? this.db.offer.findFirst({ where: { id: offerId, teamId } }) : null,
      domainId ? this.db.domain.findFirst({ where: { id: domainId, teamId } }) : null
    ]);

    if (landingPageId && !landingPage) throw new BadRequestException("Landing page not found");
    if (offerId && !offer) throw new BadRequestException("Offer not found");
    if (domainId && !domain) throw new BadRequestException("Domain not found");
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
        entityType: "pwa_app",
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
  const domainIds = new Set<string>();
  for (const config of configs) {
    const landingPageId = stringValue(config.landingPageId);
    const offerId = stringValue(config.offerId);
    const domainId = stringValue(config.domainId);
    if (landingPageId) landingPageIds.add(landingPageId);
    if (offerId) offerIds.add(offerId);
    if (domainId) domainIds.add(domainId);
  }
  return {
    landingPageIds: Array.from(landingPageIds),
    offerIds: Array.from(offerIds),
    domainIds: Array.from(domainIds)
  };
}

function buildManifest(name: string, startUrl: string, config: Record<string, unknown>) {
  return {
    name,
    short_name: stringValue(config.shortName) ?? name.slice(0, 12),
    start_url: startUrl,
    display: stringValue(config.displayMode) ?? "standalone",
    orientation: stringValue(config.orientation) ?? "portrait",
    theme_color: stringValue(config.themeColor) ?? "#2563eb",
    background_color: stringValue(config.backgroundColor) ?? "#ffffff",
    icons: stringValue(config.iconUrl) ? [{ src: stringValue(config.iconUrl), sizes: "512x512", type: "image/png" }] : []
  };
}
