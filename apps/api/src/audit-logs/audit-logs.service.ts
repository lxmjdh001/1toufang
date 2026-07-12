import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class AuditLogsService {
  constructor(private readonly db: DatabaseService) {}

  list() {
    return this.db.auditLog.findMany({
      include: { actor: { include: { profile: true } }, team: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }
}
