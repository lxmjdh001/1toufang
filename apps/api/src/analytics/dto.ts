import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsObject, IsOptional, IsString } from "class-validator";

export class AnalyticsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  landingPageId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  offerId?: string;
}

export class TrackVisitDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adSetId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  landingPageId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  offerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pwaAppId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  domainId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  project?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  client?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  device?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  browser?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  os?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referrer?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  event1?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  event2?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  event3?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  clickCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  conversionRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class TrackConversionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  visitorLogId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adSetId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  landingPageId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  offerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pwaAppId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  domainId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  eventName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  eventValue?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
