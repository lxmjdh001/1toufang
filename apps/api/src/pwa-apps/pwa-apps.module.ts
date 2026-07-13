import { Module } from "@nestjs/common";
import { PwaAppsController } from "./pwa-apps.controller";
import { PwaAppsService } from "./pwa-apps.service";

@Module({
  controllers: [PwaAppsController],
  providers: [PwaAppsService]
})
export class PwaAppsModule {}
