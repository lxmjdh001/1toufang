import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { ConversionsController } from "./conversions.controller";
import { TrackController } from "./track.controller";

@Module({
  controllers: [AnalyticsController, ConversionsController, TrackController],
  providers: [AnalyticsService]
})
export class AnalyticsModule {}
