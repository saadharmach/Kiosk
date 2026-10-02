import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateKioskDto {
  @IsString() @MinLength(1) @MaxLength(60)
  name!: string;
}

export class UpdateKioskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60)
  name?: string;

  @IsOptional() @IsBoolean()
  isEnabled?: boolean;
}
