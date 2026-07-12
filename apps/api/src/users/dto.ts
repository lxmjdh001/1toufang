import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reviewNotes?: string;

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
