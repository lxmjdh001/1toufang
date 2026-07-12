import { Injectable } from "@nestjs/common";
import { EmployeeStatus } from "@1toufang/database/client";
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

  create(dto: CreateEmployeeAccountDto) {
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
