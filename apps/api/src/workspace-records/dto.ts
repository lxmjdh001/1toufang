import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export const workspaceModules = [
  "optimizer",
  "copilot",
  "store",
  "tool",
  "newsletter",
  "billing",
  "referral-link",
  "commission",
  "withdrawal",
  "vcc"
] as const;

export type WorkspaceModule = (typeof workspaceModules)[number];

export class CreateWorkspaceRecordDto {
  @ApiProperty({ enum: workspaceModules })
  @IsString()
  @IsIn(workspaceModules)
  module: WorkspaceModule;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateWorkspaceRecordDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class WorkspaceRecordActionDto {
  @ApiProperty({ enum: ["activate", "pause", "run", "send", "archive", "restore", "duplicate"] })
  @IsString()
  @IsIn(["activate", "pause", "run", "send", "archive", "restore", "duplicate"])
  action: string;
}
