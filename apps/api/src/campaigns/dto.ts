import { ApiProperty } from "@nestjs/swagger";
import { Platform, PublishStatus } from "@1toufang/database/client";
import { IsEnum, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

export class CreateCampaignDto {
  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  adAccountId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  strategyId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetingId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adCreativeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamId?: string;
}

export class UpdateCampaignDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: PublishStatus, required: false })
  @IsOptional()
  @IsEnum(PublishStatus)
  status?: PublishStatus;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
