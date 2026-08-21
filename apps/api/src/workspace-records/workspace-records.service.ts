import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { CreateWorkspaceRecordDto, UpdateWorkspaceRecordDto } from "./dto";

@Injectable()
export class WorkspaceRecordsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser, module?: string, query?: string) {
    const teamId = await this.resolveTeamId(user);
    return this.db.workspaceRecord.findMany({
      where: {
        teamId,
        ...(module ? { module } : {}),
        ...(query?.trim()
          ? { OR: [{ name: { contains: query.trim(), mode: "insensitive" } }, { module: { contains: query.trim(), mode: "insensitive" } }] }
          : {})
      },
      include: { createdBy: { include: { profile: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(dto: CreateWorkspaceRecordDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const record = await this.db.workspaceRecord.create({
      data: {
        teamId,
        createdById: user.id,
        module: dto.module,
        name: dto.name.trim(),
        status: dto.status ?? "draft",
        config: dto.config ? (dto.config as Prisma.InputJsonValue) : undefined
      }
    });
    await this.audit(user, teamId, "WORKSPACE_RECORD_CREATED", record.id, { module: record.module, name: record.name });
    return record;
  }

  async update(id: string, dto: UpdateWorkspaceRecordDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    await this.ensure(id, teamId);
    const record = await this.db.workspaceRecord.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        status: dto.status,
        config: dto.config ? (dto.config as Prisma.InputJsonValue) : undefined
      }
    });
    await this.audit(user, teamId, "WORKSPACE_RECORD_UPDATED", id, { module: record.module, name: record.name });
    return record;
  }

  async action(id: string, action: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const source = await this.ensure(id, teamId);
    if (action === "duplicate") {
      const copy = await this.db.workspaceRecord.create({
        data: {
          teamId,
          createdById: user.id,
          module: source.module,
          name: `${source.name} 副本`,
          status: "draft",
          config: source.config ?? undefined
        }
      });
      await this.audit(user, teamId, "WORKSPACE_RECORD_DUPLICATED", copy.id, { sourceId: id, module: copy.module });
      return copy;
    }
    const statusByAction: Record<string, string> = {
      activate: "active",
      pause: "paused",
      run: "running",
      send: "sent",
      archive: "archived",
      restore: "draft"
    };
    const nextStatus = statusByAction[action];
    if (!nextStatus) throw new BadRequestException("Unsupported workspace action");
    const record = await this.db.workspaceRecord.update({ where: { id }, data: { status: nextStatus } });
    await this.audit(user, teamId, `WORKSPACE_RECORD_${action.toUpperCase()}`, id, { module: record.module, status: nextStatus });
    return record;
  }

  async remove(id: string, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const record = await this.ensure(id, teamId);
    await this.db.workspaceRecord.delete({ where: { id } });
    await this.audit(user, teamId, "WORKSPACE_RECORD_DELETED", id, { module: record.module, name: record.name });
    return { ok: true };
  }

  private async ensure(id: string, teamId: string) {
    const record = await this.db.workspaceRecord.findFirst({ where: { id, teamId } });
    if (!record) throw new NotFoundException("Workspace record not found");
    return record;
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

  private audit(user: AuthenticatedUser, teamId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    return this.db.auditLog.create({
      data: { actorId: user.id, teamId, action, entityType: "workspace_record", entityId, metadata: metadata as Prisma.InputJsonValue }
    });
  }
}
