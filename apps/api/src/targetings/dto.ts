import { ApiProperty } from "@nestjs/swagger";
import { Platform } from "@1toufang/database/client";
import { IsArray, IsEnum, IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class CreateTargetingDto {
  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ type: Object })
  @IsObject()
  config: Record<string, unknown>;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamId?: string;
}

export class UpdateTargetingDto {
  @ApiProperty({ enum: Platform, required: false })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

const targetingOptionKinds = [
  "countries",
  "regions",
  "cities",
  "languages",
  "interests",
  "demographics",
  "behaviors"
] as const;

export class TargetingOptionsQueryDto {
  @ApiProperty({ enum: Platform, required: false })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiProperty({ enum: targetingOptionKinds })
  @IsIn(targetingOptionKinds)
  kind: (typeof targetingOptionKinds)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  q?: string;
}

export class EstimateTargetingDto {
  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({ type: Object })
  @IsObject()
  config: Record<string, unknown>;
}
