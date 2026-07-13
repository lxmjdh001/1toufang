import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AnalyticsService } from "./analytics.service";
import { TrackConversionDto, TrackVisitDto } from "./dto";

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

@ApiTags("Tracking")
@Controller("track")
export class TrackController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post("visit")
  visit(@Body() dto: TrackVisitDto, @Req() request: RequestLike) {
    return this.analyticsService.trackVisit(dto, request);
  }

  @Post("conversion")
  conversion(@Body() dto: TrackConversionDto, @Req() request: RequestLike) {
    return this.analyticsService.trackConversion(dto, request);
  }
}
