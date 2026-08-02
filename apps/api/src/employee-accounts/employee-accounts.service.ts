import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EmployeeStatus, TeamStatus } from "@1toufang/database/client";
import { DatabaseService } from "../database/database.service";
import { CreateEmployeeAccountDto, UpdateEmployeeAccountDto } from "./dto";

@Injectable()
export class EmployeeAccountsService {
  constructor(private readonly db: DatabaseService) {}

  list() {
    return this.db.employeeAccount.findMany({
      include: { user: { include: { profile: true } }, team: true, role: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(dto: CreateEmployeeAccountDto) {
    const team = await this.db.team.findUnique({ where: { id: dto.teamId } });
    if (!team) throw new NotFoundException("Team not found");
    if (team.status !== TeamStatus.ACTIVE || (team.expiresAt && team.expiresAt <= new Date())) {
      throw new BadRequestException("团队未启用或已到期，不能新增员工号");
    }

    const activeEmployees = await this.db.employeeAccount.count({
      where: { teamId: dto.teamId, status: EmployeeStatus.ACTIVE }
    });
    if (activeEmployees >= team.seatLimit) {
      throw new BadRequestException(`该团队最多可开通 ${team.seatLimit} 个员工号`);
    }

    return this.db.employeeAccount.create({
      data: {
        employeeNo: dto.employeeNo,
        userId: dto.userId,
        teamId: dto.teamId,
        roleId: dto.roleId,
        status: EmployeeStatus.ACTIVE
      }
    });
  }

  get(id: string) {
    return this.db.employeeAccount.findUniqueOrThrow({
      where: { id },
      include: { user: { include: { profile: true } }, team: true, role: true, dataScopes: true }
    });
  }

  update(id: string, dto: UpdateEmployeeAccountDto) {
    return this.db.employeeAccount.update({
      where: { id },
      data: { roleId: dto.roleId }
    });
  }

  enable(id: string) {
    return this.db.employeeAccount.update({
      where: { id },
      data: { status: EmployeeStatus.ACTIVE }
    });
  }

  disable(id: string) {
    return this.db.employeeAccount.update({
      where: { id },
      data: { status: EmployeeStatus.DISABLED }
    });
  }
}
