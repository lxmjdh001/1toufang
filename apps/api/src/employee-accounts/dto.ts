import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CreateEmployeeAccountDto {
  @ApiProperty()
  @IsString()
  employeeNo: string;

  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsString()
  teamId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleId?: string;
}

export class UpdateEmployeeAccountDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleId?: string;
}
