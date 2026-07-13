import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateDomainDto, UpdateDomainDto } from "./dto";

@Injectable()
export class DomainsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const rows = await this.db.domain.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" }
    });
    const domainIds = rows.map((row) => row.id);
    const campaigns = domainIds.length
      ? await this.db.campaign.findMany({
          where: { teamId },
          select: { id: true, config: true }
        })
      : [];
    const usageById = new Map<string, number>();
    for (const campaign of campaigns) {
      const domainId = stringValue(asRecord(campaign.config).domainId);
      if (!domainId) continue;
      usageById.set(domainId, (usageById.get(domainId) ?? 0) + 1);
    }

    return rows.map((row) => ({
      ...row,
      usageCount: usageById.get(row.id) ?? 0,
      dnsStatus: stringValue(asRecord(row.config).dnsStatus) ?? inferDnsStatus(row.status),
      sslStatus: stringValue(asRecord(row.config).sslStatus) ?? inferSslStatus(row.status)
    }));
  }

  async create(dto: CreateDomainDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    const row = await this.db.domain.create({
      data: {
        teamId,
        domain: normalizeDomain(dto.domain),
        status: dto.status ?? "verified",
        config: dto.config ? toJson(dto.config) : undefined
      }
    });
    await this.audit(user.id, teamId, "DOMAIN_CREATED", row.id, { domain: row.domain });
    return row;
  }

  async buy(dto: CreateDomainDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    const row = await this.db.domain.create({
      data: {
        teamId,
        domain: normalizeDomain(dto.domain),
        status: dto.status ?? "purchased",
        config: toJson({
          provider: "manual",
          purchaseMode: "buy_domain",
          dnsStatus: "pending",
          sslStatus: "pending",
          ...(dto.config ?? {})
        })
      }
    });
    await this.audit(user.id, teamId, "DOMAIN_PURCHASE_REQUESTED", row.id, {
      domain: row.domain,
      config: dto.config
    });
    return row;
  }

  async update(id: string, dto: UpdateDomainDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensure(id, teamId);
    const row = await this.db.domain.update({
      where: { id },
      data: {
        domain: dto.domain ? normalizeDomain(dto.domain) : undefined,
        status: dto.status,
        config: dto.config ? toJson(dto.config) : undefined
      }
    });
    await this.audit(user.id, teamId, "DOMAIN_UPDATED", id, { domain: row.domain });
    return row;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const row = await this.ensure(id, teamId);
    await this.db.domain.delete({ where: { id } });
    await this.audit(user.id, teamId, "DOMAIN_DELETED", id, { domain: row.domain });
    return { ok: true };
  }

  private async ensure(id: string, teamId: string) {
    const row = await this.db.domain.findFirst({ where: { id, teamId } });
    if (!row) throw new NotFoundException("Domain not found");
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
        entityType: "domain",
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

function normalizeDomain(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase();
}

function inferDnsStatus(status?: string | null) {
  if (status === "verified" || status === "active") return "verified";
  if (status === "failed") return "failed";
  return "pending";
}

function inferSslStatus(status?: string | null) {
  if (status === "verified" || status === "active") return "issued";
  if (status === "failed") return "failed";
  return "pending";
}
