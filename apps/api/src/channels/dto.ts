import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";

const facebookActions = [
  "change_name",
  "edit",
  "check_compliance",
  "force_clear",
  "remove",
  "switch_facebook",
  "charge",
  "archive",
  "pending_recycle"
] as const;

export type FacebookAccountAction = (typeof facebookActions)[number];

export class FacebookAccountActionDto {
  @ApiProperty({ enum: facebookActions })
  @IsIn(facebookActions)
  action: FacebookAccountAction;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
