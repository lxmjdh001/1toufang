import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { CreateRoleDto, SetRolePermissionsDto } from "./permissions.dto";

@Injectable()
export class PermissionsService {
  constructor(private readonly db: DatabaseService) {}

  list() {
    return this.db.permission.findMany({ orderBy: { code: "asc" } });
  }

  roles(teamId?: string) {
    return this.db.role.findMany({
      where: teamId ? { teamId } : undefined,
      include: {
        team: true,
        permissions: { include: { permission: true } },
        _count: { select: { members: true, employeeAccounts: true } }
      },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }]
    });
  }

  createRole(dto: CreateRoleDto) {
    return this.db.role.create({
      data: {
        teamId: dto.teamId,
        name: dto.name,
        description: dto.description
      }
    });
  }

  async setRolePermissions(id: string, dto: SetRolePermissionsDto) {
    const permissions = await this.db.permission.findMany({
      where: { code: { in: dto.permissionCodes } }
    });

    await this.db.$transaction([
      this.db.rolePermission.deleteMany({ where: { roleId: id } }),
      ...permissions.map((permission) =>
        this.db.rolePermission.create({
          data: {
            roleId: id,
            permissionId: permission.id
          }
        })
      )
    ]);

    return this.db.role.findUniqueOrThrow({
      where: { id },
      include: { permissions: { include: { permission: true } } }
    });
  }
}
