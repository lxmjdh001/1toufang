import { ApiProperty } from "@nestjs/swagger";
import { Platform } from "@1toufang/database/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class ReportOverviewQueryDto {
  @ApiProperty({ required: false, example: "2026-07-01" })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, example: "2026-07-12" })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ enum: Platform, required: false })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adAccountId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  campaignId?: string;
}

export class DryRunReportSyncDto {
  @ApiProperty({ required: false, example: "2026-07-01" })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, example: "2026-07-12" })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ enum: Platform, required: false })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adAccountId?: string;
}

export class ReportSyncDto extends DryRunReportSyncDto {}

export class GlobalSearchQueryDto {
  @ApiProperty({ required: false, example: "Facebook" })
  @IsOptional()
  @IsString()
  q?: string;
}
