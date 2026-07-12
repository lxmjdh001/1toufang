import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { CreateEmployeeAccountDto, UpdateEmployeeAccountDto } from "./dto";
import { EmployeeAccountsService } from "./employee-accounts.service";

@ApiTags("Employee Accounts")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("employees.manage")
@Controller("admin/employees")
export class EmployeeAccountsController {
  constructor(private readonly employeeAccountsService: EmployeeAccountsService) {}

  @Get()
  list() {
    return this.employeeAccountsService.list();
  }

  @Post()
  create(@Body() dto: CreateEmployeeAccountDto) {
    return this.employeeAccountsService.create(dto);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.employeeAccountsService.get(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateEmployeeAccountDto) {
    return this.employeeAccountsService.update(id, dto);
  }

  @Post(":id/enable")
  enable(@Param("id") id: string) {
    return this.employeeAccountsService.enable(id);
  }

  @Post(":id/disable")
  disable(@Param("id") id: string) {
    return this.employeeAccountsService.disable(id);
  }
}
