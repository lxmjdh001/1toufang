import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { StrategiesController } from "./strategies.controller";
import { StrategiesService } from "./strategies.service";

@Module({
  imports: [DatabaseModule],
  controllers: [StrategiesController],
  providers: [StrategiesService]
})
export class StrategiesModule {}
