import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { TargetingsController } from "./targetings.controller";
import { TargetingsService } from "./targetings.service";

@Module({
  imports: [DatabaseModule],
  controllers: [TargetingsController],
  providers: [TargetingsService]
})
export class TargetingsModule {}
