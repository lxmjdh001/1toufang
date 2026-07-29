import { ApiProperty } from "@nestjs/swagger";
import { Platform, PublishStatus } from "@1toufang/database/client";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString
} from "class-validator";

class CampaignTemplateDto {
  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty()
  @IsString()
  name: string;

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

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  project?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pageAssetId?: string;

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
  domainId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customDomain?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adSetupMode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  existingPostId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  splitTest?: boolean;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  optimizerIds?: string[];

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aiAssistantIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lifecycleStatus?: string;

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

export class CreateCampaignDto extends CampaignTemplateDto {
  @ApiProperty()
  @IsString()
  adAccountId: string;
}

export class CreateCampaignBatchDto extends CampaignTemplateDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  adAccountIds: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
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

export class UpdateCampaignBudgetDto {
  @ApiProperty()
  @IsNumber()
  dailyBudget: number;
}

export class BulkCampaignActionDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({
    enum: ["retry_publish", "stop_selected", "start_selected", "delete_selected", "modify_daily_budget", "update_config"]
  })
  @IsIn(["retry_publish", "stop_selected", "start_selected", "delete_selected", "modify_daily_budget", "update_config"])
  action:
    | "retry_publish"
    | "stop_selected"
    | "start_selected"
    | "delete_selected"
    | "modify_daily_budget"
    | "update_config";

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  dailyBudget?: number;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
