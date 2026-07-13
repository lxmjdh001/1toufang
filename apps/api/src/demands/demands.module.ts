import { Module } from "@nestjs/common";
import { DemandsController } from "./demands.controller";
import { DemandsService } from "./demands.service";

@Module({
  controllers: [DemandsController],
  providers: [DemandsService]
})
export class DemandsModule {}
