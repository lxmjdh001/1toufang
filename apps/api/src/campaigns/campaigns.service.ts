import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Platform, Prisma, PublishStatus, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { PublisherService } from "../publisher/publisher.service";
import { CreateCampaignDto, UpdateCampaignDto } from "./dto";

@Injectable()
export class CampaignsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly publisher: PublisherService
  ) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    return this.db.campaign.findMany({
      where: { teamId },
      include: {
        createdBy: { include: { profile: true } },
        publishTasks: {
          orderBy: { createdAt: "desc" },
          take: 3
        },
        platformIdMappings: true
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(dto: CreateCampaignDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    await this.assertAssets(teamId, dto.platform, dto.adAccountId, dto.strategyId, dto.targetingId, dto.adCreativeId);

    const config = {
      ...(dto.config ?? {}),
      adAccountId: dto.adAccountId,
      strategyId: dto.strategyId,
      targetingId: dto.targetingId,
      adCreativeId: dto.adCreativeId,
      budget: dto.budget,
      notes: dto.notes
    };
    const campaign = await this.db.campaign.create({
      data: {
        teamId,
        createdById: user.id,
        platform: dto.platform,
        name: dto.name,
        status: PublishStatus.DRAFT,
        config: toJson(config)
      }
    });

    await this.audit(user.id, teamId, "CAMPAIGN_DRAFT_CREATED", campaign.id, {
      platform: campaign.platform,
      name: campaign.name,
      adAccountId: dto.adAccountId,
      strategyId: dto.strategyId,
      targetingId: dto.targetingId,
      adCreativeId: dto.adCreativeId
    });

    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensureCampaign(id, teamId);
    const campaign = await this.db.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        config: dto.config ? toJson(dto.config) : undefined
      }
    });

    await this.audit(user.id, teamId, "CAMPAIGN_UPDATED", id, {
      status: campaign.status,
      name: campaign.name
    });

    return campaign;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const campaign = await this.ensureCampaign(id, teamId);
    await this.db.campaign.delete({ where: { id } });
    await this.audit(user.id, teamId, "CAMPAIGN_DELETED", id, {
      status: campaign.status,
      name: campaign.name
    });
    return { ok: true };
  }

  async publish(id: string, user: AuthenticatedUser) {
    await this.ensureCampaign(id, await this.resolveTeamId(user));
    return this.publisher.publishCampaign(id, user);
  }

  async retryPublish(id: string, user: AuthenticatedUser) {
    await this.ensureCampaign(id, await this.resolveTeamId(user));
    return this.publisher.publishCampaign(id, user);
  }

  async preflight(id: string, user: AuthenticatedUser) {
    await this.ensureCampaign(id, await this.resolveTeamId(user));
    return this.publisher.preflightCampaign(id, user);
  }

  async publishTasks(id: string, user: AuthenticatedUser) {
    await this.ensureCampaign(id, await this.resolveTeamId(user));
    return this.publisher.listTasks(id, user);
  }

  private async assertAssets(
    teamId: string,
    platform: Platform,
    adAccountId: string,
    strategyId?: string,
    targetingId?: string,
    adCreativeId?: string
  ) {
    const adAccount = await this.db.adAccount.findFirst({
      where: { id: adAccountId, teamId, platform }
    });
    if (!adAccount) throw new BadRequestException("Ad account does not belong to current team or platform");

    if (strategyId) {
      const strategy = await this.db.strategy.findFirst({ where: { id: strategyId, teamId, platform } });
      if (!strategy) throw new BadRequestException("Strategy does not belong to current team or platform");
    }

    if (targetingId) {
      const targeting = await this.db.targeting.findFirst({ where: { id: targetingId, teamId, platform } });
      if (!targeting) throw new BadRequestException("Targeting does not belong to current team or platform");
    }

    if (adCreativeId) {
      const creative = await this.db.adCreative.findFirst({ where: { id: adCreativeId, teamId } });
      if (!creative) throw new BadRequestException("Creative does not belong to current team");
    }
  }

  private async ensureCampaign(id: string, teamId: string) {
    const campaign = await this.db.campaign.findFirst({ where: { id, teamId } });
    if (!campaign) throw new NotFoundException("Campaign not found");
    return campaign;
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
        entityType: "campaign",
        entityId,
        metadata: toJson(metadata)
      }
    });
  }
}

function toJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}
