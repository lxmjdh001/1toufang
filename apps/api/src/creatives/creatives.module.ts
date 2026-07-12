import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CreativesController } from "./creatives.controller";
import { CreativesService } from "./creatives.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CreativesController],
  providers: [CreativesService]
})
export class CreativesModule {}
