import { BadRequestException, Injectable } from "@nestjs/common";
import { TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateAdAccountDto } from "./dto";

@Injectable()
export class AdAccountsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    return this.db.adAccount.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" }
    });
  }

  async createManual(dto: CreateAdAccountDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    return this.db.adAccount.upsert({
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
        currency: dto.currency,
        timezone: dto.timezone,
        status: "manual"
      },
      update: {
        teamId,
        name: dto.name,
        currency: dto.currency,
        timezone: dto.timezone,
        status: "manual"
      }
    });
  }

  async sync(id: string) {
    const adAccount = await this.db.adAccount.findUniqueOrThrow({ where: { id } });
    return this.db.adAccount.update({
      where: { id },
      data: {
        status: adAccount.status ?? "sync_pending",
        updatedAt: new Date()
      }
    });
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
}
