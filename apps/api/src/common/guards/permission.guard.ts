import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EmployeeStatus, TeamMemberStatus } from "@1toufang/database/client";
import { REQUIRED_PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { AuthenticatedRequest } from "../types/authenticated-request";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Missing authenticated user");
    }

    const granted = await this.resolvePermissionCodes(user.id, user.employeeNo, user.teamId);
    const allowed = required.every((code) => granted.has(code));
    if (!allowed) {
      throw new ForbiddenException({
        code: "missing_permission",
        required
      });
    }

    return true;
  }

  private async resolvePermissionCodes(userId: string, employeeNo?: string, teamId?: string) {
    const granted = new Set<string>();

    if (employeeNo) {
      const employee = await this.db.employeeAccount.findUnique({
        where: { employeeNo },
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } }
            }
          }
        }
      });

      if (employee?.userId === userId && employee.status === EmployeeStatus.ACTIVE) {
        for (const rolePermission of employee.role?.permissions ?? []) {
          granted.add(rolePermission.permission.code);
        }
      }
    }

    const memberships = await this.db.teamMember.findMany({
      where: {
        userId,
        status: TeamMemberStatus.ACTIVE,
        ...(teamId ? { teamId } : {})
      },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } }
          }
        },
        permissions: {
          include: { permission: true }
        }
      }
    });

    for (const membership of memberships) {
      for (const rolePermission of membership.role?.permissions ?? []) {
        granted.add(rolePermission.permission.code);
      }

      for (const override of membership.permissions) {
        if (override.allowed) {
          granted.add(override.permission.code);
        } else {
          granted.delete(override.permission.code);
        }
      }
    }

    return granted;
  }
}
