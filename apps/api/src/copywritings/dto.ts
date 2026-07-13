import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";

export class CreateCopywritingDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  primaryText: string;

  @ApiProperty()
  @IsString()
  headline: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamId?: string;
}

export class UpdateCopywritingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  primaryText?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class GenerateCopywritingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  product?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  offer?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  source?: string;
}
