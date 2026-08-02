import { ApiProperty } from "@nestjs/swagger";
import { TeamType } from "@1toufang/database/client";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

export class ApproveUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  employeeNo?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  accessExpiresAt?: string | null;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTeamCount?: number;

  @ApiProperty({ required: false, enum: TeamType })
  @IsOptional()
  @IsEnum(TeamType)
  teamType?: TeamType;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  seatLimit?: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  teamExpiresAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamNotes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reviewNotes?: string;

  @ApiProperty({ required: false, description: "Temporary until auth guards attach actor id" })
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class UpdateUserAccessDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  accessExpiresAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTeamCount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false, description: "Temporary until auth guards attach actor id" })
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class RejectUserDto {
  @ApiProperty()
  @IsString()
  reviewNotes: string;

  @ApiProperty({ required: false, description: "Temporary until auth guards attach actor id" })
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class SetUserStatusDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false, description: "Temporary until auth guards attach actor id" })
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class AssignRoleDto {
  @ApiProperty()
  @IsString()
  teamId: string;

  @ApiProperty()
  @IsString()
  roleId: string;
}
