import {
  IsEmail, IsEnum, IsHexColor, IsOptional, IsString, Length, MaxLength,
} from "class-validator";

/**
 * Everything optional, and the slug can never change: it is a public URL.
 * Every field needs a validator: the API rejects any property that has none (forbidNonWhitelisted).
 */
export class UpdateRestaurantDto {
  @IsOptional() @IsString() @Length(2, 120)
  name?: string;

  @IsOptional() @IsString() @Length(3, 3)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(64)
  timezone?: string;

  @IsOptional() @IsString() @Length(2, 5)
  locale?: string;

  @IsOptional() @IsEmail() @MaxLength(320)
  contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(40)
  contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(200)
  addressLine?: string;

  @IsOptional() @IsString() @MaxLength(120)
  city?: string;

  @IsOptional() @IsString() @Length(2, 2)
  country?: string;

  @IsOptional() @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsEnum(["ACTIVE", "SUSPENDED", "ARCHIVED"])
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}
