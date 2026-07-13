import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export class CreateDomainDto {
  @ApiProperty()
  @IsString()
  domain: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamId?: string;
}

export class UpdateDomainDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
