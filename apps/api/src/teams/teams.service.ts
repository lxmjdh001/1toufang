import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class TeamsService {
  constructor(private readonly db: DatabaseService) {}

  list() {
    return this.db.team.findMany({
      include: { owner: { include: { profile: true } }, members: true },
      orderBy: { createdAt: "desc" }
    });
  }
}
