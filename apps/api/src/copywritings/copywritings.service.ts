import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateCopywritingDto, UpdateCopywritingDto } from "./dto";

@Injectable()
export class CopywritingsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    return this.db.copywriting.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(dto: CreateCopywritingDto, user: AuthenticatedUser) {
    const teamId = dto.teamId ?? (await this.resolveTeamId(user));
    const copywriting = await this.db.copywriting.create({
      data: {
        teamId,
        name: dto.name,
        primaryText: dto.primaryText,
        headline: dto.headline,
        description: dto.description,
        tags: dto.tags ?? [],
        remarks: dto.remarks
      }
    });

    await this.audit(user.id, teamId, "COPYWRITING_CREATED", copywriting.id, {
      name: copywriting.name,
      headline: copywriting.headline
    });

    return copywriting;
  }

  async update(id: string, dto: UpdateCopywritingDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensureCopywriting(id, teamId);
    const copywriting = await this.db.copywriting.update({
      where: { id },
      data: {
        name: dto.name,
        primaryText: dto.primaryText,
        headline: dto.headline,
        description: dto.description,
        tags: dto.tags,
        remarks: dto.remarks
      }
    });

    await this.audit(user.id, teamId, "COPYWRITING_UPDATED", copywriting.id, {
      name: copywriting.name,
      headline: copywriting.headline
    });

    return copywriting;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const copywriting = await this.ensureCopywriting(id, teamId);
    await this.db.copywriting.delete({ where: { id } });
    await this.audit(user.id, teamId, "COPYWRITING_DELETED", id, {
      name: copywriting.name,
      headline: copywriting.headline
    });
    return { ok: true };
  }

  private async ensureCopywriting(id: string, teamId: string) {
    const copywriting = await this.db.copywriting.findFirst({ where: { id, teamId } });
    if (!copywriting) throw new NotFoundException("Copywriting not found");
    return copywriting;
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
        entityType: "copywriting",
        entityId,
        metadata: toJson(metadata)
      }
    });
  }
}

function toJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}
