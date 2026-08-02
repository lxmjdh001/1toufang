import { ApiProperty } from "@nestjs/swagger";
import { TeamStatus, TeamType } from "@1toufang/database/client";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateTeamDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiProperty({ required: false, enum: TeamType })
  @IsOptional()
  @IsEnum(TeamType)
  type?: TeamType;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  seatLimit?: number;

  @ApiProperty({ required: false, enum: TeamStatus })
  @IsOptional()
  @IsEnum(TeamStatus)
  status?: TeamStatus;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTeamDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @ApiProperty({ required: false, enum: TeamType })
  @IsOptional()
  @IsEnum(TeamType)
  type?: TeamType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  seatLimit?: number;

  @ApiProperty({ required: false, enum: TeamStatus })
  @IsOptional()
  @IsEnum(TeamStatus)
  status?: TeamStatus;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class AddTeamMemberDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleId?: string;
}
