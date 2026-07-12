import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpdatePlatformConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  appSecret?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  clearAppSecret?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  apiVersion?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  apiBaseUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  environment?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class RevealPlatformSecretDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
