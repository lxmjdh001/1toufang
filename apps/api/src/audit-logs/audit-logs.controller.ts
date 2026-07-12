import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { AuditLogsService } from "./audit-logs.service";

@ApiTags("Audit Logs")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("audit_logs.view")
@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  list() {
    return this.auditLogsService.list();
  }
}
